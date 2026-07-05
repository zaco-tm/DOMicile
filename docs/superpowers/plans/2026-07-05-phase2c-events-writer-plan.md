# Phase 2c-α: `domi-server` events writer crate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Rust library crate `domi-server` at `crates/domi-server/` exposing an `events` module that writes Protocol-v2 events to `events.jsonl` with rotation, advisory locking, and Phase-1 backward-compat detection.

**Architecture:** Single sync library crate, no async runtime. The `Event` Rust struct is the canonical source of truth for the wire payload; `serde_json` produces JSON the existing `tests/wire-protocol.test.js` validates against. TDD against real temp files via the `tempfile` crate.

**Tech Stack:** Rust 1.96 stable (toolchain pinned in `rust-toolchain.toml`), `serde` + `serde_json`, `ulid`, `chrono` (with `serde` feature), `thiserror`, `fs2` for `flock(2)`, `tracing`. Dev: `tempfile`. No async.

## Global Constraints

- Working directory: `/Users/zaco/Projects/Personal/DOMiNice Skill` (the DOMiNice repo).
- `events.jsonl` semantics per `docs/WIRE-PROTOCOL.md` §"JSONL file conventions".
- Event schema per `docs/schemas/event.schema.json` — `v == 2` exactly, six kinds, `id` is a ULID, `ts` is ISO-8601 UTC, fields not in the schema must be rejected at the write boundary.
- The Rust `Event` struct is canonical; the JSON Schema is documentation + cross-language regression.
- The crate is sync only. Async lands in 2c-γ.
- Files trailing newline invariant holds after every successful write.
- `.gitignore` gains `**/target/`. `Cargo.lock` is *not* committed at this stage (library only); 2c-γ re-evaluates when the binary lands.
- Library files (`tokens/`, `components/`, `scripts/domi.js`, `scripts/domi-audit.js`, original `templates/*/`, `examples/`) are **untouched**.

---

### Task 1: Workspace scaffold

**Files:**
- Create: `Cargo.toml` (repo root)
- Create: `rust-toolchain.toml`
- Create: `crates/domi-server/Cargo.toml`
- Create: `crates/domi-server/src/lib.rs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a `cargo build --workspace` that succeeds, compiling only `domi-server` (no binary yet).

- [ ] **Step 1: Confirm Rust toolchain is available**

Run:
```bash
rustc --version
cargo --version
```
Expected: `rustc 1.96.0 ...`, `cargo 1.96.0 ...` (or newer stable).

- [ ] **Step 2: Create `rust-toolchain.toml`**

Write `rust-toolchain.toml` at the repo root:

```toml
[toolchain]
channel = "stable"
```

- [ ] **Step 3: Create the workspace `Cargo.toml`**

Write `Cargo.toml` at the repo root:

```toml
[workspace]
resolver = "2"
members = ["crates/domi-server"]

