use std::collections::VecDeque;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError};

use notify::{Event as NotifyEvent, EventKind, RecommendedWatcher, RecursiveMode, Watcher as NotifyWatcherTrait};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchEvent {
    pub kind: WatchEventKind,
    pub paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatchEventKind {
    Created,
    Modified,
    Removed,
    Any,
}

pub trait Watcher: Send {
    fn next_event(&mut self, timeout_ms: u32) -> io::Result<Option<WatchEvent>>;
}

pub struct MockWatcher {
    evs: VecDeque<WatchEvent>,
}

impl MockWatcher {
    pub fn new() -> Self {
        Self { evs: VecDeque::new() }
    }

    pub fn push(&mut self, ev: WatchEvent) {
        self.evs.push_back(ev);
    }
}

impl Watcher for MockWatcher {
    fn next_event(&mut self, _timeout_ms: u32) -> io::Result<Option<WatchEvent>> {
        Ok(self.evs.pop_front())
    }
}

pub struct NotifyWatcher {
    _impl: RecommendedWatcher,
    rx: std::sync::mpsc::Receiver<io::Result<NotifyEvent>>,
    root: PathBuf,
}

impl NotifyWatcher {
    pub fn new(root: &Path, coalesce_ms: u32) -> io::Result<Self> {
        let (tx, rx) = channel();
        let mut impl_ = RecommendedWatcher::new(
            move |res: notify::Result<NotifyEvent>| {
                let _ = tx.send(res.map_err(|e| io::Error::other(e.to_string())));
            },
            notify::Config::default()
                .with_poll_interval(std::time::Duration::from_millis(coalesce_ms.max(10) as u64)),
        )
        .map_err(|e| io::Error::other(e.to_string()))?;
        impl_
            .watch(root, RecursiveMode::Recursive)
            .map_err(|e| io::Error::other(e.to_string()))?;
        Ok(Self {
            _impl: impl_,
            rx,
            root: root.to_path_buf(),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}

fn map_kind(k: EventKind) -> WatchEventKind {
    match k {
        EventKind::Create(_) => WatchEventKind::Created,
        EventKind::Modify(_) => WatchEventKind::Modified,
        EventKind::Remove(_) => WatchEventKind::Removed,
        _ => WatchEventKind::Any,
    }
}

impl Watcher for NotifyWatcher {
    fn next_event(&mut self, timeout_ms: u32) -> io::Result<Option<WatchEvent>> {
        let recv = self
            .rx
            .recv_timeout(std::time::Duration::from_millis(timeout_ms as u64));
        match recv {
            Ok(Ok(ev)) => Ok(Some(WatchEvent {
                kind: map_kind(ev.kind),
                paths: ev.paths,
            })),
            Ok(Err(e)) => Err(e),
            Err(RecvTimeoutError::Timeout) => Ok(None),
            Err(RecvTimeoutError::Disconnected) => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_yields_pushed_events_in_order() {
        let mut w = MockWatcher::new();
        let ev_a = WatchEvent { kind: WatchEventKind::Created, paths: vec![PathBuf::from("/a")] };
        let ev_b = WatchEvent { kind: WatchEventKind::Removed, paths: vec![PathBuf::from("/b")] };
        w.push(ev_a.clone());
        w.push(ev_b.clone());
        assert_eq!(w.next_event(0).unwrap(), Some(ev_a));
        assert_eq!(w.next_event(0).unwrap(), Some(ev_b));
        assert_eq!(w.next_event(0).unwrap(), None);
    }

    #[test]
    fn mock_returns_none_when_empty_regardless_of_timeout() {
        let mut w = MockWatcher::new();
        assert_eq!(w.next_event(0).unwrap(), None);
        assert_eq!(w.next_event(1000).unwrap(), None);
    }

    #[test]
    fn watch_event_partial_eq() {
        let ev1 = WatchEvent { kind: WatchEventKind::Modified, paths: vec![PathBuf::from("/x")] };
        let ev2 = WatchEvent { kind: WatchEventKind::Modified, paths: vec![PathBuf::from("/x")] };
        assert_eq!(ev1, ev2);
    }

    #[test]
    #[ignore = "flaky in CI on macOS FSEvents; run with --ignored to verify manually"]
    fn notify_watcher_emits_event_on_create() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut w = NotifyWatcher::new(root, 50).expect("watcher created");
        std::thread::sleep(std::time::Duration::from_millis(50));
        std::fs::write(root.join("new.html"), "<h1>x</h1>").unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        let mut got = None;
        while std::time::Instant::now() < deadline {
            match w.next_event(100) {
                Ok(Some(ev)) => {
                    if ev.paths.iter().any(|p| p.ends_with("new.html")) {
                        got = Some(ev);
                        break;
                    }
                    // FSEvents on macOS emits a synthetic root-directory event first;
                    // keep draining until we see the file we wrote.
                }
                Ok(None) => continue,
                Err(e) => panic!("watcher errored: {e}"),
            }
        }
        let ev = got.expect("watcher emitted a new.html event within 2s");
        assert!(ev.paths.iter().any(|p| p.ends_with("new.html")));
    }
}