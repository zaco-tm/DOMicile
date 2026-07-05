# Phase 2c-γ: `domi-server` Binary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a runnable `domi-server` binary (axum HTTP + tokio + WebSocket) that wires the shipped 2c-α/2c-β library primitives into the routes pinned by the 2a wire-protocol spec. Includes a gated binary smoke test that addresses the HANDOFF.md risk of "no live integration test against an actual `domi-server` binary."

**Architecture:** Single-crate `[[bin]]` added to `crates/domi-server`. The `src/main.rs` is a 5-line `#[tokio::main]` wrapper that delegates to `domi_server::http::run(args)`. All async code lives in `src/http/{mod,args,state,router,handlers,ws}.rs`. The library API is unchanged. Sync `EventWriter` (2c-α) is composed with `tokio::sync::broadcast` via `spawn_blocking` to preserve lock-file semantics verbatim.

**Tech Stack:** Rust 1.96 stable, axum 0.7, tokio 1, tower 0.5, tower-http 0.6 (trace), clap 4 (derive), futures 0.3. JS side unchanged. vitest for existing JS tests (no new JS tests in this round).

## Global Constraints

- Working directory: `/Users/zaco/Projects/Personal/DOMiNice Skill`.
- Wire protocol per `docs/WIRE-PROTOCOL.md` (v2). `v != 2` → 400. Doc non-empty → 400. Stamp `id` and `ts` on POST if missing/null.
- Cross-language drift tolerance: JS sends `target: null` for `rail-resolve` (2b design §C); 2c-γ's POST handler accepts this and substitutes a default `Target` before deserializing through `Event`. Same tolerance for any other 2a-vs-2b surface drift (verified: only `target: null` for rail-resolve).
- Routes (locked): `GET /`, `GET /<path>` (fallback), `POST /api/events`, `GET /api/events?since=&doc=&limit=`, `GET /ws/events`. Plus additive `GET /healthz`.
- Defaults: `--port 4173`, `--host 127.0.0.1`, `--root .domi/output`, `--state .domi/state`, `--log-level info`.
- Bind 127.0.0.1 only by default (2a privacy invariant).
- Validation: trust serde. No `jsonschema` dep. Cross-language drift caught by `tests/wire-protocol.test.js`.
- `Cargo.lock` continues to be gitignored for 2c-γ (unchanged from 2c-α/2c-β).
- Library files (`tokens/`, `components/`, `scripts/domi.js`, `scripts/domi-audit.js`, original `templates/*/`, `examples/`) are **untouched**. The new code is additive to `crates/domi-server/src/{main.rs, http/}` and to `crates/domi-server/Cargo.toml`.
- Crate MSRV: 1.75. Current toolchain: 1.96. No nightly features.
- All new code uses only permissively-licensed dependencies (MIT/Apache-2.0).
- Each task ends with a clean `cargo build --workspace` + `cargo test -p domi-server` (or an explicit note for the gated smoke test).

---

### Task 1: Cargo manifest + `main.rs` + `http/` stub + `lib.rs`

**Files:**
- Modify: `crates/domi-server/Cargo.toml`
- Modify: `crates/domi-server/src/lib.rs`
- Create: `crates/domi-server/src/main.rs`
- Create: `crates/domi-server/src/http/mod.rs`

**Interfaces:**
- Produces: a compilable binary `domi-server` whose `main` calls a (stub) `domi_server::http::run` async function. The stub returns `Ok(())` so the binary no-ops for now.

- [ ] **Step 1: Update `Cargo.toml`**

Append at the bottom of `crates/domi-server/Cargo.toml` (after `[dev-dependencies]` block, do **not** mix into existing deps):

```toml
[[bin]]
name = "domi-server"
path = "src/main.rs"

[dependencies]
# (keep existing [dependencies] block; do not duplicate keys)

axum = "0.7"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal", "sync", "time", "net"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["trace"] }
clap = { version = "4", features = ["derive"] }
futures = "0.3"

[dev-dependencies]
# (keep existing [dev-dependencies])
tokio = { version = "1", features = ["macros", "rt-multi-thread", "test-util"] }
tempfile = "3"
pretty_assertions = "1"
```

Note: `[dependencies]` and `[dev-dependencies]` keys in TOML are unique per file; if they already exist, extend them with the new lines instead of duplicating the section header. Concretely, the final file should have **one** `[dependencies]` block containing the existing deps (serde, serde_json, ulid, chrono, thiserror, fs2, tracing, notify) plus the new ones (axum, tokio, tower, tower-http, clap, futures), and **one** `[dev-dependencies]` block containing the existing (tempfile, pretty_assertions) plus the new tokio test-util line.

The `[[bin]]` block goes at the bottom. `build = "build.rs"` stays.

- [ ] **Step 2: Add `pub mod http;` to `lib.rs`**

Edit `crates/domi-server/src/lib.rs`:

```rust
//! DOMiNice live-server library.
//! See `events` for the v2 protocol event writer.
//! See `serve` for HTTP primitives (banner, file serving, watcher).
//! See `http` for the binary's axum + tokio layer (Phase 2c-γ).

pub mod events;
pub mod http;
pub mod serve;
```

- [ ] **Step 3: Create `src/main.rs`**

```rust
use clap::Parser;

use domi_server::http::args::Args;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args = Args::parse();
    domi_server::http::run(args).await
}
```

- [ ] **Step 4: Create `src/http/mod.rs` (stub)**

```rust
//! HTTP layer for the `domi-server` binary (Phase 2c-γ).
//!
//! Top-level orchestration lives here; concrete pieces live in sibling modules
//! (`args`, `state`, `router`, `handlers`, `ws`). All async; the library
//! primitives (`events::EventWriter`, `serve::*`) are sync and are wrapped via
//! `spawn_blocking` where needed.

pub mod args;
pub mod handlers;
pub mod router;
pub mod state;
pub mod ws;

/// Stub. Real implementation lands in Task 9.
pub async fn run(_args: args::Args) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    Ok(())
}
```

And create stub `pub mod` files so the binary compiles:

`crates/domi-server/src/http/args.rs`:

```rust
use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "domi-server", version, about = "DOMiNice live feedback server")]
pub struct Args {
    #[arg(long, default_value = "4173")]
    pub port: u16,
    #[arg(long, default_value = "127.0.0.1")]
    pub host: String,
    #[arg(long, default_value = ".domi/output")]
    pub root: std::path::PathBuf,
    #[arg(long, default_value = ".domi/state")]
    pub state: std::path::PathBuf,
    #[arg(long, default_value = "info")]
    pub log_level: String,
}
```

`crates/domi-server/src/http/state.rs`:

```rust
// Stub. Real AppState lands in Task 3.
```

`crates/domi-server/src/http/router.rs`:

```rust
// Stub. Real build_router lands in Task 4.
```

`crates/domi-server/src/http/handlers.rs`:

```rust
// Stub. Real handlers land in Tasks 4–7.
```

`crates/domi-server/src/http/ws.rs`:

```rust
// Stub. Real ws_upgrade lands in Task 8.
```

- [ ] **Step 5: Build, verify GREEN**