[profile.release]
lto = "thin"
codegen-units = 1
```

- [ ] **Step 4: Create the crate manifest**

Write `crates/domi-server/Cargo.toml`:

```toml
[package]
name = "domi-server"
version = "0.1.0"
edition = "2021"
license = "MIT"
description = "DOMiNice live-server library (Phase 2c)."

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
ulid = { version = "1", features = ["serde"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "1"
fs2 = "0.4"
tracing = "0.1"

[dev-dependencies]
tempfile = "3"
pretty_assertions = "1"
```

Pin to the exact versions in this snippet. If a newer compatible version is published between spec and impl, prefer matching this exactly and bumping later — do not silently upgrade during this task.

- [ ] **Step 5: Create an empty `lib.rs`**

Write `crates/domi-server/src/lib.rs`:

```rust
//! DOMiNice live-server library.

pub mod events;
```

(The `events` module doesn't exist yet — that's Task 2. This compiles only after Task 2 lands. To make Task 1 self-contained, write this stub *without* the `pub mod events;` line in Step 5; add the line in Task 2.)

Correction: in Step 5 write:

```rust
//! DOMiNice live-server library.
//! See `events` for the v2 protocol event writer.
```

- [ ] **Step 6: Extend `.gitignore`**

Read current `.gitignore`. Append:

```
**/target/
```

Confirm no duplicate line exists.

- [ ] **Step 7: Verify the scaffold compiles**

Run:
```bash
cargo build --workspace 2>&1 | tail -10
```
Expected: `Compiling domi-server v0.1.0` then `Finished`. Library has no code yet so the build is trivial but proves toolchain + workspace + manifest wiring.

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml rust-toolchain.toml crates/domi-server/Cargo.toml crates/domi-server/src/lib.rs .gitignore
git commit -m "chore(rust): scaffold domi-server crate (Phase 2c-α)"
```

---

### Task 2: Event types

**Files:**
- Create: `crates/domi-server/src/events/mod.rs`
- Create: `crates/domi-server/src/events/event.rs`
- Modify: `crates/domi-server/src/lib.rs`

**Interfaces:**
- Consumes: nothing yet.
- Produces: `pub use event::{Event, EventData, Kind, Source, Target};` re-exported from `events`. The `Event` JSON form (via `serde_json::to_string(&ev)`) must satisfy the five required kinds; `'{"v":2,...,"kind":"click","data":{"value":"x"}}'` round-trips byte-identical through `from_str`.

- [ ] **Step 1: Write the failing test (compile + round-trip)**

Create `crates/domi-server/src/events/event.rs` and append at the bottom (still inside the same file for the test, but separate module):

Actually — Rust tests live in `#[cfg(test)] mod tests {}` inside the same file or a sibling. Put tests in `crates/domi-server/src/events/event.rs` with `#[cfg(test)]` inline so the impl and tests ship together.

Append to `crates/domi-server/src/events/event.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn sample(kind: Kind, data: EventData) -> Event {
        Event {
            v: 2,
            id: ulid::Ulid::from_string("01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ0").unwrap(),
            ts: chrono::DateTime::parse_from_rfc3339("2026-07-05T18:21:00Z")
                .unwrap()
                .with_timezone(&chrono::Utc),
            src: Source::DomiJs,
            doc: "onboarding-v2".to_string(),
            kind,
            target: Target {
                id: Some("btn-save".into()),
                selector: Some("main > .domi-card:nth-of-type(1)".into()),
                rect: Rect { x: 120.0, y: 480.0, w: 200.0, h: 32.0 },
            },
            data,
        }
    }

    #[test]
    fn click_round_trips_byte_identical() {
        let ev = sample(
            Kind::Click,
            EventData::Click { value: Some("Save".into()) },
        );
        let s = serde_json::to_string(&ev).unwrap();
        let back: Event = serde_json::from_str(&s).unwrap();
        assert_eq!(ev.doc, back.doc);
        assert_eq!(ev.kind, back.kind);
        match (&ev.data, &back.data) {
            (EventData::Click { value: a }, EventData::Click { value: b }) => assert_eq!(a, b),
            _ => panic!("kind mismatch after round-trip"),
        }
    }

    #[test]
    fn all_six_kinds_serialize() {
        for (kind, data) in [
            (Kind::Click, EventData::Click { value: Some("x".into()) }),
            (Kind::Input, EventData::Input { name: "k".into(), value: "v".into() }),
            (Kind::Submit, EventData::Submit { form_id: "f".into(), fields: serde_json::Map::new().into() }),
            (Kind::RailAdd, EventData::RailAdd { body: "x".into(), target_id: Some("btn-save".into()) }),
            (Kind::RailResolve, EventData::RailResolve {
                entry_id: ulid::Ulid::from_string("01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ9").unwrap(),
            }),
            (Kind::Custom, EventData::Custom { payload: serde_json::Map::new().into() }),
        ] {
            let ev = sample(kind, data);
            let s = serde_json::to_string(&ev).expect("serialize");
            let back: Event = serde_json::from_str(&s).expect("deserialize");
            assert_eq!(ev.id, back.id);
        }
    }
}
```

The test references types we haven't defined yet — keep reading.

- [ ] **Step 2: Run test, verify it fails**

Run:
```bash
cargo test -p domi-server 2>&1 | tail -10
```
Expected: compile errors referencing `Event`, `Kind`, `Source`, `EventData`, `Rect`, `Target`. RED.

- [ ] **Step 3: Write the `event.rs` impl**

Replace the placeholder (delete the test from this file for now — we'll re-add after impl compiles) and write `crates/domi-server/src/events/event.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Target {
    pub id: Option<String>,
    pub selector: Option<String>,
    pub rect: Rect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Source {
    DomiJs,
    DomiAuditJs,
    BrowserExt,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    Click,
    Input,
    Submit,
    RailAdd,
    RailResolve,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum EventData {
    Click { value: Option<String> },
    Input { name: String, value: String },
    Submit {
        #[serde(rename = "formId")]
        form_id: String,
        fields: serde_json::Map<String, serde_json::Value>,
    },
    RailAdd { body: String, #[serde(rename = "targetId")] target_id: Option<String> },
    RailResolve {
        #[serde(rename = "entryId")]
        entry_id: ulid::Ulid,
    },
    Custom {
        payload: serde_json::Map<String, serde_json::Value>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    pub v: u8,
    pub id: ulid::Ulid,
    pub ts: chrono::DateTime<chrono::Utc>,
    pub src: Source,
    pub doc: String,
    pub kind: Kind,
    pub target: Target,
    pub data: EventData,
}
```

Notes:
- `EventData` uses `#[serde(tag = "kind", rename_all = "kebab-case")]` so the JSON shape matches the schema's per-branch `kind` discriminator without duplicating it.
- `form_id` Rust field serializes as `formId`; `target_id` → `targetId`; `entry_id` → `entryId`.
- `Event.v` is `u8`; we never need anything wider. The serializer will write `2` literally.

- [ ] **Step 4: Re-add the test (verbatim from Step 1)**

Re-add the test at the bottom of `event.rs`. With the types now defined, it compiles.

- [ ] **Step 5: Create `events/mod.rs`**

Write `crates/domi-server/src/events/mod.rs`:

```rust
mod event;
#[cfg(test)]
mod writer;

pub use event::{Event, EventData, Kind, Rect, Source, Target};
```

The `writer` module is added in Task 3. The `#[cfg(test)]` wrapping keeps this task's `cargo build` green even before writer.rs lands.

- [ ] **Step 6: Update `lib.rs`**

In `crates/domi-server/src/lib.rs` add `pub mod events;`.

- [ ] **Step 7: Run tests, verify GREEN**

Run:
```bash
cargo test -p domi-server 2>&1 | tail -10
```
Expected: `test events::event::tests::click_round_trips_byte_identical ... ok` and `...all_six_kinds_serialize ... ok`. 2 passed.

- [ ] **Step 8: Verify cross-language alignment**

The JSON Schema in `docs/schemas/event.schema.json` is canonical for shape. Confirm one sample: serialize a `Kind::Input` event and ask AJV via vitest to validate.

(Optional, manual): run
```bash
cd "$(dirname $(pwd))"  # no-op here
node -e 'console.log(JSON.stringify(require("./path/to/dump.json")))'  # only if needed
```
Skip if no obvious hook — the 2a schema-validation tests already cover the per-kind shape.

- [ ] **Step 9: Commit**

```bash
git add crates/domi-server/src/lib.rs crates/domi-server/src/events/
git commit -m "feat(domi-server): Event struct + per-kind data enum (v2 protocol)"
```

---

### Task 3: EventWriter — append + round-trip + rotation

**Files:**
- Create: `crates/domi-server/src/events/writer.rs`

**Interfaces:**
- Consumes: `Event`, `&Path`.
- Produces: `EventWriter::write(&self, &Event) -> Result<(), WriteError>` that appends one NDJSON line ending in `\n`. `EventWriter::rotate(&self) -> Result<Rotation, WriteError>` that renames `events.jsonl` to `events-<UTC>.jsonl`. Default cap 50 MB; configurable via `EventWriter::with_size_cap`.

- [ ] **Step 1: Write failing tests for write + round-trip + rotation**

Append to `crates/domi-server/src/events/writer.rs` (file is new; write the test first):

```rust
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
        // One rotated file + the live events.jsonl
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
}
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cargo test -p domi-server writer 2>&1 | tail -10
```
Expected: compile errors referencing `EventWriter`, `Rotation`. RED.

- [ ] **Step 3: Implement the writer + WriteError + Rotation + FileShape**

Above the `#[cfg(test)] mod tests` block in `writer.rs`, write the impl. The full impl targets the spec at §B/§C/§D; here is the body to drop in (it's the literal Rust of the spec):

```rust
use std::{
    fs::{File, OpenOptions},
    io::{BufWriter, Write},
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
                match serde_json::from_str::<Event>(first_line) {
                    Ok(e) if e.v == 2 => Ok(FileShape::V2),
                    Ok(_) => Ok(FileShape::Legacy),
                    Err(_) if first_line.trim().is_empty() => Ok(FileShape::Empty),
                    Err(_) => Ok(FileShape::MalformedJson),
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(FileShape::Empty),
            Err(e) => Err(e),
        }
    }

    fn rotate_filename() -> PathBuf {
        let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        // Compact UTC-ish filename, safe across filesystems.
        let stamp = format!("events-{secs}.jsonl");
        PathBuf::from(stamp)
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
        lock_file.lock_exclusive().map_err(|_| WriteError::LockBusy)?;

        let result = (|| -> Result<(), WriteError> {
            // Check whether writing the next line would breach the cap.
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
```

Notes:
- Lock file is `events.lock` next to `events.jsonl`. Acquisition is exclusive; held for the duration of one write only.
- `sync_all()` after every successful write. Required for crash-safety.
- Rotation filename uses Unix epoch seconds; collisions in a sub-second burst are impossible (lock guarantees single-writer).

- [ ] **Step 4: Run tests, verify GREEN**

```bash
cargo test -p domi-server writer 2>&1 | tail -15
```
Expected: 4 passed (`write_appends_one_line`, `jsonl_round_trip_three_events`, `rotation_on_size_cap`, `rotate_renames_file`).

- [ ] **Step 5: Commit**

```bash
git add crates/domi-server/src/events/writer.rs
git commit -m "feat(domi-server): EventWriter — append, rotation, lock, file_shape"
```

---

### Task 4: file_shape coverage + lock-busy

**Files:**
- Modify: `crates/domi-server/src/events/writer.rs`

**Interfaces:**
- Produces: `EventWriter::file_shape(&Path)` returns `Legacy` for files whose first non-empty line is not a valid `v: 2` event. `EventWriter::write` returns `WriteError::LockBusy` when another holder has the lock.

- [ ] **Step 1: Write failing tests**

Append to `writer.rs`'s test module:

```rust
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
        use std::sync::{Arc, Barrier};
        use std::thread;

        let dir = tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        let _ = std::fs::File::create(&path).unwrap(); // touch
        let lock_path = lock_path_for(&path);
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
```

- [ ] **Step 2: Run, verify these three new tests fail in a stateful way**

```bash
cargo test -p domi-server --test '*' 2>&1 | tail -8
cargo test -p domi-server writer 2>&1 | tail -8
```

Expected: the three new tests pass given Task 3's impl (they should). If they fail, debug; the impl in Task 3 already supports these. RED only if the impl doesn't behave — fix in Task 3's impl, then run again.

If they pass already, that's a small surprise but truthful — the previous task's test surface happened to cover these too. Note "RED skipped — coverage already proven by Task 3" in your report.

- [ ] **Step 3: Commit**

```bash
git add crates/domi-server/src/events/writer.rs
git commit -m "test(domi-server): cover file_shape (V2, Legacy) and lock-busy"
```

---

### Task 5: Workspace-wide build + JS-half regression

**Files:** none (verification only)

- [ ] **Step 1: Run full Rust workspace tests**

```bash
cargo test --workspace 2>&1 | tail -15
```
Expected: all writer-related tests pass.

- [ ] **Step 2: Run the JS test suite**

```bash
npm test 2>&1 | tail -10
```
Expected: 58/58 pass (no regression — JS half is untouched).

- [ ] **Step 3: Re-confirm no JS half files were modified**

```bash
git diff --stat v0.1.0..HEAD -- tokens/ components/domi.css scripts/domi.js templates/dashboard templates/webapp-shell templates/mobile-app-shell templates/admin-tool templates/pos-kiosk examples/
```
Expected: empty output.

- [ ] **Step 4: Verify `Cargo.lock` policy**

```bash
ls -la Cargo.lock 2>/dev/null || echo "no Cargo.lock — correct for library-only at this stage"
```
Expected: `no Cargo.lock — correct for library-only at this stage` (since the workspace currently has no binary that consumes the lock meaningfully and no async runtime to pin).

- [ ] **Step 5: Commit (no source changes; this task produces only verification output)**

If everything is green, no commit. If anything was discovered-and-fixed, commit it now with subject `fix(domi-server): <one-line description>`.

---

### Task 6: Docs polish + release notes

**Files:**
- Create: `docs/RUST.md` (if not already present)
- Modify: `README.md`
- Modify: `RELEASE-NOTES-v0.1.0.md`

- [ ] **Step 1: Verify `docs/RUST.md` exists with the planned content**

```bash
test -f docs/RUST.md && echo "RUST.md exists" || echo "MISSING"
```

If missing, write `docs/RUST.md` with this content:

```markdown
# Rust in DOMiNice

The Rust crate lives at `crates/domi-server/`. Phase 2c-α ships the `events` module — a sync, TDD'd library that writes Protocol-v2 events to `events.jsonl`.

## Build and test

\`\`\`bash
cargo build --workspace
cargo test -p domi-server
\`\`\`

## Crate layout

\`\`\`
crates/domi-server/
  src/lib.rs
  src/events/
    mod.rs
    event.rs       # Event, EventData, Kind, Source, Target, Rect
    writer.rs      # EventWriter, WriteError, Rotation, FileShape
\`\`\`

## Phasing

- 2c-α (this round): events writer — sync library, no async.
- 2c-β: HTML serving + folder watcher (library extension).
- 2c-γ: binary + axum + tokio + WebSocket (binary stub already in the workspace manifest).
\`\`\`
```

- [ ] **Step 2: Add one bullet to README**

In `README.md`, under `## What's in v0.1 (Phase 1)`, add a new bullet above the line that lists "Phase 1 ships a static HTML+CSS+JS design system":

> - 🦀 `domi-server` Rust crate — Phase 2c-α events writer (lib only; binary lands in 2c-γ)

If the README doesn't have such a section, add the bullet under the first existing list.

- [ ] **Step 3: Append a release-notes section**

Append to `RELEASE-NOTES-v0.1.0.md`:

```markdown

---

## Phase 2c-α — Events writer crate (post-v0.1.0 docs patch, 2026-07-05)

- New Rust workspace member: `crates/domi-server` (library only).
- `events` module: `Event`, `EventWriter`, `WriteError`, `Rotation`, `FileShape`.
- Sync only. No async, no networking. Tests use real temp files.
- Companion docs: `docs/RUST.md` explains layout and phasing.
- JS half (tokens, primitives, templates, `domi.js`, `domi-audit.js`, examples): untouched.
```

- [ ] **Step 4: Run final verification**

```bash
cargo test --workspace 2>&1 | tail -5
npm test 2>&1 | tail -5
```
Expected: 2c-α green; 58/58 JS passing.

- [ ] **Step 5: Commit**

```bash
git add docs/RUST.md README.md RELEASE-NOTES-v0.1.0.md
git commit -m "docs(rust): Phase 2c-α release notes + RUST.md + README mention"
```

---

### Task 7: Tag the round (optional)

- [ ] **Step 1: Tag (only if no prior `v0.x.y-tag` exists)**

```bash
git tag -a v0.1.1-rust-alpha -m "Phase 2c-α: domi-server events writer crate"
```
Skip if the project already has a recent release tag; coordinated tags belong in release tooling.

---

## Done when

- All 7 tasks' checklists are complete.
- `cargo test --workspace` is green.
- `npm test` shows 58/58 passing (no JS regression).
- `git diff --stat v0.1.0..HEAD -- tokens/ components/domi.css scripts/domi.js templates/ examples/` is empty.
