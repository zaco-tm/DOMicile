//! Iter-watcher state machine.
//!
//! Sits next to `watcher.rs` and `file_change.rs` in `crate::serve`. Consumes
//! the `Watcher` trait and emits `agent-iterating` events on per-doc state
//! transitions. It does not replace `FileChangeBroadcaster`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use tokio::sync::broadcast;

use crate::events::{Event, EventData, Kind, Source, Target};
use crate::serve::watcher::Watcher;

/// Configuration for `IterWatcher`. All durations are milliseconds.
#[derive(Debug, Clone, Copy)]
pub struct IterConfig {
    pub quiescence_ms: u32,
    pub max_duration_ms: u32,
}

impl Default for IterConfig {
    fn default() -> Self {
        Self {
            quiescence_ms: 1_500,
            max_duration_ms: 30_000,
        }
    }
}

struct PerDoc {
    started_at: Instant,
    last_modified: Instant,
}

pub struct IterWatcher<W: Watcher> {
    inner: W,
    root: PathBuf,
    state_dir: PathBuf,
    config: IterConfig,
    broadcaster: broadcast::Sender<Event>,
    state: HashMap<String, PerDoc>,
    now: Instant,
}

impl<W: Watcher> IterWatcher<W> {
    pub fn new(
        inner: W,
        root: PathBuf,
        state_dir: PathBuf,
        config: IterConfig,
        broadcaster: broadcast::Sender<Event>,
        now: Instant,
    ) -> Self {
        let root = root.canonicalize().unwrap_or(root);
        let state_dir = state_dir.canonicalize().unwrap_or(state_dir);
        Self {
            inner,
            root,
            state_dir,
            config,
            broadcaster,
            state: HashMap::new(),
            now,
        }
    }

    pub fn broadcaster(&self) -> &broadcast::Sender<Event> {
        &self.broadcaster
    }

    /// Returns the document name for HTML beneath the served root.
    pub fn classify(&self, path: &Path) -> Option<String> {
        if path.starts_with(&self.state_dir) {
            return None;
        }
        if path.extension().and_then(|extension| extension.to_str()) != Some("html") {
            return None;
        }
        let relative = path.strip_prefix(&self.root).ok()?;
        Some(relative.file_stem()?.to_string_lossy().into_owned())
    }

    /// Drains pending file events and advances per-document iteration state.
    pub fn tick(&mut self, now: Instant) -> Vec<(String, Event)> {
        self.now = now;
        let mut events = Vec::new();

        while let Ok(Some(event)) = self.inner.next_event(0) {
            for path in &event.paths {
                if let Some(document) = self.classify(path) {
                    if let Some(start_event) = self.on_modify(&document, now) {
                        let _ = self.broadcaster.send(start_event.clone());
                        events.push((document, start_event));
                    }
                }
            }
        }

        let finished: Vec<String> = self
            .state
            .iter()
            .filter(|(_, per_doc)| {
                now.duration_since(per_doc.last_modified)
                    >= Duration::from_millis(u64::from(self.config.quiescence_ms))
                    || now.duration_since(per_doc.started_at)
                        >= Duration::from_millis(u64::from(self.config.max_duration_ms))
            })
            .map(|(document, _)| document.clone())
            .collect();

        for document in finished {
            self.state.remove(&document);
            let end_event = self.make_event(&document, "end", "watcher");
            let _ = self.broadcaster.send(end_event.clone());
            events.push((document, end_event));
        }
        events
    }

    fn on_modify(&mut self, document: &str, now: Instant) -> Option<Event> {
        match self.state.get_mut(document) {
            None => {
                self.state.insert(
                    document.to_string(),
                    PerDoc {
                        started_at: now,
                        last_modified: now,
                    },
                );
                Some(self.make_event(document, "start", "watcher"))
            }
            Some(per_doc) => {
                per_doc.last_modified = now;
                None
            }
        }
    }

