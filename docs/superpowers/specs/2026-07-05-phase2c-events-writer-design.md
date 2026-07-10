# Phase 2c-α — `domi-server` Events Writer Crate

**Date:** 2026-07-05
**Status:** Draft (post self-review)
**Phase:** 2c-α of 4 sub-projects (out of original Phase 2; 2a is wire protocol, 2b is JS mode, 2c is Rust binary, 2d is agent tooling)
**Upstream:** 2a spec `docs/superpowers/specs/2026-07-05-phase2-wire-protocol-design.md`
**Sibling sub-projects:** 2c-β (HTML serving + watcher), 2c-γ (WebSocket + main binary)

## Why this scope

2c in full is a Rust binary with file watching, axum HTTP, WebSocket plumbing, and event validation — easily a few thousand lines spread across many modules. Trying to spec+plan all of it in one cycle is the same failure shape the previous agent hit: a vague spec, an overcommitted plan, and a partial implementation.

2c-α is **one crate of pure logic**: the events.jsonl writer with rotation, Phase-1 backward-compat detection, and lock-file hygiene. It is the foundation that 2c-β and 2c-γ both depend on. TDD-friendly: no async, no runtime, no I/O runtime tricks — just `&Path` and `BufWriter`.

Decoupling 2c-α from the watcher/HTTP/WebSocket concerns means the harder parts (life-cycle, file system races, broadcast fanout) get designed with a stable foundation under them.

## Goals

- A new Cargo workspace at `crates/domi-server/` containing one library crate and one binary.
- The library exposes a `events` module with the writer, rotation, and lock-file logic described in 2a §B.
- TDD with `cargo test` against real temp files (no mocks); tests live in `#[cfg(test)] mod tests`.
- The crate compiles under Rust 1.96 stable.
- 2c-β and 2c-γ will be designed in their own brainstorming cycles, against this crate's public API.

## Non-goals

- HTTP server (2c-β). 2c-α produces only an events writer; no listener.
- WebSocket broadcasting (2c-γ).
- HTML serving or file watching.
- A binary in this round — the binary stubs come in 2c-γ.
- Generated `Cargo.lock` policies — Cargo's default is fine for a fresh crate.
- A full release pipeline (CI, crates.io publish) — that lives in Phase 4.

## Design

### A. Workspace layout (root + new crate)

The current repo is a single JS/npm project at root. To add Rust without polluting the JS half:

- Add a `Cargo.toml` workspace file **at the repo root** (sibling to `package.json`), including a single workspace member `crates/domi-server`.
- Add `crates/domi-server/Cargo.toml` declaring the library crate `domi-server` with one binary stub `domi-server-bin` (the binary exists but is empty; populated in 2c-γ).
- The crate's `src/lib.rs` exposes the `events` module only.
- `rust-toolchain.toml` pins stable.
- `.gitignore` gets `**/target/` and `Cargo.lock` is committed for the workspace (single-crate convention — committed for a workspace *binary*, ignored for libraries; flipped off for the binary in 2c-γ if preferences change).

### B. Public API — `events` module

```rust
//! Append-only event writer with rotation. Per docs/WIRE-PROTOCOL.md §B.

use std::path::{Path, PathBuf};

pub struct EventWriter {
    path: PathBuf,
    size_cap: u64,
}

pub struct Rotation {
    pub from: PathBuf,
    pub to: PathBuf,
}

#[derive(Debug)]
#[non_exhaustive]
pub enum WriteError {
    Io(std::io::Error),
    Json(serde_json::Error),
    Schema(SchemaError),
    LockBusy,
}

#[derive(Debug)]
pub struct SchemaError(pub String);

impl EventWriter {
    pub fn new(path: impl Into<PathBuf>) -> Self;
    pub fn with_size_cap(self, bytes: u64) -> Self;

    /// Write a single event. Validates against the schema before append.
    /// On size-cap breach, rotates the existing file first, then writes.
    /// Lock file is briefly held per write — see D.
    pub fn write(&self, event: &Event) -> Result<(), WriteError>;

    /// Force a rotation regardless of size. Useful for tests and shutdown.
    pub fn rotate(&self) -> Result<Rotation, WriteError>;

    /// One-shot: open the path, peek the first line, return true iff it parses
    /// as a v2 event. Used at server startup to decide whether to rotate a
    /// Phase-1 leftover before opening for append.
    pub fn file_shape(path: &Path) -> Result<FileShape, std::io::Error>;
}

pub enum FileShape {
    Empty,
    V2,
    Legacy,
    MalformedJson,
}
```

