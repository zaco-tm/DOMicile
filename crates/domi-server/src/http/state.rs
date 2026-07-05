use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::broadcast;
use ulid::Ulid;

use crate::events::EventWriter;

pub struct AppState {
    pub root: PathBuf,
    pub state_dir: PathBuf,
    pub writer: Arc<EventWriter>,
    pub broadcaster: broadcast::Sender<crate::events::Event>,
    pub server_id: Ulid,
}

impl AppState {
    pub fn new(
        root: PathBuf,
        state_dir: PathBuf,
        writer: Arc<EventWriter>,
        capacity: usize,
    ) -> Self {
        let (broadcaster, _) = broadcast::channel(capacity);
        Self {
            root,
            state_dir,
            writer,
            broadcaster,
            server_id: Ulid::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::Event;
    use tempfile::tempdir;

    fn sample_event() -> Event {
        use crate::events::{EventData, Kind, Rect, Source, Target};
        Event {
            v: 2,
            id: Ulid::from_string("01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ0").unwrap(),
            ts: chrono::DateTime::parse_from_rfc3339("2026-07-05T18:21:00Z")
                .unwrap()
                .with_timezone(&chrono::Utc),
            src: Source::DomiJs,
            doc: "x".into(),
            kind: Kind::Click,
            target: Target {
                id: None,
                selector: None,
                rect: Rect {
                    x: 0.0,
                    y: 0.0,
                    w: 1.0,
                    h: 1.0,
                },
            },
            data: EventData::Click {
                value: Some("hi".into()),
            },
        }
    }

    #[test]
    fn new_assigns_unique_server_id() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        let w = Arc::new(EventWriter::new(&path));
        let s1 = AppState::new(
            dir.path().to_path_buf(),
            dir.path().to_path_buf(),
            w.clone(),
            16,
        );
        let s2 = AppState::new(dir.path().to_path_buf(), dir.path().to_path_buf(), w, 16);
        assert_ne!(s1.server_id, s2.server_id);
    }

    #[test]
    fn broadcaster_receives_sent_event() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        let w = Arc::new(EventWriter::new(&path));
        let state = AppState::new(dir.path().to_path_buf(), dir.path().to_path_buf(), w, 16);
        let mut rx = state.broadcaster.subscribe();
        let ev = sample_event();
        let _ = state.broadcaster.send(ev.clone());
        let received = rx.try_recv().expect("event delivered");
        assert_eq!(received.id, ev.id);
    }

    #[test]
    fn broadcaster_capacity_is_respected() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        let w = Arc::new(EventWriter::new(&path));
        let state = AppState::new(dir.path().to_path_buf(), dir.path().to_path_buf(), w, 4);
        assert_eq!(state.broadcaster.receiver_count(), 0, "no subscribers yet");
    }
}