Run:

```bash
cargo build --workspace 2>&1 | tail -10
```

Expected: clean build. If `axum`, `tokio`, etc. fail to resolve, re-check the `[dependencies]` block — Cargo merges same-key dependencies only when version constraints are compatible.

- [ ] **Step 6: Smoke-test the binary boots and exits cleanly**

Run:

```bash
cargo run -p domi-server -- --help 2>&1 | tail -20
```

Expected: clap-derive help output listing `--port`, `--host`, `--root`, `--state`, `--log-level`. The stub `run` exits 0.

- [ ] **Step 7: Commit**

```bash
git add crates/domi-server/Cargo.toml crates/domi-server/src/lib.rs crates/domi-server/src/main.rs crates/domi-server/src/http/
git commit -m "feat(domi-server): 2c-γ scaffold — Cargo deps, main.rs, http/ stub"
```

---

### Task 2: `args.rs` — CLI parsing (TDD)

**Files:**
- Modify: `crates/domi-server/src/http/args.rs`

**Interfaces:**
- Consumes: clap derive macro; std env.
- Produces: `pub struct Args { port: u16, host: String, root: PathBuf, state: PathBuf, log_level: String }` plus `Debug, Clone`.

- [ ] **Step 1: Write failing tests at the bottom of `args.rs`**

Replace `crates/domi-server/src/http/args.rs` with:

```rust
use std::path::PathBuf;

use clap::Parser;

#[derive(Parser, Debug, Clone)]
#[command(name = "domi-server", version, about = "DOMiNice live feedback server")]
pub struct Args {
    #[arg(long, default_value = "4173")]
    pub port: u16,
    #[arg(long, default_value = "127.0.0.1")]
    pub host: String,
    #[arg(long, default_value = ".domi/output")]
    pub root: PathBuf,
    #[arg(long, default_value = ".domi/state")]
    pub state: PathBuf,
    #[arg(long, default_value = "info")]
    pub log_level: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_apply_when_no_flags() {
        let a = Args::try_parse_from(["domi-server"]).unwrap();
        assert_eq!(a.port, 4173);
        assert_eq!(a.host, "127.0.0.1");
        assert_eq!(a.root, PathBuf::from(".domi/output"));
        assert_eq!(a.state, PathBuf::from(".domi/state"));
        assert_eq!(a.log_level, "info");
    }

    #[test]
    fn overrides_parse() {
        let a = Args::try_parse_from([
            "domi-server",
            "--port", "9000",
            "--host", "0.0.0.0",
            "--root", "/tmp/root",
            "--state", "/tmp/state",
            "--log-level", "debug",
        ]).unwrap();
        assert_eq!(a.port, 9000);
        assert_eq!(a.host, "0.0.0.0");
        assert_eq!(a.root, PathBuf::from("/tmp/root"));
        assert_eq!(a.state, PathBuf::from("/tmp/state"));
        assert_eq!(a.log_level, "debug");
    }

    #[test]
    fn invalid_port_rejected() {
        let r = Args::try_parse_from(["domi-server", "--port", "not-a-number"]);
        assert!(r.is_err(), "expected parse error for non-numeric port");
    }
}
```

- [ ] **Step 2: Run, verify GREEN**

```bash
cargo test -p domi-server args 2>&1 | tail -8
```

Expected: 3 new tests pass. (No new failure surface — the impl is already correct from Task 1's stub; these tests just lock it in.)

- [ ] **Step 3: Commit**

```bash
git add crates/domi-server/src/http/args.rs
git commit -m "test(domi-server): args — defaults, overrides, invalid port"
```

---

### Task 3: `state.rs` — `AppState` (TDD)

**Files:**
- Modify: `crates/domi-server/src/http/state.rs`

**Interfaces:**
- Consumes: `tokio::sync::broadcast`, `std::sync::Arc`, `crate::events::EventWriter`, `std::path::PathBuf`.
- Produces:
  ```rust
  pub struct AppState {
      pub root: PathBuf,
      pub state_dir: PathBuf,
      pub writer: Arc<EventWriter>,
      pub broadcaster: tokio::sync::broadcast::Sender<crate::events::Event>,
      pub server_id: ulid::Ulid,
  }
  impl AppState {
      pub fn new(root: PathBuf, state_dir: PathBuf, writer: Arc<EventWriter>, capacity: usize) -> Self;
  }
  ```

- [ ] **Step 1: Write failing tests at the bottom of `state.rs`**

Replace `crates/domi-server/src/http/state.rs` with:

```rust
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
    pub fn new(root: PathBuf, state_dir: PathBuf, writer: Arc<EventWriter>, capacity: usize) -> Self {
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
            ts: chrono::DateTime::parse_from_rfc3339("2026-07-05T18:21:00Z").unwrap().with_timezone(&chrono::Utc),
            src: Source::DomiJs,
            doc: "x".into(),
            kind: Kind::Click,
            target: Target { id: None, selector: None, rect: Rect { x: 0.0, y: 0.0, w: 1.0, h: 1.0 } },
            data: EventData::Click { value: Some("hi".into()) },
        }
    }

    #[test]
    fn new_assigns_unique_server_id() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        let w = Arc::new(EventWriter::new(&path));
        let s1 = AppState::new(dir.path().to_path_buf(), dir.path().to_path_buf(), w.clone(), 16);
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
        let received = rx.try_recv().expect("event delivered").expect("not lagged");
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
```

- [ ] **Step 2: Run, verify GREEN**

```bash
cargo test -p domi-server http::state 2>&1 | tail -8
```

Expected: 3 new tests pass.

- [ ] **Step 3: Commit**

```bash
git add crates/domi-server/src/http/state.rs
git commit -m "feat(domi-server): http::state — AppState with broadcast::Sender"
```

---

### Task 4: `router.rs` + `banner` + `healthz` handlers (TDD)

**Files:**
- Modify: `crates/domi-server/src/http/router.rs`
- Modify: `crates/domi-server/src/http/handlers.rs`

**Interfaces:**
- Consumes: `state::AppState`, `serve::banner::protocol_banner`, axum `Json`, `axum::extract::State`.
- Produces:
  ```rust
  // router.rs
  pub fn build_router(state: Arc<AppState>) -> axum::Router;

  // handlers.rs
  pub async fn banner() -> impl IntoResponse;   // GET /
  pub async fn healthz(State(state): State<Arc<AppState>>) -> impl IntoResponse;  // GET /healthz
  ```

- [ ] **Step 1: Write `router.rs`**

Replace `crates/domi-server/src/http/router.rs` with:

```rust
use std::sync::Arc;

use axum::{
    routing::{get, post},
    Router,
};

use super::{handlers, state::AppState, ws};

pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(handlers::banner))
        .route("/healthz", get(handlers::healthz))
        .route("/api/events", post(handlers::post_event).get(handlers::get_events))
        .route("/ws/events", get(ws::ws_upgrade))
        .fallback(get(handlers::static_serve))
        .with_state(state)
}
```

Note: `static_serve`, `post_event`, `get_events`, `ws_upgrade` are still stubs from Task 1. `build_router` will compile once we implement them in Tasks 5–8. For this task we make the handlers `banner` and `healthz` real, and leave `static_serve`, `post_event`, `get_events` as stub async functions returning `StatusCode::NOT_FOUND` so the router compiles. Update `handlers.rs` per step 2.

- [ ] **Step 2: Write `handlers.rs` with banner, healthz, and stubs for the rest**

Replace `crates/domi-server/src/http/handlers.rs` with:

```rust
//! HTTP request handlers for the `domi-server` binary.
//!
//! Each handler is an `async fn` returning something `IntoResponse`.
//! Validation lives here, near the HTTP boundary; storage and broadcast
//! orchestration live in `state::AppState`.

use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde_json::json;

use super::state::AppState;

pub async fn banner() -> impl IntoResponse {
    let b = crate::serve::banner::protocol_banner();
    Json(json!({
        "name": b[0].1,
        "version": b[1].1,
        "protocol": b[2].1,
    }))
}

pub async fn healthz(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "serverId": state.server_id.to_string(),
    }))
}

// --- stubs (replaced by Tasks 5–7) ---
pub async fn static_serve(
    _state: State<Arc<AppState>>,
    _path: axum::extract::Path<String>,
) -> impl IntoResponse {
    (StatusCode::NOT_FOUND, "static_serve stub")
}

pub async fn post_event(
    _state: State<Arc<AppState>>,
    _body: axum::Json<serde_json::Value>,
) -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, "post_event stub")
}

pub async fn get_events(
    _state: State<Arc<AppState>>,
    _q: axum::extract::Query<GetEventsParams>,
) -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, "get_events stub")
}

#[derive(serde::Deserialize)]
pub struct GetEventsParams {
    pub since: Option<String>,
    pub doc: Option<String>,
    pub limit: Option<usize>,
}
```

- [ ] **Step 3: Write failing tests at the bottom of `handlers.rs`**

Append to the same `handlers.rs` file:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::EventWriter;
    use axum::body::{to_bytes, Body};
    use axum::http::{Request, StatusCode};
    use std::sync::Arc;
    use tempfile::tempdir;
    use tower::ServiceExt;

    fn test_state() -> Arc<AppState> {
        let dir = tempdir().unwrap();
        let root = dir.path().join("root");
        let state = dir.path().join("state");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&state).unwrap();
        let events = state.join("events.jsonl");
        let writer = Arc::new(EventWriter::new(&events));
        Arc::new(AppState::new(root, state, writer, 16))
    }

    #[tokio::test]
    async fn banner_returns_expected_json_shape() {
        let state = test_state();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["name"], "domi-server");
        assert_eq!(json["protocol"], "2");
        assert!(json["version"].is_string());
        assert!(!json["version"].as_str().unwrap().is_empty());
    }

    #[tokio::test]
    async fn healthz_returns_ok() {
        let state = test_state();
        let app = super::super::router::build_router(state.clone());
        let response = app
            .oneshot(Request::builder().uri("/healthz").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
        assert_eq!(json["serverId"], state.server_id.to_string());
    }
}
```

- [ ] **Step 4: Run, verify GREEN**

```bash
cargo test -p domi-server http::handlers 2>&1 | tail -10
```

Expected: 2 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/domi-server/src/http/
git commit -m "feat(domi-server): http::router + banner + healthz"
```