`Event` is a typed Rust struct mirroring the schema (`docs/schemas/event.schema.json`):

```rust
pub struct Event {
    pub v: u8,
    pub id: Ulid,
    pub ts: chrono::DateTime<chrono::Utc>,
    pub src: Source,
    pub doc: String,
    pub kind: Kind,
    pub target: Target,
    pub data: EventData,
}
```

`EventData` is a Rust enum with one variant per `kind`. Constructing an `Event` validates shape at compile time — the kind-specific `if/then` rules from the JSON Schema become a Rust sum type. **No string union fields at runtime.** This means most schema rejection becomes unrepresentable in code; the only runtime validation the writer does is "is this a complete v2 event" (e.g., non-empty `doc`).

`serde_json::to_writer` of an `Event` produces the same byte-for-byte JSON the schema validates against. **The Rust struct is the canonical source of truth** for the protocol — the JSON Schema in `docs/schemas/event.schema.json` becomes documentation plus a cross-language check, not a runtime gate.

### C. Rotation behavior

Per WIRE-PROTOCOL.md §"JSONL file conventions":

- Size cap: default 50 MB, configurable via `EventWriter::with_size_cap`.
- Daily rotation: NOT the writer's job. The writer only rotates on size; daily rotation is the watcher's job (2c-β). The writer exposes `rotate()` (which can be called any time to force-rotate) and `current_size(&self)` so the watcher can decide.
- Naming: rotated files are `events-<UTC-timestamp>.jsonl` where timestamp is `2026-07-05T18-21-00Z` (colons replaced with dashes; safe across filesystems).
- Rotation algorithm:
  1. Acquire `events.lock` (see D).
  2. Stat `events.jsonl` to get current bytes.
  3. If current + estimated event size ≥ cap, rename `events.jsonl` → `events-<ts>.jsonl`.
  4. Release lock.
  5. Write proceeds as normal.
- File keeps trailing `\n`. **Invariant:** after every successful write, the file's last byte is `0x0A`.

### D. Lock file

- `events.lock` sibling of `events.jsonl`. Created on first use, removed on graceful shutdown.
- Lock acquisition: `flock(2)` via the `fs2` or `fs4` crate.
- Held per-line during write only. Released before the next fsync to keep contention minimal.
- LockBusy error variant returned if acquisition fails within a 250 ms timeout (configurable later).

### E. Phase-1 backward-compat detection

`EventWriter::file_shape(&path)` returns one of four states. The server (in 2c-γ) uses this on startup:

- `Empty` — write freely, file doesn't exist or is 0 bytes.
- `V2` — first line parses as `Event { v: 2, … }`; write freely, append.
- `Legacy` — file has bytes whose first line is not `v: 2`. Rotate to `events-<ts>.jsonl`, then write to a fresh `events.jsonl`.
- `MalformedJson` — first line is not parseable JSON at all. Same as Legacy (rotate); the writer should also log a warning so the user knows their file is corrupt.

The writer does **not** try to migrate Phase 1 entries. Phase 1 events from `domi.js` use `id`, `selector`, `text` fields with no `v`; rotation preserves them untouched.

### F. Error semantics

`WriteError` is non-exhaustive so the public type can grow without breaking callers. Variants:

- `Io(_)` — filesystem error (disk full, permission denied, broken pipe). Caller decides whether to retry.
- `Json(_)` — `Event` failed to serialize. This should be impossible for well-formed inputs; surfaced for completeness.
- `Schema(_)` — runtime field validation failed (e.g., empty `doc`, non-v2 `v`). Surface to client as 400 in 2c-γ. Returned by the writer too as a defensive measure.
- `LockBusy` — couldn't acquire `events.lock` within the timeout. Caller can retry.

The writer does not crash on transient errors. Errors bubble up; the watcher/HTTP layer decides whether to retry, drop, or surface.

### G. Tests

Six tests, each in `#[cfg(test)]`, using `tempfile::tempdir`:

1. `write_appends_one_line` — write one event, file ends with newline, content is valid NDJSON.
2. `jsonl_round_trip` — write N events, read back with `serde_json::Deserializer::from_reader().into_iter::<Event>()`, count and content match.
3. `rotation_on_size` — set cap to 100 bytes, write 10 events, count the rotated file and the live file.
4. `rotate_renames_file` — write 1, call `rotate()`, file is gone; rotated exists.
5. `file_shape_detects_legacy` — write a Phase-1-shaped line to a file, `file_shape` returns `Legacy`.
6. `lock_busy_returned_when_held` — open writer twice in two threads; second write returns `LockBusy` within timeout.

