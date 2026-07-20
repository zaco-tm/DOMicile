use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

pub use crate::serve::watcher::{WatchEvent, WatchEventKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Debouncer {
    pub(crate) window: Duration,
    pending: HashMap<PathBuf, WatchEvent>,
    deadline: Option<Instant>,
}

impl Debouncer {
    fn kind_rank(k: WatchEventKind) -> u8 {
        match k {
            WatchEventKind::Removed => 3,
            WatchEventKind::Modified => 2,
            WatchEventKind::Created => 1,
            WatchEventKind::Any => 0,
        }
    }

    fn flush_pending(&mut self) -> Vec<WatchEvent> {
        self.deadline = None;
        std::mem::take(&mut self.pending).into_values().collect()
    }
}

impl Debouncer {
    pub fn new(window: Duration) -> Self {
        Self {
            window,
            pending: HashMap::new(),
            deadline: None,
        }
    }

    /// Record a `WatchEvent`. Returns the emit batch when the window closes
    /// at this call, otherwise empty. Idempotent w.r.t. empty input.
    pub fn push(&mut self, ev: WatchEvent, now: Instant) -> Vec<WatchEvent> {
        let rank_self = Self::kind_rank(ev.kind);
        for p in ev.paths.iter() {
            let entry = self.pending.entry(p.clone());
            use std::collections::hash_map::Entry;
            match entry {
                Entry::Occupied(mut o) => {
                    if Self::kind_rank(o.get().kind) <= rank_self {
                        o.insert(ev.clone());
                    }
                }
                Entry::Vacant(v) => {
                    v.insert(ev.clone());
                }
            }
        }
        if self.deadline.is_none() {
            self.deadline = Some(now + self.window);
        }
        if self.deadline.is_some_and(|d| now >= d) {
            self.flush_pending()
        } else {
            Vec::new()
        }
    }

    /// Tick the timer. Returns the emit batch when the window closes now.
    pub fn tick(&mut self, now: Instant) -> Vec<WatchEvent> {
        if self.deadline.is_some_and(|d| now >= d) {
            self.flush_pending()
        } else {
            Vec::new()
        }
    }
}

#[cfg(test)]
mod debouncer_tests {
    use super::*;
    use crate::serve::watcher::{WatchEvent, WatchEventKind};
    use std::collections::HashMap;
    use std::time::{Duration, Instant};

    fn ev(kind: WatchEventKind, name: &str) -> WatchEvent {
        WatchEvent {
            kind,
            paths: vec![PathBuf::from(name)],
        }
    }

    fn t(secs: u64) -> Instant {
        // Cached base (OnceLock) so every `t(secs)` call inside a single test
        // anchors to the same Instant — without it, the 200ms-window boundary
        // tests are racy (push and tick capture `Instant::now()` microseconds
        // apart).
        base() + Duration::from_secs(secs)
    }

    fn base() -> Instant {
        use std::sync::OnceLock;
        static BASE: OnceLock<Instant> = OnceLock::new();
        *BASE.get_or_init(Instant::now)
    }

    #[test]
    fn empty_window_emits_nothing() {
        let mut d = Debouncer::new(Duration::from_millis(200));
        assert!(
            d.tick(t(0)).is_empty(),
            "no events recorded → tick is a no-op"
        );
        assert!(d.tick(t(10)).is_empty());
    }

    #[test]
    fn push_within_window_returns_empty() {
        let mut d = Debouncer::new(Duration::from_millis(200));
        let out = d.push(ev(WatchEventKind::Modified, "/a.html"), t(0));
        assert!(
            out.is_empty(),
            "first push starts the window but doesn't flush immediately"
        );
        let out = d.push(
            ev(WatchEventKind::Modified, "/a.html"),
            t(0) + Duration::from_millis(50),
        );
        assert!(out.is_empty(), "second push within window is silent");
    }

    #[test]
    fn tick_at_deadline_flushes() {
        let mut d = Debouncer::new(Duration::from_millis(200));
        d.push(ev(WatchEventKind::Modified, "/a.html"), t(0));
        let out = d.tick(t(0) + Duration::from_millis(199));
        assert!(out.is_empty(), "199ms < 200ms deadline");
        let out = d.tick(t(0) + Duration::from_millis(200));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, WatchEventKind::Modified);
        assert_eq!(out[0].paths, vec![PathBuf::from("/a.html")]);
    }

    #[test]
    fn repeated_modified_collapses_to_one() {
        let mut d = Debouncer::new(Duration::from_millis(200));
        for i in 0..5 {
            d.push(
                ev(WatchEventKind::Modified, "/a.html"),
                t(0) + Duration::from_millis(i * 20),
            );
        }
        let out = d.tick(t(0) + Duration::from_millis(250));
        assert_eq!(out.len(), 1, "5 rapid Modified events collapse to 1");
        assert_eq!(out[0].kind, WatchEventKind::Modified);
    }

    #[test]
    fn newest_kind_wins() {
        let mut d = Debouncer::new(Duration::from_millis(200));
        d.push(ev(WatchEventKind::Created, "/a.html"), t(0));
        d.push(
            ev(WatchEventKind::Modified, "/a.html"),
            t(0) + Duration::from_millis(50),
        );
        d.push(
            ev(WatchEventKind::Removed, "/a.html"),
            t(0) + Duration::from_millis(100),
        );
        d.push(
            ev(WatchEventKind::Modified, "/a.html"),
            t(0) + Duration::from_millis(150),
        );
        let out = d.tick(t(0) + Duration::from_millis(200));
        assert_eq!(out.len(), 1);
        assert_eq!(
            out[0].kind,
            WatchEventKind::Removed,
            "Removed (rank 3) beats Modified (rank 2) regardless of arrival order"
        );
    }

    #[test]
    fn old_does_not_overwrite_newer_high_rank() {
        // Modified (2) first, Removed (3) second → second wins.
        let mut d = Debouncer::new(Duration::from_millis(200));
        d.push(ev(WatchEventKind::Modified, "/a.html"), t(0));
        d.push(
            ev(WatchEventKind::Removed, "/a.html"),
            t(0) + Duration::from_millis(50),
        );
        let out = d.tick(t(0) + Duration::from_millis(200));
        assert_eq!(out[0].kind, WatchEventKind::Removed);
    }

    #[test]
    fn gap_clears_window() {
        let mut d = Debouncer::new(Duration::from_millis(200));
        d.push(ev(WatchEventKind::Modified, "/a.html"), t(0));
        let mut out = d.tick(t(0) + Duration::from_millis(200));
        assert_eq!(out.len(), 1, "first window flushes");
        out.clear();
        // 250ms gap → new window.
        d.push(
            ev(WatchEventKind::Modified, "/b.html"),
            t(0) + Duration::from_millis(250),
        );
        out = d.tick(t(0) + Duration::from_millis(450));
        assert_eq!(out.len(), 1, "second window flushes independently");
        assert_eq!(out[0].paths, vec![PathBuf::from("/b.html")]);
    }

    #[test]
    fn distinct_paths_both_emit() {
        let mut d = Debouncer::new(Duration::from_millis(200));
        d.push(ev(WatchEventKind::Modified, "/a.html"), t(0));
        d.push(
            ev(WatchEventKind::Modified, "/b.html"),
            t(0) + Duration::from_millis(50),
        );
        let out = d.tick(t(0) + Duration::from_millis(200));
        let kinds: HashMap<PathBuf, WatchEventKind> = out
            .into_iter()
            .map(|e| (e.paths[0].clone(), e.kind))
            .collect();
        assert_eq!(kinds.len(), 2);
        assert_eq!(kinds[&PathBuf::from("/a.html")], WatchEventKind::Modified);
        assert_eq!(kinds[&PathBuf::from("/b.html")], WatchEventKind::Modified);
    }
}