---

### Task 5: `static_serve` handler + 4 tests (TDD)

**Files:**
- Modify: `crates/domi-server/src/http/handlers.rs` (replace stub `static_serve` with real impl + tests)

**Interfaces:**
- Consumes: `State<Arc<AppState>>`, `axum::extract::Path<String>`, `crate::serve::file::{serve_file, ServedFile, ServeError}`.
- Produces: real `static_serve` that maps `ServeError` to 404/500 and `ContentType` to `mime`.

- [ ] **Step 1: Replace the `static_serve` stub with real impl**

In `crates/domi-server/src/http/handlers.rs`, replace the `static_serve` stub:

```rust
pub async fn static_serve(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(req_path): axum::extract::Path<String>,
) -> impl IntoResponse {
    use crate::serve::file::{serve_file, ContentType, ServeError};

    let requested = std::path::PathBuf::from(&req_path);
    match serve_file(&state.root, &requested) {
        Ok(served) => {
            let mime = match served.content_type {
                ContentType::Html => "text/html; charset=utf-8",
                ContentType::Css => "text/css; charset=utf-8",
                ContentType::Js => "application/javascript; charset=utf-8",
                ContentType::Json => "application/json; charset=utf-8",
                ContentType::Png => "image/png",
                ContentType::Jpeg => "image/jpeg",
                ContentType::Svg => "image/svg+xml",
                ContentType::PlainText => "text/plain; charset=utf-8",
                ContentType::OctetStream => "application/octet-stream",
            };
            (
                StatusCode::OK,
                [(axum::http::header::CONTENT_TYPE, mime)],
                served.body,
            )
                .into_response()
        }
        Err(ServeError::NotFound | ServeError::NotAFile | ServeError::EscapedRoot) => {
            (StatusCode::NOT_FOUND, "not found").into_response()
        }
        Err(ServeError::Io(e)) => {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("io: {e}")).into_response()
        }
    }
}
```

- [ ] **Step 2: Append 4 failing tests**

Append to the `tests` module in `handlers.rs`:

```rust
    use std::io::Write;

    #[tokio::test]
    async fn serve_html_200_with_shim_injected() {
        let state = test_state();
        std::fs::write(
            state.root.join("dashboard.html"),
            r#"<!doctype html><html><body><script src="../scripts/domi.js"></script></body></html>"#,
        ).unwrap();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(Request::builder().uri("/dashboard.html").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let s = std::str::from_utf8(&body).unwrap();
        assert!(s.contains("window.__DOMI_SERVER__"), "shim injected");
        assert!(s.contains("domi.js"), "original script tag preserved");
        // shim must come BEFORE the original `<script>` so it sets the flag first.
        let shim_pos = s.find("window.__DOMI_SERVER__").unwrap();
        let original_pos = s.find("domi.js").unwrap();
        assert!(shim_pos < original_pos, "shim before original");
    }

    #[tokio::test]
    async fn serve_css_200_unchanged() {
        let state = test_state();
        let mut f = std::fs::File::create(state.root.join("style.css")).unwrap();
        f.write_all(b"body { color: red; }").unwrap();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(Request::builder().uri("/style.css").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let s = std::str::from_utf8(&body).unwrap();
        assert!(s.contains("color: red"));
    }

    #[tokio::test]
    async fn serve_404_on_missing() {
        let state = test_state();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(Request::builder().uri("/nope.html").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn serve_404_on_escape() {
        let state = test_state();
        // Write a file outside the root.
        let outside = state.root.parent().unwrap().join("outside.html");
        std::fs::write(&outside, "<html></html>").unwrap();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(Request::builder().uri("/../outside.html").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
```

- [ ] **Step 3: Run, verify GREEN**

```bash
cargo test -p domi-server http::handlers 2>&1 | tail -10
```

Expected: 6 tests pass (2 prior + 4 new).

