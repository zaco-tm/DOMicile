//! File-change detection: classifier + debouncer + broadcaster.
//!
//! This module is the public entrypoint for the file-watcher→WS auto-reload
//! pipeline. It re-exports the lower-level building blocks from [`classify`]
//! (path → `ReloadTarget`) and [`debouncer`] (coalesce a burst into a single
//! emission per path), and adds [`FileChange`] (the broadcast payload) plus
//! [`FileChangeBroadcaster`] (the live loop wiring it all together).

pub use crate::serve::classify::{classify, ReloadTarget};
pub use crate::serve::debouncer::{Debouncer, WatchEvent, WatchEventKind};

use std::path::PathBuf;
use std::time::Duration;
use tokio::sync::broadcast;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileChange {
    pub path: PathBuf,
    pub target: ReloadTarget,
}

pub struct FileChangeBroadcaster {
    pub(crate) watcher: Box<dyn crate::serve::watcher::Watcher>,
    root: PathBuf,
    state_dir: PathBuf,
    pub(crate) debounce: Debouncer,
    pub(crate) tx: broadcast::Sender<FileChange>,
}

impl FileChangeBroadcaster {
    pub fn new(
        watcher: Box<dyn crate::serve::watcher::Watcher>,
        root: PathBuf,
        state_dir: PathBuf,
        window: Duration,
        tx: broadcast::Sender<FileChange>,
    ) -> Self {
        Self {
            watcher,
            root,
            state_dir,
            debounce: Debouncer::new(window),
            tx,
        }
    }

    pub async fn run(mut self) {
        let mut next_tick = tokio::time::Instant::now() + self.debounce.window;
        loop {
            tokio::select! {
                biased;
                _ = tokio::time::sleep_until(next_tick) => {
                    let now = std::time::Instant::now();
                    let batch = self.debounce.tick(now);
                    for ev in batch {
                        for p in ev.paths {
                            if let Some(target) = classify(&p, &self.root, &self.state_dir) {
                                tracing::debug!(path = %p.display(), target = ?target, "file change");
                                let path = match &target {
                                    ReloadTarget::MatchingPath(r) | ReloadTarget::AllTabs(r) => r.clone(),
                                };
                                let _ = self.tx.send(FileChange { path, target });
                            }
                        }
                    }
                    next_tick = tokio::time::Instant::now() + self.debounce.window;
                }
                ev = async {
                    let result = self.watcher.next_event(50);
                    if let Ok(Some(e)) = result {
                        Ok::<crate::serve::watcher::WatchEvent, ()>(e)
                    } else {
                        // Yield to the runtime so other tasks (notably the
                        // test's `rx.recv()`) get a chance. Without this,
                        // a fast-returning MockWatcher causes a busy loop
                        // that starves the runtime on a single-threaded
                        // tokio::test runtime. Production NotifyWatcher
                        // blocks up to 50ms anyway, so this is a no-op there.
                        tokio::time::sleep(Duration::from_millis(10)).await;
                        Err(())
                    }
                } => {
                    if let Ok(ev) = ev {
                        let now = std::time::Instant::now();
                        for f in self.debounce.push(ev, now) {
                            for p in f.paths {
                                if let Some(target) = classify(&p, &self.root, &self.state_dir) {
                                    tracing::debug!(path = %p.display(), target = ?target, "file change (flush-on-push)");
                                    let path = match &target {
                                        ReloadTarget::MatchingPath(r) | ReloadTarget::AllTabs(r) => r.clone(),
                                    };
                                    let _ = self.tx.send(FileChange { path, target });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod broadcaster_tests {
    use super::*;
    use crate::serve::watcher::{MockWatcher, WatchEventKind};
    use tempfile::tempdir;
    use tokio::time::sleep;

    fn setup() -> (
        tempfile::TempDir,
        PathBuf,
        PathBuf,
        tokio::sync::broadcast::Sender<FileChange>,
        tokio::sync::broadcast::Receiver<FileChange>,
    ) {
        let dir = tempdir().unwrap();
        let root = dir.path().join("root");
        let state = dir.path().join("state");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&state).unwrap();
        let (tx, rx) = tokio::sync::broadcast::channel(16);
        (dir, root, state, tx, rx)
    }

    #[tokio::test]
    async fn broadcasts_matching_path_for_html_change() {
        let (_tmp, root, state, tx, mut rx) = setup();

        // Create the HTML file first so canonicalize works.
        let html = root.join("index.html");
        std::fs::write(&html, b"<h1>hi</h1>").unwrap();

        let mut mw = MockWatcher::new();
        mw.push(crate::serve::watcher::WatchEvent {
            kind: WatchEventKind::Modified,
            paths: vec![html.clone()],
        });

        let bc =
            FileChangeBroadcaster::new(Box::new(mw), root, state, Duration::from_millis(50), tx);
        let handle = tokio::spawn(bc.run());

        let change = tokio::time::timeout(Duration::from_millis(500), rx.recv())
            .await
            .expect("timed out")
            .expect("closed");

        handle.abort();

        assert_eq!(change.path, PathBuf::from("index.html"));
        assert_eq!(
            change.target,
            ReloadTarget::MatchingPath(PathBuf::from("index.html"))
        );
    }

    #[tokio::test]
    async fn broadcasts_all_tabs_for_css_change() {
        let (_tmp, root, state, tx, mut rx) = setup();

        let css = root.join("style.css");
        std::fs::write(&css, b"body{}").unwrap();

        let mut mw = MockWatcher::new();
        mw.push(crate::serve::watcher::WatchEvent {
            kind: WatchEventKind::Modified,
            paths: vec![css.clone()],
        });

        let bc =
            FileChangeBroadcaster::new(Box::new(mw), root, state, Duration::from_millis(50), tx);
        let handle = tokio::spawn(bc.run());

        let change = tokio::time::timeout(Duration::from_millis(500), rx.recv())
            .await
            .expect("timed out")
            .expect("closed");

        handle.abort();

        assert_eq!(
            change.target,
            ReloadTarget::AllTabs(PathBuf::from("style.css"))
        );
    }

    #[tokio::test]
    async fn coalesces_flurry_of_events_for_same_path() {
        let (_tmp, root, state, tx, mut rx) = setup();

        let html = root.join("a.html");
        std::fs::write(&html, b"x").unwrap();

        let mut mw = MockWatcher::new();
        for _ in 0..5 {
            mw.push(crate::serve::watcher::WatchEvent {
                kind: WatchEventKind::Modified,
                paths: vec![html.clone()],
            });
        }

        let bc =
            FileChangeBroadcaster::new(Box::new(mw), root, state, Duration::from_millis(200), tx);
        let handle = tokio::spawn(bc.run());

        // Wait long enough for the burst + debounce window to settle.
        sleep(Duration::from_millis(500)).await;

        let first = rx.try_recv().expect("at least one broadcast");
        assert_eq!(
            first.target,
            ReloadTarget::MatchingPath(PathBuf::from("a.html"))
        );
        // No more broadcasts (5 events collapsed to 1).
        assert!(rx.try_recv().is_err(), "no further broadcasts");

        handle.abort();
    }
}