Plus one proptest-style test (if `proptest` is added as dev-dep; optional for 2c-α) for "any valid `Event` round-trips through `to_json`/`from_str` byte-identically."

The test group uses real temp files, not mocks. The writer's job is filesystem I/O; mocking it would test the mock, not the code.

### H. Dependencies (in `Cargo.toml`)

Runtime:

- `serde` + `serde_json` — typed Event + JSON serialization.
- `ulid` — ULID generation. (Canonical Rust crate; Apache-2.0/MIT.)
- `chrono` — ISO-8601 timestamps with `serde` feature.
- `thiserror` — ergonomic error enums.
- `fs2` — `flock(2)` binding. Alternative: `fs4`; pick whichever is current at crate-write time.
- `tracing` — structured logging (no-op init in tests).

Dev:

- `tempfile` — temp dirs in tests.
- `pretty_assertions` — readable diffs (optional, low cost).

No async dependencies. No networking deps. No `tokio`. **The 2c-α crate is sync only.** Async lands in 2c-γ when the binary uses it.

## File-by-file changes

| Path | Action |
|---|---|
| `Cargo.toml` (workspace) | Create at repo root |
| `rust-toolchain.toml` | Create, pin `stable` channel |
| `crates/domi-server/Cargo.toml` | Create, name `domi-server`, deps above |
| `crates/domi-server/src/lib.rs` | Create, re-exports `events` module |
| `crates/domi-server/src/events/mod.rs` | Module entry |
| `crates/domi-server/src/events/event.rs` | `Event`, `EventData`, `Kind`, `Source`, `Target` types |
| `crates/domi-server/src/events/writer.rs` | `EventWriter`, `WriteError`, rotation, lock, file_shape |
| `crates/domi-server/src/events/tests.rs` | Six tests |
| `.gitignore` | Append `**/target/` (Cargo.lock left out for now — committed for the binary in 2c-γ) |
| `docs/RUST.md` | Brief note that a Rust crate now lives at `crates/domi-server` |
| `README.md` | Add one bullet under "What's in v0.1" noting the events writer crate is shipping (Phase 2c-α) |
| `RELEASE-NOTES-v0.1.0.md` | Append a section noting 2c-α |

Library files (`tokens/`, `components/`, `scripts/runtime/domi.js`, original `templates/*/`, `scripts/runtime/domi-audit.js`, `examples/`): **untouched**.

## Acceptance

2c-α is done when:

- `cargo build --workspace` is clean.
- `cargo test -p domi-server` runs and all six tests pass.
- The `events` module compiles without `#[allow(dead_code)]` on its public API.
- `Event` round-trips through `serde_json` byte-identically against the JSON Schema (validated by the existing `tests/wire-protocol.test.js` JSON Shape check on at least one sample).
- The crate has no `#[cfg(feature = "...")]` flags; features come later if needed.
- A reviewer (later) can read `events/writer.rs` and understand rotation+lock without any other context.
- A 2c-β brainstorming round can write its design *using this spec's `events` module* without re-specifying the file format.

## Risks and open questions

- **File handle contention.** `BufWriter` is in-memory; `sync_all` is required before the lock is released, otherwise a crash between write and flush could lose data. Use `sync_all` after each line.
- **Rotation under concurrent writes.** Lock file protects against two writers. Two writers in the same process — not supported in 2c-α (single writer is the contract per 2a).
- **ULID library availability.** `ulid` is widely used; if its API drifts, fall back to `uuid` + sort-by-time. Defer that call to impl time.
- **Symbolic link attacks.** The writer opens the path the caller gives it. It does not chase symlinks because `O_NOFOLLOW` is not portable. Callers (2c-γ) must validate the path first.
- **`fs2` vs `fs4` lock semantics.** Pick the one whose license + maintenance state we trust at impl time. Both offer `flock`-style advisory locks.
- **Schema divergence.** If 2a's JSON Schema drifts from Rust `Event`, the round-trip test catches it. But fields added to the schema must be added to Rust struct in the same change.
- **Error type vs serde.** `WriteError` is not `serde::Serialize`; the binary in 2c-γ maps these to HTTP status codes, not JSON responses.