- [ ] **Step 4: Commit**

```bash
git add crates/domi-server/src/http/handlers.rs
git commit -m "feat(domi-server): static_serve handler with content-type + shim injection"
```

---

### Task 6: `post_event` handler + 6 tests (TDD)

**Files:**
- Modify: `crates/domi-server/src/http/handlers.rs`

**Interfaces:**
- Consumes: `State<Arc<AppState>>`, `axum::Json<serde_json::Value>`, `crate::events::{Event, EventWriter, EventData, Kind, Source, Rect, Target}`.
- Produces: real `post_event` returning `StatusCode::NO_CONTENT` on success, `400` on validation, `500` on writer failure. Stamps `id` (ULID) and `ts` (RFC3339) on incoming JSON before deserializing through `Event`. Tolerates `target: null` by substituting a default `Target` (2b compat).

- [ ] **Step 1: Replace the `post_event` stub**

Replace the `post_event` stub in `handlers.rs`:

```rust
pub async fn post_event(
    State(state): State<Arc<AppState>>,
    axum::Json(mut raw): axum::Json<serde_json::Value>,
) -> impl IntoResponse {
    use crate::events::Event;

    // 0. Body must be a JSON object.
    if !raw.is_object() {
        return (StatusCode::BAD_REQUEST, "expected JSON object".to_string()).into_response();
    }

    // 1. Validate v == 2.
    let v = raw.get("v").and_then(|x| x.as_u64());
    match v {
        Some(2) => {}
        Some(other) => return (StatusCode::BAD_REQUEST, format!("unsupported protocol version: {other}")).into_response(),
        None => return (StatusCode::BAD_REQUEST, "missing v".to_string()).into_response(),
    }

    // 2. Stamp id if missing or null.
    if raw.get("id").map_or(true, |x| x.is_null()) {
        raw["id"] = json!(ulid::Ulid::new().to_string());
    }

    // 3. Stamp ts if missing.
    if raw.get("ts").is_none() {
        raw["ts"] = json!(chrono::Utc::now().to_rfc3339());
    }

    // 4. Substitute default Target if null (2b rail-resolve sends `target: null`).
    if raw.get("target").map_or(false, |x| x.is_null()) {
        raw["target"] = json!({"id": null, "selector": null, "rect": {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0}});
    }

    // 5. Deserialize to typed Event.
    let event: Event = match serde_json::from_value(raw) {
        Ok(e) => e,
        Err(e) => return (StatusCode::BAD_REQUEST, format!("invalid event: {e}")).into_response(),
    };

    // 6. Doc non-empty.
    if event.doc.is_empty() {
        return (StatusCode::BAD_REQUEST, "doc must be non-empty".to_string()).into_response();
    }

    // 7. spawn_blocking write.
    let writer = Arc::clone(&state.writer);
    let ev_clone = event.clone();
    let write_result = tokio::task::spawn_blocking(move || writer.write(&ev_clone)).await;
    let write_result = match write_result {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("join: {e}")).into_response(),
    };
    if let Err(e) = write_result {
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("write: {e}")).into_response();
    }

    // 8. Broadcast (ignore send errors — no subscribers is fine).
    let _ = state.broadcaster.send(event);

    (StatusCode::NO_CONTENT, "").into_response()
}
```

- [ ] **Step 2: Append 6 failing tests**

Append to the `tests` module:

```rust
    fn post_url() -> &'static str { "/api/events" }

    fn sample_payload(doc: &str) -> serde_json::Value {
        json!({
            "v": 2,
            "id": null,
            "ts": "2026-07-05T18:21:00Z",
            "src": "domi.js",
            "doc": doc,
            "kind": "click",
            "target": {"id": "btn-save", "selector": null, "rect": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}},
            "data": {"value": "Save"}
        })
    }

    #[tokio::test]
    async fn post_event_204_and_appends_to_file() {
        let state = test_state();
        let app = super::super::router::build_router(state.clone());
        let payload = sample_payload("smoke-1");
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(post_url())
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        // File should now have one line.
        let events_path = state.state_dir.join("events.jsonl");
        let body = std::fs::read_to_string(&events_path).unwrap();
        assert_eq!(body.lines().count(), 1);
    }

    #[tokio::test]
    async fn post_event_stamps_id_when_null() {
        let state = test_state();
        let app = super::super::router::build_router(state.clone());
        let payload = sample_payload("smoke-id-null");
        let _ = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(post_url())
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let events_path = state.state_dir.join("events.jsonl");
        let body = std::fs::read_to_string(&events_path).unwrap();
        let ev: serde_json::Value = serde_json::from_str(body.lines().next().unwrap()).unwrap();
        assert!(ev["id"].is_string());
        let s = ev["id"].as_str().unwrap();
        assert_eq!(s.len(), 26, "stamped id is a ULID (26 chars)");
        assert!(!s.contains("null"));
    }

    #[tokio::test]
    async fn post_event_stamps_id_when_missing() {
        let state = test_state();
        let app = super::super::router::build_router(state.clone());
        let mut payload = sample_payload("smoke-id-missing");
        payload.as_object_mut().unwrap().remove("id");
        let _ = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(post_url())
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let events_path = state.state_dir.join("events.jsonl");
        let body = std::fs::read_to_string(&events_path).unwrap();
        let ev: serde_json::Value = serde_json::from_str(body.lines().next().unwrap()).unwrap();
        assert_eq!(ev["id"].as_str().unwrap().len(), 26);
    }

    #[tokio::test]
    async fn post_event_400_on_v_not_2() {
        let state = test_state();
        let app = super::super::router::build_router(state);
        let mut payload = sample_payload("smoke-v1");
        payload["v"] = json!(1);
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(post_url())
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn post_event_400_on_empty_doc() {
        let state = test_state();
        let app = super::super::router::build_router(state);
        let payload = sample_payload("");
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(post_url())
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn post_event_400_on_bad_kind() {
        let state = test_state();
        let app = super::super::router::build_router(state);
        let mut payload = sample_payload("smoke-bad-kind");
        payload["kind"] = json!("bogus");
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(post_url())
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
```

- [ ] **Step 3: Run, verify GREEN**

```bash
cargo test -p domi-server http::handlers 2>&1 | tail -10
```

Expected: 12 tests pass (6 prior + 6 new).

- [ ] **Step 4: Commit**

```bash
git add crates/domi-server/src/http/handlers.rs
git commit -m "feat(domi-server): post_event — validate, stamp id/ts, spawn_blocking write, broadcast"
```

---

### Task 7: `get_events` handler + 4 tests (TDD)

**Files:**
- Modify: `crates/domi-server/src/http/handlers.rs`

**Interfaces:**
- Consumes: `State<Arc<AppState>>`, `axum::extract::Query<GetEventsParams>`. Reads `state.state_dir/events.jsonl` line by line.
- Produces: real `get_events` returning `Json({events, nextSince})`. Filters by `since` (lexical ULID compare) and `doc` (exact match). `limit` clamped to [1, 1000], default 100. Malformed lines dropped silently.

- [ ] **Step 1: Replace the `get_events` stub**