    fn make_event(&self, document: &str, state: &str, source: &str) -> Event {
        Event {
            v: 2,
            id: ulid::Ulid::new(),
            ts: chrono::Utc::now(),
            src: Source::Server,
            doc: document.to_string(),
            kind: Kind::AgentIterating,
            target: Target {
                id: None,
                selector: None,
                rect: crate::events::Rect {
                    x: 0.0,
                    y: 0.0,
                    w: 0.0,
                    h: 0.0,
                },
            },
            data: EventData::AgentIterating {
                state: state.into(),
                source: source.into(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::serve::watcher::{MockWatcher, WatchEvent, WatchEventKind};

    fn broadcaster() -> (broadcast::Sender<Event>, broadcast::Receiver<Event>) {
        broadcast::channel(64)
    }

    fn root() -> PathBuf {
        PathBuf::from("/output")
    }

    fn state_dir() -> PathBuf {
        PathBuf::from("/output/.state")
    }

    fn watcher_with(
        inner: MockWatcher,
        config: IterConfig,
        now: Instant,
    ) -> IterWatcher<MockWatcher> {
        let (sender, _receiver) = broadcaster();
        IterWatcher::new(inner, root(), state_dir(), config, sender, now)
    }

    fn modify(path: &str) -> WatchEvent {
        WatchEvent {
            kind: WatchEventKind::Modified,
            paths: vec![PathBuf::from(path)],
        }
    }

    #[test]
    fn classify_drops_state_dir() {
        let watcher = watcher_with(MockWatcher::new(), IterConfig::default(), Instant::now());
        assert_eq!(
            watcher.classify(Path::new("/output/.state/events.jsonl")),
            None
        );
    }

    #[test]
    fn classify_drops_non_html() {
        let watcher = watcher_with(MockWatcher::new(), IterConfig::default(), Instant::now());
        assert_eq!(watcher.classify(Path::new("/output/foo.css")), None);
        assert_eq!(watcher.classify(Path::new("/output/foo.json")), None);
    }

    #[test]
    fn classify_derives_doc_from_html_stem() {
        let watcher = watcher_with(MockWatcher::new(), IterConfig::default(), Instant::now());
        assert_eq!(
            watcher.classify(Path::new("/output/foo.html")),
            Some("foo".to_string())
        );
        assert_eq!(
            watcher.classify(Path::new("/output/sub/bar.html")),
            Some("bar".to_string())
        );
    }

    #[test]
    fn first_modify_emits_start_after_tick() {
        let now = Instant::now();
        let mut inner = MockWatcher::new();
        inner.push(modify("/output/foo.html"));
        let (sender, mut receiver) = broadcaster();
        let mut watcher = IterWatcher::new(
            inner,
            root(),
            state_dir(),
            IterConfig::default(),
            sender,
            now,
        );

        let events = watcher.tick(now);

        let broadcast = receiver.try_recv().expect("start event broadcast");
        assert_eq!(events.len(), 1);
        assert_eq!(broadcast, events[0].1);
        assert_eq!(events[0].0, "foo");
        assert_eq!(events[0].1.kind, Kind::AgentIterating);
        match &events[0].1.data {
            EventData::AgentIterating { state, source } => {
                assert_eq!(state, "start");
                assert_eq!(source, "watcher");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn end_emitted_after_quiescence() {
        let now = Instant::now();
        let mut inner = MockWatcher::new();
        inner.push(modify("/output/foo.html"));
        let mut watcher = watcher_with(
            inner,
            IterConfig {
                quiescence_ms: 100,
                max_duration_ms: 10_000,
            },
            now,
        );
        watcher.tick(now);

        let events = watcher.tick(now + Duration::from_millis(150));

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].0, "foo");
        match &events[0].1.data {
            EventData::AgentIterating { state, source } => {
                assert_eq!(state, "end");
                assert_eq!(source, "watcher");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn end_emitted_at_hard_timeout() {
        let now = Instant::now();
        let mut inner = MockWatcher::new();
        inner.push(modify("/output/foo.html"));
        let mut watcher = watcher_with(
            inner,
            IterConfig {
                quiescence_ms: 10_000,
                max_duration_ms: 100,
            },
            now,
        );
        watcher.tick(now);

        let events = watcher.tick(now + Duration::from_millis(150));

        assert_eq!(events.len(), 1);
        match &events[0].1.data {
            EventData::AgentIterating { state, .. } => assert_eq!(state, "end"),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn multi_doc_independent() {
        let now = Instant::now();
        let mut inner = MockWatcher::new();
        inner.push(modify("/output/a.html"));
        inner.push(modify("/output/b.html"));
        let mut watcher = watcher_with(inner, IterConfig::default(), now);

        let events = watcher.tick(now);

        assert_eq!(events.len(), 2);
        let documents: Vec<&str> = events
            .iter()
            .map(|(document, _)| document.as_str())
            .collect();
        assert!(documents.contains(&"a"));
        assert!(documents.contains(&"b"));
    }

    #[test]
    fn notify_watcher_emits_iter_events() {
        use crate::serve::watcher::NotifyWatcher;

        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        let state_dir = root.join("state");
        std::fs::create_dir_all(&state_dir).unwrap();
        let inner = NotifyWatcher::new(root, 50).expect("watcher created");
        let (sender, mut receiver) = broadcaster();
        let mut watcher = IterWatcher::new(
            inner,
            root.to_path_buf(),
            state_dir,
            IterConfig {
                quiescence_ms: 200,
                max_duration_ms: 5_000,
            },
            sender,
            Instant::now(),
        );
        watcher.tick(Instant::now());
        std::fs::write(root.join("foo.html"), "<h1>x</h1>").unwrap();

        let deadline = Instant::now() + Duration::from_secs(3);
        let mut got_start = false;
        while Instant::now() < deadline && !got_start {
            got_start = watcher.tick(Instant::now()).into_iter().any(|(_, event)| {
                matches!(event.data, EventData::AgentIterating { ref state, .. } if state == "start")
            });
            if !got_start {
                std::thread::sleep(Duration::from_millis(50));
            }
        }

        assert!(got_start, "no start event within 3s");
        assert!(matches!(
            receiver.try_recv().expect("broadcast start event").data,
            EventData::AgentIterating { state, .. } if state == "start"
        ));
    }
}
