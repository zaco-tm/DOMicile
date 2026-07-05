use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use fs2::FileExt;

use crate::events::event::Event;

const DEFAULT_SIZE_CAP: u64 = 50 * 1024 * 1024;

#[derive(Debug)]
#[non_exhaustive]
pub enum WriteError {
    Io(std::io::Error),
    LockBusy,
}

impl std::fmt::Display for WriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WriteError::Io(e) => write!(f, "io: {e}"),
            WriteError::LockBusy => write!(f, "events.lock is held by another writer"),
        }
    }
}

impl std::error::Error for WriteError {}

impl From<std::io::Error> for WriteError {
    fn from(e: std::io::Error) -> Self { WriteError::Io(e) }
}

#[derive(Debug)]
pub struct Rotation {
    pub from: PathBuf,
    pub to: PathBuf,
}

#[derive(Debug)]
pub enum FileShape {
    Empty,
    V2,
    Legacy,
    MalformedJson,
}

pub struct EventWriter {
    path: PathBuf,
    size_cap: u64,
}

impl EventWriter {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into(), size_cap: DEFAULT_SIZE_CAP }
    }

    pub fn with_size_cap(mut self, bytes: u64) -> Self {
        self.size_cap = bytes;
        self
    }

    pub fn file_shape(path: &Path) -> std::io::Result<FileShape> {
        match File::open(path) {
            Ok(f) => {
                let mut reader = std::io::BufReader::new(f);
                let mut first = String::new();
                use std::io::Read;
                if reader.read_to_string(&mut first)? == 0 {
                    return Ok(FileShape::Empty);
                }
                let first_line = first.lines().next().unwrap_or("");
                if first_line.trim().is_empty() {
                    return Ok(FileShape::Empty);
                }
                // JSON syntax check first: distinguishes MalformedJson (syntax error)
                // from Legacy (parses but not a v2 Event).
                if serde_json::from_str::<serde_json::Value>(first_line).is_err() {
                    return Ok(FileShape::MalformedJson);
                }
                match serde_json::from_str::<Event>(first_line) {
                    Ok(e) if e.v == 2 => Ok(FileShape::V2),
                    Ok(_) => Ok(FileShape::Legacy),
                    Err(_) => Ok(FileShape::Legacy),
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(FileShape::Empty),
            Err(e) => Err(e),
        }
    }

    fn rotate_filename() -> PathBuf {
        let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let stamp = Self::format_utc_iso8601_compact(secs);
        PathBuf::from(format!("events-{stamp}.jsonl"))
    }

    /// Compact UTC timestamp for filenames: `YYYY-MM-DDTHH-MM-SSZ`. Colons
    /// are replaced with dashes because some filesystems disallow them.
    /// Origin is the Unix epoch (1970-01-01T00-00-00Z).
    fn format_utc_iso8601_compact(secs: u64) -> String {
        use chrono::{DateTime, Utc};
        let dt: DateTime<Utc> = DateTime::from_timestamp(secs as i64, 0).unwrap_or_else(Utc::now);
        let formatted = dt.format("%Y-%m-%dT%H-%M-%SZ").to_string();
        formatted.replace(':', "-")
    }

    fn lock_path_for(path: &Path) -> PathBuf {
        let mut p = path.to_path_buf();
        let file = p.file_name().unwrap_or_else(|| std::ffi::OsStr::new("events.jsonl")).to_os_string();
        p.set_file_name(format!("{}.lock", file.to_string_lossy()));
        p
    }

    pub fn write(&self, event: &Event) -> Result<(), WriteError> {
        if event.doc.is_empty() {
            return Err(WriteError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "doc must be non-empty",
            )));
        }
        let lock_path = Self::lock_path_for(&self.path);
        if let Some(parent) = lock_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let lock_file = OpenOptions::new().create(true).append(true).open(&lock_path)?;
        lock_file.try_lock_exclusive().map_err(|_| WriteError::LockBusy)?;

        let result = (|| -> Result<(), WriteError> {
            if let Ok(meta) = std::fs::metadata(&self.path) {
                if meta.len() >= self.size_cap {
                    let _ = self.rotate_internal();
                }
            }
            let line = serde_json::to_string(event)
                .map_err(|e| WriteError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
            let mut line = line;
            line.push('\n');
            let mut f = OpenOptions::new().create(true).append(true).open(&self.path)?;
            f.write_all(line.as_bytes())?;
            f.sync_all()?;
            Ok(())
        })();

        let _ = FileExt::unlock(&lock_file);
        result
    }

    pub fn rotate(&self) -> Result<Rotation, WriteError> {
        self.rotate_internal()
    }

    fn rotate_internal(&self) -> Result<Rotation, WriteError> {
        if !self.path.exists() {
            return Ok(Rotation { from: self.path.clone(), to: self.path.clone() });
        }
        let to = self.path.with_file_name(Self::rotate_filename());
        std::fs::rename(&self.path, &to)?;
        Ok(Rotation { from: self.path.clone(), to })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::event::{EventData, Kind, Rect, Source, Target};
    use tempfile::tempdir;

    fn ev(kind: Kind, data: EventData, body: &str) -> Event {
        Event {
            v: 2,
            id: ulid::Ulid::from_string("01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ1").unwrap(),
            ts: chrono::DateTime::parse_from_rfc3339("2026-07-05T18:21:00Z").unwrap().with_timezone(&chrono::Utc),
            src: Source::DomiJs,
            doc: "onboarding-v2".into(),
            kind,
            target: Target {
                id: Some("btn-save".into()),
                selector: None,
                rect: Rect { x: 0.0, y: 0.0, w: 1.0, h: 1.0 },
            },
            data,
        }
    }

    fn write_n(w: &EventWriter, n: usize) {
        for _ in 0..n {
            w.write(&ev(
                Kind::RailAdd,
                EventData::RailAdd { body: "x".into(), target_id: None },
                "x",
            )).unwrap();
        }
    }

    #[test]
    fn write_appends_one_line() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        let w = EventWriter::new(&path);
        write_n(&w, 1);
        let body = std::fs::read_to_string(&path).unwrap();
        assert_eq!(body.lines().count(), 1);
        assert!(body.ends_with('\n'));
    }

    #[test]
    fn jsonl_round_trip_three_events() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        let w = EventWriter::new(&path);
        write_n(&w, 3);
        let bytes = std::fs::read(&path).unwrap();
        let mut de = serde_json::Deserializer::from_reader(&bytes[..]).into_iter::<Event>();
        let mut count = 0;
        while de.next().is_some() { count += 1; }
        assert_eq!(count, 3);
    }

    #[test]
    fn rotation_on_size_cap() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        let w = EventWriter::new(&path).with_size_cap(50);
        write_n(&w, 10);
        let entries: Vec<_> = std::fs::read_dir(dir.path()).unwrap().filter_map(Result::ok).collect();
        assert!(entries.len() >= 2, "expected rotation, got {:?}",
            entries.iter().map(|e| e.file_name()).collect::<Vec<_>>());
    }

    #[test]
    fn rotate_renames_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        let w = EventWriter::new(&path);
        write_n(&w, 1);
        let rotated = w.rotate().unwrap();
        assert!(!path.exists());
        assert!(rotated.to.exists());
    }

    #[test]
    fn file_shape_detects_legacy() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        std::fs::write(&path, r#"{"id":"a","selector":"b","text":"c"}"#).unwrap();
        assert!(matches!(EventWriter::file_shape(&path).unwrap(), FileShape::Legacy));
    }

    #[test]
    fn file_shape_detects_v2() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        std::fs::write(
            &path,
            r#"{"v":2,"id":"01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ0","ts":"2026-07-05T18:21:00Z","src":"domi.js","doc":"x","kind":"click","target":{"id":null,"selector":null,"rect":{"x":0,"y":0,"w":0,"h":0}},"data":{}}"#,
        ).unwrap();
        assert!(matches!(EventWriter::file_shape(&path).unwrap(), FileShape::V2));
    }

    #[test]
    fn lock_busy_when_held() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        let _ = std::fs::File::create(&path).unwrap(); // touch
        let lock_path = EventWriter::lock_path_for(&path);
        let lock_file = std::fs::OpenOptions::new().create(true).append(true).open(&lock_path).unwrap();
        lock_file.lock_exclusive().unwrap();

        let w = EventWriter::new(&path);
        let event = ev(
            Kind::Click,
            EventData::Click { value: None },
            "x",
        );
        let err = w.write(&event).unwrap_err();
        assert!(matches!(err, WriteError::LockBusy), "expected LockBusy, got {err:?}");

        // release
        let _ = fs2::FileExt::unlock(&lock_file);
    }
}