Replace the `get_events` stub in `handlers.rs`:

```rust
pub async fn get_events(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<GetEventsParams>,
) -> impl IntoResponse {
    use crate::events::Event;

    let limit = params.limit.unwrap_or(100).clamp(1, 1000);
    let events_path = state.state_dir.join("events.jsonl");

    let body = match std::fs::read_to_string(&events_path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return (StatusCode::OK, Json(json!({"events": [], "nextSince": null}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("read: {e}")).into_response(),
    };

    let mut kept: Vec<Event> = Vec::with_capacity(limit);
    for line in body.lines() {
        if line.trim().is_empty() { continue; }
        let ev: Event = match serde_json::from_str(line) {
            Ok(e) => e,
            Err(_) => continue, // skip malformed
        };
        if let Some(ref since) = params.since {
            if ev.id.to_string().as_str() <= since.as_str() { continue; }
        }
        if let Some(ref doc) = params.doc {
            if ev.doc != *doc { continue; }
        }
        kept.push(ev);
        if kept.len() >= limit { break; }
    }

    let next_since = kept.last().map(|e| e.id.to_string());
    let events_json: Vec<serde_json::Value> = kept
        .iter()
        .map(|e| serde_json::to_value(e).unwrap_or(serde_json::Value::Null))
        .collect();

    (StatusCode::OK, Json(json!({"events": events_json, "nextSince": next_since}))).into_response()
}
```

- [ ] **Step 2: Append 4 failing tests**

Append to the `tests` module:

```rust
    use crate::events::{Event, EventData, Kind, Rect, Source, Target};
    use ulid::Ulid;

    fn write_three_events(state: &Arc<AppState>) -> Vec<Ulid> {
        let w = state.writer.clone();
        let mut ids = Vec::new();
        for i in 0..3 {
            let id = Ulid::new();
            let ev = Event {
                v: 2,
                id,
                ts: chrono::Utc::now(),
                src: Source::DomiJs,
                doc: format!("doc-{i}"),
                kind: Kind::Click,
                target: Target { id: None, selector: None, rect: Rect { x: 0.0, y: 0.0, w: 1.0, h: 1.0 } },
                data: EventData::Click { value: Some(format!("v{i}").into()) },
            };
            w.write(&ev).unwrap();
            ids.push(id);
        }
        ids
    }

    #[tokio::test]
    async fn get_events_returns_filtered_after_since() {
        let state = test_state();
        let ids = write_three_events(&state);
        let app = super::super::router::build_router(state);
        let url = format!("/api/events?since={}", ids[0]);
        let response = app
            .oneshot(Request::builder().uri(&url).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let events = json["events"].as_array().unwrap();
        assert_eq!(events.len(), 2, "expected events 2 and 3, got {:?}", events);
        assert_eq!(json["nextSince"].as_str().unwrap(), ids[2].to_string());
    }

    #[tokio::test]
    async fn get_events_filters_by_doc() {
        let state = test_state();
        write_three_events(&state);
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(Request::builder().uri("/api/events?doc=doc-1").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let events = json["events"].as_array().unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["doc"], "doc-1");
    }

    #[tokio::test]
    async fn get_events_default_limit_100() {
        let state = test_state();
        // Write 150 events directly to the file (faster than going through HTTP).
        let mut lines = String::new();
        for i in 0..150 {
            let id = Ulid::new();
            let ev = Event {
                v: 2, id,
                ts: chrono::Utc::now(),
                src: Source::DomiJs,
                doc: "x".into(),
                kind: Kind::Click,
                target: Target { id: None, selector: None, rect: Rect { x: 0.0, y: 0.0, w: 1.0, h: 1.0 } },
                data: EventData::Click { value: None },
            };
            lines.push_str(&serde_json::to_string(&ev).unwrap());
            lines.push('\n');
        }
        std::fs::write(state.state_dir.join("events.jsonl"), lines).unwrap();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(Request::builder().uri("/api/events").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["events"].as_array().unwrap().len(), 100);
    }

    #[tokio::test]
    async fn get_events_limit_clamped_to_1000() {
        let state = test_state();
        let mut lines = String::new();
        for _ in 0..1500 {
            let id = Ulid::new();
            let ev = Event {
                v: 2, id,
                ts: chrono::Utc::now(),
                src: Source::DomiJs,
                doc: "x".into(),
                kind: Kind::Click,
                target: Target { id: None, selector: None, rect: Rect { x: 0.0, y: 0.0, w: 1.0, h: 1.0 } },
                data: EventData::Click { value: None },
            };
            lines.push_str(&serde_json::to_string(&ev).unwrap());
            lines.push('\n');
        }
        std::fs::write(state.state_dir.join("events.jsonl"), lines).unwrap();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(Request::builder().uri("/api/events?limit=9999").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["events"].as_array().unwrap().len(), 1000);
    }
```

- [ ] **Step 3: Run, verify GREEN**

```bash
cargo test -p domi-server http::handlers 2>&1 | tail -10
```

Expected: 16 tests pass (12 prior + 4 new).

- [ ] **Step 4: Commit**

```bash
git add crates/domi-server/src/http/handlers.rs
git commit -m "feat(domi-server): get_events — file replay with since/doc/limit filter"
```

---

### Task 8: `ws.rs` — WebSocket upgrade + handler + 1 test (TDD)

**Files:**
- Modify: `crates/domi-server/src/http/ws.rs`

**Interfaces:**
- Consumes: `axum::extract::ws::{WebSocket, WebSocketUpgrade, Message}`, `futures::{SinkExt, StreamExt}`, `crate::events::Event`, `super::state::AppState`.
- Produces:
  ```rust
  pub async fn ws_upgrade(
      State(state): State<Arc<AppState>>,
      ws: WebSocketUpgrade,
  ) -> impl IntoResponse;

  async fn handle(socket: WebSocket, state: Arc<AppState>);
  ```

- [ ] **Step 1: Add dev-dependency `tokio-tungstenite` for the test only**

Add to `[dev-dependencies]` in `crates/domi-server/Cargo.toml`:

```toml
tokio-tungstenite = "0.24"
```

(Used only in the integration test in step 3.)

- [ ] **Step 2: Replace `ws.rs` with real impl**

Replace `crates/domi-server/src/http/ws.rs`:

