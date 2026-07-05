use std::collections::VecDeque;
use std::io;
use std::path::PathBuf;

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
}