```rust
use std::sync::Arc;

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use serde_json::json;
use tokio::sync::broadcast::error::RecvError;

use super::state::AppState;

pub async fn ws_upgrade(
    State(state): State<Arc<AppState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle(socket, state))
}

async fn handle(mut socket: WebSocket, state: Arc<AppState>) {
    // 1. Send hello.
    let hello = json!({
        "type": "hello",
        "v": 2,
        "serverId": state.server_id.to_string(),
    });
    if socket.send(Message::Text(hello.to_string())).await.is_err() {
        return;
    }

    // 2. Subscribe.
    let mut rx = state.broadcaster.subscribe();

    // 3. Forward loop.
    loop {
        tokio::select! {
            ev = rx.recv() => {
                match ev {
                    Ok(event) => {
                        let frame = json!({"type": "event", "event": event});
                        if socket.send(Message::Text(frame.to_string())).await.is_err() {
                            break;
                        }
                    }
                    Err(RecvError::Lagged(_)) => continue,
                    Err(RecvError::Closed) => break,
                }
            }
            msg = socket.next() => {
                match msg {
                    Some(Ok(_)) => continue, // accept and ignore
                    Some(Err(_)) | None => break,
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::{Event, EventData, Kind, Rect, Source, Target};
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use futures::SinkExt as _;
    use futures::StreamExt as _;
    use std::sync::Arc;
    use tempfile::tempdir;
    use tokio::net::TcpListener;
    use tokio_tungstenite::tungstenite::handshake::client::{generate_key, Request as TgRequest};
    use tokio_tungstenite::tungstenite::Message as TgMessage;
    use tower::ServiceExt;
    use ulid::Ulid;

    #[tokio::test]
    async fn ws_upgrade_receives_hello_then_event() {
        // Bind a real port; the WS test needs a real URL.
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        // Build router in-process; serve it in a background task on the listener.
        let dir = tempdir().unwrap();
        let root = dir.path().join("root");
        let state_dir = dir.path().join("state");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&state_dir).unwrap();
        let writer = Arc::new(EventWriter::new(&state_dir.join("events.jsonl")));
        let state = Arc::new(AppState::new(root, state_dir, writer, 16));
        let state_for_serve = state.clone();
        let serve = tokio::spawn(async move {
            axum::serve(listener, super::super::router::build_router(state_for_serve))
                .await
                .unwrap();
        });

        // Connect a tungstenite WS client.
        let url = format!("ws://{addr}/ws/events");
        let req = TgRequest::builder().method("GET").uri(&url).header("host", addr.to_string()).header("connection", "Upgrade").header("upgrade", "websocket").header("sec-websocket-version", "13").header("sec-websocket-key", generate_key()).body(()).unwrap();
        let (mut ws, _resp) = tokio_tungstenite::connect_async(req).await.expect("ws connect");

        // 1. Receive hello.
        let hello_frame = ws.next().await.expect("hello frame").expect("not error");
        let hello_str = match hello_frame {
            TgMessage::Text(s) => s,
            other => panic!("expected text frame, got {other:?}"),
        };
        let hello: serde_json::Value = serde_json::from_str(&hello_str).unwrap();
        assert_eq!(hello["type"], "hello");
        assert_eq!(hello["v"], 2);
        assert_eq!(hello["serverId"], state.server_id.to_string());

        // 2. Trigger an event by writing through the broadcaster directly.
        // (We could POST through HTTP, but that requires a request body and
        // a second helper; for this test, broadcasting is what we're verifying.)
        let ev = Event {
            v: 2,
            id: Ulid::new(),
            ts: chrono::Utc::now(),
            src: Source::DomiJs,
            doc: "ws-smoke".into(),
            kind: Kind::Click,
            target: Target { id: None, selector: None, rect: Rect { x: 0.0, y: 0.0, w: 1.0, h: 1.0 } },
            data: EventData::Click { value: Some("hi".into()) },
        };
        let _ = state.broadcaster.send(ev.clone());

        // 3. Receive event frame.
        let event_frame = ws.next().await.expect("event frame").expect("not error");
        let event_str = match event_frame {
            TgMessage::Text(s) => s,
            other => panic!("expected text frame, got {other:?}"),
        };
        let frame: serde_json::Value = serde_json::from_str(&event_str).unwrap();
        assert_eq!(frame["type"], "event");
        assert_eq!(frame["event"]["doc"], "ws-smoke");

        // Close.
        let _ = ws.send(TgMessage::Close(None)).await;
        drop(ws);
        serve.abort();
    }
}
```

- [ ] **Step 3: Run, verify GREEN**

```bash
cargo test -p domi-server http::ws 2>&1 | tail -15
```

Expected: 1 new test passes.

If `tokio_tungstenite::connect_async` fails to resolve, re-check the dev-dependency line — `tokio-tungstenite = "0.24"` is the current major. If 0.24 isn't available in the registry, use `tokio-tungstenite = "0.23"` (still works with tokio 1).

- [ ] **Step 4: Commit**

```bash
git add crates/domi-server/Cargo.toml crates/domi-server/src/http/ws.rs
git commit -m "feat(domi-server): http::ws — WebSocket upgrade, hello, broadcast loop"
```

---

### Task 9: `http::run` orchestration — bind, watcher, shutdown

**Files:**
- Modify: `crates/domi-server/src/http/mod.rs`

**Interfaces:**
- Consumes: `args::Args`, `state::AppState`, `serve::watcher::NotifyWatcher`, axum `serve`.
- Produces: real `run(args)` that initializes tracing, creates state dir, constructs `AppState`, spawns watcher logger, builds router, binds `host:port`, serves with graceful shutdown on SIGINT/SIGTERM.

- [ ] **Step 1: Replace `http/mod.rs` with real orchestration**

Replace `crates/domi-server/src/http/mod.rs`:

```rust
//! HTTP layer for the `domi-server` binary (Phase 2c-γ).
//!
//! Top-level orchestration lives here; concrete pieces live in sibling modules.

pub mod args;
pub mod handlers;
pub mod router;
pub mod state;
pub mod ws;

use std::sync::Arc;

use tracing_subscriber::EnvFilter;

use crate::events::EventWriter;
use crate::serve::watcher::{NotifyWatcher, WatchEventKind};

use self::args::Args;
use self::state::AppState;

pub async fn run(args: Args) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 1. tracing init.
    let filter = EnvFilter::try_new(&args.log_level)
        .unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    // 2. Ensure state dir exists; resolve events.jsonl path.
    std::fs::create_dir_all(&args.state)?;
    std::fs::create_dir_all(&args.root)?;
    let events_path = args.state.join("events.jsonl");

    // 3. Construct EventWriter (sync).
    let writer = Arc::new(EventWriter::new(&events_path));

    // 4. Construct AppState.
    let state = Arc::new(AppState::new(
        args.root.clone(),
        args.state.clone(),
        writer,
        256,
    ));

    // 5. Spawn watcher logger.
    spawn_watcher_logger(&args.root);

    // 6. Build router.
    let router = router::build_router(state.clone());

    // 7. Bind.
    let addr = format!("{}:{}", args.host, args.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(%addr, server_id = %state.server_id, "domi-server listening");

    // 8. Serve with graceful shutdown.
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn spawn_watcher_logger(root: &std::path::Path) {
    let mut watcher = match NotifyWatcher::new(root, 50) {
        Ok(w) => w,
        Err(e) => {
            tracing::warn!(error = %e, "watcher init failed; continuing without");
            return;
        }
    };
    tokio::spawn(async move {
        loop {
            match watcher.next_event(500) {
                Ok(Some(ev)) => {
                    let kind = match ev.kind {
                        WatchEventKind::Created => "created",
                        WatchEventKind::Modified => "modified",
                        WatchEventKind::Removed => "removed",
                        WatchEventKind::Any => "any",
                    };
                    for p in &ev.paths {
                        tracing::debug!(kind, path = %p.display(), "watcher");
                    }
                }
                Ok(None) => continue,
                Err(e) => {
                    tracing::warn!(error = %e, "watcher error; stopping");
                    break;
                }
            }
        }
    });
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let sigterm = async {
        let mut s = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler");
        s.recv().await;
    };
    #[cfg(not(unix))]
    let sigterm = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {}
        _ = sigterm => {}
    }
    tracing::info!("shutdown signal received");
}
```

- [ ] **Step 2: Add `tracing-subscriber` dep**

Append to `[dependencies]` in `crates/domi-server/Cargo.toml`:

```toml
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

- [ ] **Step 3: Build, verify GREEN**

```bash
cargo build --workspace 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 4: Run tests, verify no regressions**

```bash
cargo test -p domi-server 2>&1 | tail -8
npm test 2>&1 | tail -5
```

Expected: 17 prior + 1 ws = 18 passing, no regressions.

- [ ] **Step 5: Manual smoke**

```bash
cargo run -p domi-server -- --port 4173 &
SERVER_PID=$!
sleep 1
curl -s http://127.0.0.1:4173/ | head -5
curl -s http://127.0.0.1:4173/healthz | head -5
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null
```

Expected: `/` returns JSON with name/version/protocol; `/healthz` returns `{"status":"ok","serverId":"..."}`.

- [ ] **Step 6: Commit**

```bash
git add crates/domi-server/Cargo.toml crates/domi-server/src/http/mod.rs
git commit -m "feat(domi-server): http::run — bind, watcher, graceful shutdown"
```

---

### Task 10: Binary smoke test (gated)

**Files:**
- Modify: `crates/domi-server/src/http/mod.rs` (add gated integration test at the bottom)

**Interfaces:**
- Consumes: `tokio::process::Command`, `tokio::net::TcpStream`, `tokio_tungstenite` (already in dev-deps from Task 8).
- Produces: 1 gated integration test that spawns the actual `domi-server` binary in a temp dir on port 0 (or a free port), POSTs an event, GETs it back, opens WS, asserts hello + event frame.

- [ ] **Step 1: Append gated integration test**

Append to `crates/domi-server/src/http/mod.rs`:

```rust
#[cfg(test)]
mod smoke_test {
    //! Gated end-to-end test that spawns the actual `domi-server` binary.
    //! Run with `cargo test -p domi-server -- --ignored smoke`.
    //!
    //! This test addresses HANDOFF.md's "no live integration test against
    //! an actual `domi-server` binary" risk by exercising the real binary
    //! (not the in-process router) end-to-end.

    use std::time::Duration;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::process::Command;
    use tokio_tungstenite::tungstenite::handshake::client::{generate_key, Request as TgRequest};
    use tokio_tungstenite::tungstenite::Message as TgMessage;
    use futures::{SinkExt, StreamExt};

    /// Find a free port by binding then dropping.
    async fn free_port() -> u16 {
        let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let p = l.local_addr().unwrap().port();
        drop(l);
        p
    }

    /// Wait until the server accepts a TCP connection on `port`, with a deadline.
    async fn wait_for_bind(port: u16, timeout: Duration) {
        let deadline = std::time::Instant::now() + timeout;
        while std::time::Instant::now() < deadline {
            if tokio::net::TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        panic!("server did not bind within {timeout:?}");
    }

    #[tokio::test]
    #[ignore = "spawns the actual binary; run with --ignored"]
    async fn binary_smoke_boot_post_get_ws() {
        // 1. Find a free port and set up tempdirs.
        let port = free_port().await;
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("root");
        let state_dir = tmp.path().join("state");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&state_dir).unwrap();

        // 2. Locate the binary. cargo test sets CARGO_BIN_EXE_<name> for [[bin]] targets.
        let bin_path = env!("CARGO_BIN_EXE_domi-server");

        // 3. Spawn.
        let mut child = Command::new(bin_path)
            .arg("--port").arg(port.to_string())
            .arg("--host").arg("127.0.0.1")
            .arg("--root").arg(&root)
            .arg("--state").arg(&state_dir)
            .arg("--log-level").arg("warn")
            .kill_on_drop(true)
            .spawn()
            .expect("spawn domi-server");

        // 4. Wait for bind.
        wait_for_bind(port, Duration::from_secs(5)).await;

        // 5. POST an event.
        let payload = serde_json::json!({
            "v": 2,
            "id": null,
            "ts": "2026-07-05T18:21:00Z",
            "src": "domi.js",
            "doc": "smoke-binary",
            "kind": "click",
            "target": {"id": "btn", "selector": null, "rect": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}},
            "data": {"value": "hello"}
        });
        let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        let body = payload.to_string();
        let req = format!(
            "POST /api/events HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(), body
        );
        stream.write_all(req.as_bytes()).await.unwrap();
        let mut resp = Vec::new();
        stream.read_to_end(&mut resp).await.unwrap();
        let resp_s = String::from_utf8_lossy(&resp);
        assert!(resp_s.starts_with("HTTP/1.1 204"), "expected 204, got: {}", &resp_s[..resp_s.find('\r').unwrap_or(resp_s.len()).min(100)]);

        // 6. GET it back.
        let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        let req = format!(
            "GET /api/events?doc=smoke-binary HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
        );
        stream.write_all(req.as_bytes()).await.unwrap();
        let mut resp = Vec::new();
        stream.read_to_end(&mut resp).await.unwrap();
        let resp_s = String::from_utf8_lossy(&resp);
        assert!(resp_s.starts_with("HTTP/1.1 200"));
        let body_start = resp_s.find("\r\n\r\n").unwrap() + 4;
        let body_str = &resp_s[body_start..];
        let json: serde_json::Value = serde_json::from_str(body_str).expect("json body");
        let events = json["events"].as_array().expect("events array");
        assert_eq!(events.len(), 1, "expected 1 event, got {}", events.len());
        assert_eq!(events[0]["doc"], "smoke-binary");
        assert_eq!(events[0]["data"]["value"], "hello");
        assert!(events[0]["id"].as_str().unwrap().len() == 26, "id stamped");

        // 7. Open WS.
        let url = format!("ws://127.0.0.1:{port}/ws/events");
        let req = TgRequest::builder()
            .method("GET")
            .uri(&url)
            .header("host", format!("127.0.0.1:{port}"))
            .header("connection", "Upgrade")
            .header("upgrade", "websocket")
            .header("sec-websocket-version", "13")
            .header("sec-websocket-key", generate_key())
            .body(())
            .unwrap();
        let (mut ws, _resp) = tokio_tungstenite::connect_async(req).await.expect("ws connect");

        let hello_frame = ws.next().await.expect("hello").expect("not err");
        let hello_str = match hello_frame { TgMessage::Text(s) => s, other => panic!("got {other:?}") };
        let hello: serde_json::Value = serde_json::from_str(&hello_str).unwrap();
        assert_eq!(hello["type"], "hello");
        assert_eq!(hello["v"], 2);

        // 8. POST another event; receive it on WS.
        let payload2 = serde_json::json!({
            "v": 2, "id": null, "ts": "2026-07-05T18:22:00Z",
            "src": "domi.js", "doc": "smoke-binary",
            "kind": "click", "target": {"id": null, "selector": null, "rect": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}},
            "data": {"value": "second"}
        });
        let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        let body = payload2.to_string();
        let req = format!(
            "POST /api/events HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(), body
        );
        stream.write_all(req.as_bytes()).await.unwrap();
        let mut resp = Vec::new();
        stream.read_to_end(&mut resp).await.unwrap();

        let event_frame = ws.next().await.expect("event frame").expect("not err");
        let event_str = match event_frame { TgMessage::Text(s) => s, other => panic!("got {other:?}") };
        let frame: serde_json::Value = serde_json::from_str(&event_str).unwrap();
        assert_eq!(frame["type"], "event");
        assert_eq!(frame["event"]["data"]["value"], "second");

        // 9. Tear down.
        let _ = ws.send(TgMessage::Close(None)).await;
        drop(ws);
        let _ = child.kill().await;
    }
}
```

- [ ] **Step 2: Run the gated test, verify GREEN**

```bash
cargo test -p domi-server -- --ignored smoke 2>&1 | tail -15
```

Expected: 1 ignored test now runs and passes. The test exercises the real `domi-server` binary end-to-end (POST → file → GET → WS broadcast).

- [ ] **Step 3: Verify the default test suite still passes**

```bash
cargo test -p domi-server 2>&1 | tail -5
```

Expected: 17 prior + 1 ws = 18 passing + 1 ignored (the binary smoke).

- [ ] **Step 4: Commit**

```bash
git add crates/domi-server/src/http/mod.rs
git commit -m "test(domi-server): gated binary smoke test — boot → POST → GET → WS end-to-end"
```

---

### Task 11: Documentation + release notes

**Files:**
- Modify: `docs/RUST.md`
- Modify: `docs/PHASE2-SCOPE.md`
- Modify: `RELEASE-NOTES-v0.1.0.md`

- [ ] **Step 1: Update `docs/RUST.md` crate layout**

In `docs/RUST.md`, replace the layout block under `## Layout` with:

````markdown
```
Cargo.toml                    # workspace, at repo root
rust-toolchain.toml           # pins stable channel
crates/
  domi-server/
    Cargo.toml                # crate manifest + [[bin]] name="domi-server"
    build.rs                              # reads scripts/domi-server.js → SHIM_BYTES
    src/
      lib.rs                  # re-exports events, serve, http
      main.rs                 # tokio::main → http::run
      events/                           # 2c-α
        mod.rs
        event.rs
        writer.rs
      serve/                            # 2c-β
        mod.rs
        banner.rs                          # GET /
        file.rs                            # serve_file + shim injection
        shim.rs                            # SHIM_BYTES (compile-time embedded)
        watcher.rs                         # Watcher trait + NotifyWatcher + MockWatcher
      http/                             # 2c-γ
        mod.rs                            # run() — top-level orchestration + watcher spawn
        args.rs                           # clap derive CLI
        state.rs                          # AppState (Arc<EventWriter> + broadcast::Sender)
        router.rs                         # build_router
        handlers.rs                       # banner, healthz, static_serve, post_event, get_events
        ws.rs                             # /ws/events upgrade + broadcast loop
```
````

Then update the "Phasing within Rust" table to mark 2c-γ as done:

```markdown
| Round | Crate/Subcrate | Surface |
|---|---|---|
| 2c-α | `domi-server` library | `events` module — **done** |
| 2c-β | `domi-server` library | `serve` module — **done** |
| 2c-γ | `domi-server` binary | `main.rs` + `http/` — **done** |
| 2d | `tools/` | agent CLI + install/verify — **next** |
```

- [ ] **Step 2: Update `docs/PHASE2-SCOPE.md`**

In `docs/PHASE2-SCOPE.md`, change the 2c-γ row from "Not started" to "Done" with a one-line note:

```markdown
| **2c-γ** | `domi-server` binary + axum + tokio + WS | **Done** | The actual `domi-server` binary; uses 2c-α + 2c-β |
```

- [ ] **Step 3: Append release-notes section**

Append to `RELEASE-NOTES-v0.1.0.md`:

```markdown

---

## Phase 2c-γ — `domi-server` binary (2026-07-05)

- New `domi-server` binary: `cargo run -p domi-server -- --port 4173` boots the live feedback server.
- axum 0.7 + tokio 1 + tower/tower-http + clap 4 + futures 0.3 (all permissively licensed).
- `crates/domi-server/src/http/` module: `args` (clap derive), `state` (AppState with broadcast channel), `router` (axum Router), `handlers` (banner, healthz, static_serve, post_event, get_events), `ws` (WebSocket upgrade + broadcast loop), `mod` (top-level orchestration with graceful shutdown).
- Routes wired per 2a spec: `GET /`, `GET /<path>` (HTML shim injection from 2c-β), `POST /api/events` (validates v=2, stamps id/ts on missing, spawn_blocking write, broadcast), `GET /api/events?since=&doc=&limit=` (filter + clamp limit 1–1000), `GET /ws/events` (hello frame + event broadcasts).
- Additive `GET /healthz` for tooling (not in 2a route table; documented).
- Graceful shutdown on SIGINT/SIGTERM via `tokio::signal`.
- Watcher wired to a `tracing::debug!` loop to demonstrate end-to-end correctness of the 2c-β API; no cache layer.
- 17 new handler tests + 1 WebSocket test + 1 gated binary smoke test (`cargo test -p domi-server -- --ignored smoke`).
- Total: 22 prior + 18 new = 40 passing + 1 ignored.
- `Cargo.lock` continues to be gitignored (unchanged from 2c-α/2c-β).
- Library files (`tokens/`, `components/`, `scripts/domi.js`, `scripts/domi-audit.js`, original `templates/*/`, `examples/`): untouched.
```

- [ ] **Step 4: Final verification**

```bash
cargo test --workspace 2>&1 | tail -5
npm test 2>&1 | tail -5
cargo test -p domi-server -- --ignored smoke 2>&1 | tail -5
```

Expected:
- `cargo test --workspace` → 18 passing + 1 ignored.
- `npm test` → 83/83 passing (no regressions).
- Gated smoke → 1 passing.

- [ ] **Step 5: Commit**

```bash
git add docs/RUST.md docs/PHASE2-SCOPE.md RELEASE-NOTES-v0.1.0.md
git commit -m "docs(rust): Phase 2c-γ release notes + RUST.md layout + scope map"
```

---

## Done when

All 11 task checklists complete; `cargo test --workspace` shows 18 passing + 1 ignored; `cargo test -p domi-server -- --ignored smoke` passes; `npm test` shows 83/83 passing; `cargo run -p domi-server -- --port 4173` boots a working server (manual smoke confirmed in Task 9 step 5); the only JS-half files touched since v0.1.0 remain `scripts/domi-server.js` and `tests/domi-server-js.test.js` (from 2c-β); library files (`tokens/`, `components/`, original `templates/*/`, `scripts/domi.js`, `scripts/domi-audit.js`, `examples/`) have no NEW diffs from this round.
