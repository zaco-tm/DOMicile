# Phase 2c-γ — `domi-server` Binary

**Date:** 2026-07-05
**Status:** Approved (post self-review)
**Phase:** 2c-γ of Phase 2 (decomposed: 2a wire protocol (shipped), 2b server-attached JS (shipped), 2c-α events writer (shipped), 2c-β HTML serving + watcher (shipped), **2c-γ binary (this spec)**, 2d agent tooling)
**Upstream contracts:**
- `docs/WIRE-PROTOCOL.md` (v2 wire format — pinned)
- `docs/schemas/event.schema.json` (canonical event shape)
- `crates/domi-server/src/events/` (2c-α sync writer — `EventWriter`, `Event`, `FileShape`, `Rotation`, `WriteError`)
- `crates/domi-server/src/serve/` (2c-β sync HTTP primitives — `serve_file`, `ContentType`, `ServeError`, `Watcher` trait + `NotifyWatcher` + `MockWatcher`, `protocol_banner`, embedded `SHIM_BYTES`)
- `scripts/domi.js` and `scripts/domi-audit.js` (server-attached mode: POST `/api/events`, listen on `/ws/events`, hydrate via `GET /api/events`)
- `scripts/domi-server.js` (≤ 1 KB shim, embedded into Rust via `build.rs` as `SHIM_BYTES`)

## Problem

Phase 2's promise is a real-time feedback loop: human clicks → event travels back to the agent → agent writes a new version of the artifact → human re-reviews. Three of Phase 2's five sub-projects have shipped and the JS runtimes already speak the wire protocol in server-attached mode, but the **server side is missing**. There is no actual process that binds a port, accepts `POST /api/events`, appends to `events.jsonl`, or fans out via WebSocket. The JS runtimes have nothing to talk to.

`crates/domi-server/` is currently a **library** with two sync modules:

- `events/` (2c-α): `EventWriter` + `Event` + `WriteError` + `FileShape` + `Rotation`. Sync, lock-based, crash-safe.
- `serve/` (2c-β): `Watcher` + `serve_file` + `ContentType` + `protocol_banner` + embedded `SHIM_BYTES`. Sync, no HTTP, no WS.

What remains is the **thin async layer** that turns these primitives into a working `domi-server` binary: axum HTTP routing, tokio runtime, WebSocket upgrade, broadcast fanout, CLI, signal handling.

The single biggest risk per `HANDOFF.md` is "no live integration test against an actual `domi-server` binary — the runtimes and the binary will only meet when someone actually wires them up on a real machine." This spec addresses that risk directly: 2c-γ ships both in-process handler tests AND a binary-boot smoke test.

## Goals

- Ship a runnable `domi-server` binary that listens on `127.0.0.1:4173` by default.
- Wire `EventWriter` (sync) into the async request flow via `tokio::task::spawn_blocking` so file-locking semantics from 2c-α are preserved verbatim.
- Implement all five routes from 2a's wire-protocol spec plus a `/healthz` route for tooling:
  - `GET /` — protocol banner (3-tuple from `serve::banner::protocol_banner`).
  - `GET /<path>` — static file serving with HTML shim injection (delegates to `serve::file::serve_file`).
  - `POST /api/events` — accept a v2 event JSON, stamp `id`/`ts` if missing, validate `v == 2`, append, broadcast, return 204.
  - `GET /api/events?since=<ULID>&doc=<name>&limit=<n>` — replay events strictly after `<ULID>`, optional `doc` filter, `limit` 1–1000 (default 100), returns `{events, nextSince}`.
  - `GET /ws/events` — WebSocket upgrade. Sends `{type:"hello",v:2,serverId}` on connect, then forwards each new event as `{type:"event",event:<Event>}`.
  - `GET /healthz` — `{status:"ok",serverId}` for `install.sh`/`verify.sh` (additive; not in 2a).
- Bind localhost-only by default (privacy invariant from 2a).
- TDD against real temp files (`tempfile` crate); handler tests via `tower::ServiceExt::oneshot`; one binary-boot smoke test gated with `#[ignore]` and runnable via `cargo test -- --ignored`.
- Graceful shutdown on SIGINT/SIGTERM via `tokio::signal`.
- CLI surface: `domi-server --port 4173 --host 127.0.0.1 --root .domi/output --state .domi/state --log-level info` (clap derive).
- Library invariant held: `tokens/`, `components/`, `scripts/domi.js`, `scripts/domi-audit.js`, original `templates/*/`, `examples/` are untouched.

## Non-goals

- The agent-side CLI / install / verify scripts (2d). 2c-γ ships only the binary + tests; 2d wires it into user-facing install/verify flows.
- Cache invalidation tied to the watcher. The watcher exists and is wired into a background log loop to demonstrate end-to-end correctness of the 2c-β API; no cache layer is added.
- Per-doc subscription over WebSocket. The 2a spec lists this as optional; 2c-γ ships broadcast-all (clients filter client-side).
- Schema validation in Rust via the `jsonschema` crate. Serde enforces shape; cross-language drift is caught by `tests/wire-protocol.test.js` against the JSON Schema file.
- `Cargo.lock` commit. Unchanged from current policy (gitignored). Phase 2d's release/distribution story may revisit.
- TLS, auth, multi-tenant anything, compression. Localhost-only dev tool.
- New event kinds, new fields, schema version bump.

## Design

### A. Crate layout — single crate, `[[bin]]` added

The existing `crates/domi-server/` crate gains a `[[bin]]` block and a new `http/` module. The binary lives at `crates/domi-server/src/main.rs` (a thin `#[tokio::main]` wrapper that delegates to `domi_server::http::run(...)`). All async code lives in `http/` so the library remains sync-testable.

```
crates/domi-server/
  Cargo.toml            # +[[bin]] name="domi-server", +axum/tokio/tower/tower-http/clap/futures
  src/
    lib.rs              # +pub mod http;
    main.rs             # NEW: #[tokio::main] async fn main() -> … { domi_server::http::run(Args::parse()).await }
    events/             # 2c-α (unchanged)
    serve/              # 2c-β (unchanged)
    http/               # NEW: 2c-γ
      mod.rs            # pub fn run(args: Args) -> Result<...> — top-level orchestration
      args.rs           # clap derive for CLI
      state.rs          # AppState — composition root
      router.rs         # build_router(state) -> axum::Router
      handlers.rs       # banner, static_serve, post_event, get_events, healthz
      ws.rs             # ws_upgrade handler + broadcast loop
  build.rs              # 2c-β, unchanged (still embeds scripts/domi-server.js)
```

The library API is unchanged from the perspective of 2c-α/2c-β consumers. The binary's public surface is the `domi_server::http::run` function (callable from `main.rs` and from integration tests).

### B. Dependencies to add

```toml
# Runtime
axum = "0.7"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal", "sync", "time", "net"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["trace"] }
clap = { version = "4", features = ["derive"] }
futures = "0.3"

# Dev
tokio = { version = "1", features = ["macros", "rt-multi-thread", "test-util"] }  # for #[tokio::test]
```

All permissively licensed (MIT/Apache-2.0). Pinning: minor only. No `unsafe`. No nightly. Crate MSRV stays at 1.75; current toolchain is 1.96.

### C. The `AppState` — composition root

```rust
//! crates/domi-server/src/http/state.rs

use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::broadcast;
use ulid::Ulid;

use crate::events::{Event, EventWriter};

pub struct AppState {
    pub root: PathBuf,
    pub state_dir: PathBuf,
    pub writer: Arc<EventWriter>,
    pub broadcaster: broadcast::Sender<Event>,
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
```

- `writer` is `Arc<EventWriter>` so the sync writer's lock-file semantics stay intact. POST handler moves a clone into `spawn_blocking`.
- `broadcaster` is a `tokio::sync::broadcast::Sender<Event>` with capacity 256. Slowest subscriber drops events; the file is the recovery source (`GET /api/events?since=`).
- `server_id` is generated at startup; sent in the `hello` WS frame and `/healthz`.
- `state_dir` is held for future round (e.g., rotation triggers); not used in 2c-γ's hot path.

### D. Routes — locked by 2a, plus `/healthz`

```rust
//! crates/domi-server/src/http/router.rs

pub fn build_router(state: Arc<AppState>) -> axum::Router {
    use axum::{routing::{get, post}, Router};

    Router::new()
        .route("/", get(handlers::banner))
        .route("/healthz", get(handlers::healthz))
        .route("/api/events", post(handlers::post_event).get(handlers::get_events))
        .route("/ws/events", get(ws::ws_upgrade))
        .fallback(get(handlers::static_serve))   // GET /<path>
        .with_state(state)
}
```

| Method | Path | Handler | Notes |
|---|---|---|---|
| `GET` | `/` | `handlers::banner` | 200 + JSON `{name,version,protocol}` from `serve::banner::protocol_banner` |
| `GET` | `/healthz` | `handlers::healthz` | 200 + JSON `{status:"ok",serverId}` |
| `GET` | `/<path>` | `handlers::static_serve` | Calls `serve::file::serve_file`; maps `ServeError` → 404 (NotFound/NotAFile/EscapedRoot) or 500 (Io) |
| `POST` | `/api/events` | `handlers::post_event` | 204 on success; 400 on validation failure; 500 on writer failure |
| `GET` | `/api/events` | `handlers::get_events` | Reads file strictly after `since`, optional `doc` filter, `limit` clamped to 1000, default 100; returns `{events, nextSince}` |
| `GET` | `/ws/events` | `ws::ws_upgrade` | axum's `WebSocketUpgrade` extractor |

### E. Handler details

**`banner`** — trivial: `axum::Json(serde_json::json!({...}))`. Returns the three-tuple from `serve::banner::protocol_banner` as a JSON object.

**`healthz`** — trivial: `axum::Json(serde_json::json!({"status":"ok","serverId": state.server_id.to_string()}))`. Useful for `install.sh`/`verify.sh` to poll before sending requests. Add to 2c-γ as additive; document the deviation from 2a's route table in `RELEASE-NOTES-v0.1.0.md`.

**`static_serve`** — receives `State(state)` and an axum `Path`. Constructs a relative path from the URL path; calls `serve_file(&state.root, &requested)`. Maps `ServeError`:
- `NotFound | NotAFile | EscapedRoot` → `(StatusCode::NOT_FOUND, "not found")`.
- `Io(e)` → `(StatusCode::INTERNAL_SERVER_ERROR, format!("io: {e}"))`.

On success: builds the response with the right `Content-Type` derived from `ContentType` via a `match`. The body is `Bytes` from `ServedFile.body`.

**`post_event`** — receives `State(state)` and `Json<IncomingEvent>`. The `IncomingEvent` is a separate struct that allows `id: Option<Ulid>` and missing `ts` (we stamp if missing); `v: u8`; `src`, `doc`, `kind`, `target`, `data` are required. Validation:
- `v != 2` → 400 `"unsupported protocol version: {v}"`.
- `doc.is_empty()` → 400 `"doc must be non-empty"` (matches 2c-α's `EventWriter` invariant).
- On valid: stamp `id = Ulid::new()` if `None`; stamp `ts = chrono::Utc::now()` if missing; convert `IncomingEvent` → `Event` via `From`.
- Then `let writer = Arc::clone(&state.writer); let ev_clone = ev.clone(); tokio::task::spawn_blocking(move || writer.write(&ev_clone)).await??` — preserves 2c-α's lock-file semantics.
- After successful write: `let _ = state.broadcaster.send(ev.clone());` (drop on no-subscribers is fine; 2c-α file is the recovery source).
- Return `(StatusCode::NO_CONTENT, ())`.

Note: validation is Rust-typed, not `jsonschema`. We accept the tradeoff (see §H).

**`get_events`** — receives `State(state)` and `Query<GetEventsParams>`. The params struct:
```rust
#[derive(Deserialize)]
struct GetEventsParams {
    since: Option<String>,
    doc: Option<String>,
    limit: Option<usize>,
}
```
Logic:
- `limit = params.limit.unwrap_or(100).min(1000).max(1);` — clamp.
- Read the JSONL file (`state_dir.join("events.jsonl")`) line by line. For each line, parse to `Event`; reject malformed lines silently (drop them — they're either Phase 1 leftovers that didn't get rotated, or corrupted writes; either way, we don't fail the request).
- Filter: if `params.since` is set, drop events with `id <= since` (lexical ULID compare). If `params.doc` is set, drop events with `doc != params.doc`.
- Take first `limit` matches.
- Response: `Json(json!({"events": [...], "nextSince": last_id_or_null}))`.

This is sync I/O but bounded by `limit` (≤ 1000 lines). We don't `spawn_blocking` for GET — file is small in practice and the request handler is fast enough for localhost. If profiling shows it matters, we'll move it later. Documented risk.

**`ws_upgrade`** — receives `State(state)` and `WebSocketUpgrade`. Calls `upgrade.on_upgrade(move |socket| ws::handle(socket, state))`.

### F. WebSocket — `ws.rs`

```rust
//! crates/domi-server/src/http/ws.rs

use axum::extract::ws::{Message, WebSocket};
use futures::{SinkExt, StreamExt};
use serde_json::json;

use crate::events::Event;

pub async fn ws_upgrade(
    axum::extract::State(state): axum::extract::State<std::sync::Arc<super::state::AppState>>,
    ws: axum::extract::WebSocketUpgrade,
) -> impl axum::response::IntoResponse {
    ws.on_upgrade(move |socket| handle(socket, state))
}

async fn handle(mut socket: WebSocket, state: std::sync::Arc<super::state::AppState>) {
    // 1. Send hello.
    let hello = json!({"type":"hello","v":2,"serverId":state.server_id.to_string()});
    if socket.send(Message::Text(hello.to_string())).await.is_err() { return; }

    // 2. Subscribe to broadcaster.
    let mut rx = state.broadcaster.subscribe();

    // 3. Loop: forward broadcasts as JSON frames. Also drain inbound (ignore content per 2a).
    loop {
        tokio::select! {
            // Outbound: forward broadcast events.
            ev = rx.recv() => {
                match ev {
                    Ok(event) => {
                        let frame = json!({"type":"event","event":event});
                        if socket.send(Message::Text(frame.to_string())).await.is_err() { break; }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,  // drop-oldest, keep going
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
            // Inbound: drain (we don't process client messages in 2c-γ).
            msg = socket.next() => {
                match msg {
                    Some(Ok(_)) => continue,  // accept and ignore
                    Some(Err(_)) | None => break,
                }
            }
        }
    }
}
```

- Capacity 256 on the broadcast channel is a per-handler budget. If a client lags by 256 events, it loses some — recovery via `GET /api/events?since=<last-id>` is documented in 2a.
- Inbound messages from clients are accepted and discarded. 2c-γ does not process subscribe/ping frames; deferred to a future round. Per 2a: "Clients MUST ignore unknown message types" — we apply the same rule on the server.
- 30-second server-side ping is **deferred**. The shim's reconnect-on-close handles most cases. Documented.

### G. CLI surface — `args.rs`

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

Defaults match 2a's "Bind 127.0.0.1 only" and "Port 4173 (Vite-style)" decisions.

### H. Validation strategy — trust serde

The Rust `Event` struct enforces shape at deserialization. Adding the `jsonschema` crate would re-implement validation in a second language, risk drift, and add ~500 KB to compile time.

Tradeoffs accepted:
- A body missing `v` returns 400 with serde's error message (opaque but functional).
- A body with extra fields is rejected by serde (`#[serde(deny_unknown_fields)]` could be added if needed — YAGNI for now).
- Cross-language drift is caught by `tests/wire-protocol.test.js` running example events against `docs/schemas/event.schema.json`.

This is a deliberate scope choice. Documented in the spec and in `RELEASE-NOTES-v0.1.0.md`.

### I. Watcher integration — logs only

The 2c-β `NotifyWatcher` exists. 2c-γ:

1. Constructs `NotifyWatcher::new(&root, 50)` at startup.
2. Spawns a `tokio::task` that polls `next_event(500)` in a loop.
3. On each event: `tracing::debug!(?ev.paths, kind = ?ev.kind, "watcher")`.

The watcher exists in the binary state to demonstrate end-to-end correctness of the 2c-β API. No cache invalidation, no server-push triggers. Documented as "wired but logs only; full cache layer is a future round."

The watcher task is spawned from `http::run` before the listener binds, so it sees events from the moment the server is up.

### J. Top-level orchestration — `http::run`

```rust
//! crates/domi-server/src/http/mod.rs (sketch)

pub async fn run(args: crate::http::args::Args) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 1. tracing init.
    init_tracing(&args.log_level);

    // 2. Ensure state dir exists; resolve events.jsonl path.
    let events_path = args.state.join("events.jsonl");
    std::fs::create_dir_all(&args.state)?;

    // 3. Construct EventWriter (sync).
    let writer = std::sync::Arc::new(crate::events::EventWriter::new(&events_path));

    // 4. Construct AppState.
    let state = std::sync::Arc::new(state::AppState::new(args.root.clone(), args.state.clone(), writer, 256));

    // 5. Spawn watcher logger.
    spawn_watcher_logger(&args.root);

    // 6. Build router.
    let router = router::build_router(state.clone());

    // 7. Bind.
    let addr = format!("{}:{}", args.host, args.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(%addr, "domi-server listening");

    // 8. Serve with graceful shutdown.
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async { let _ = tokio::signal::ctrl_c().await; };
    #[cfg(unix)]
    let sigterm = async {
        let mut s = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).expect("SIGTERM handler");
        s.recv().await;
    };
    #[cfg(not(unix))]
    let sigterm = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = sigterm => {} }
    tracing::info!("shutdown signal received");
}
```

### K. Tests

**Handler tests** (in-process via `tower::ServiceExt::oneshot`, in `crates/domi-server/src/http/handlers.rs` and `ws.rs`):

| Test | Verifies |
|---|---|
| `banner_returns_expected_json_shape` | `GET /` returns 200 + `{name,version,protocol}` |
| `healthz_returns_ok` | `GET /healthz` returns 200 + `{status:"ok",serverId}` |
| `serve_html_200_with_shim_injected` | `GET /dashboard.html` (referencing `domi.js`) returns 200 + body contains `__DOMI_SERVER__` |
| `serve_css_200_unchanged` | `GET /style.css` returns 200 + body unchanged |
| `serve_404_on_missing` | `GET /nope.html` returns 404 |
| `serve_404_on_escape` | `GET /../outside.html` returns 404 (path safety) |
| `post_event_204_and_appends_to_file` | `POST /api/events` returns 204 and the file gains a new line |
| `post_event_stamps_id_when_null` | Client posts `id: null`; appended line has a fresh ULID |
| `post_event_stamps_id_when_missing` | Client omits `id`; appended line has a fresh ULID |
| `post_event_400_on_v_not_2` | `POST {v:1,...}` returns 400 |
| `post_event_400_on_empty_doc` | `POST {doc:"",...}` returns 400 |
| `post_event_400_on_bad_kind` | `POST {kind:"unknown",...}` returns 400 (serde rejects enum) |
| `get_events_returns_filtered_after_since` | Insert 3 events; `?since=<id-of-1>` returns events 2 and 3 |
| `get_events_filters_by_doc` | Insert events across two docs; `?doc=A` returns only A's |
| `get_events_default_limit_100` | Insert 150 events; default limit returns 100 |
| `get_events_limit_clamped_to_1000` | `?limit=9999` returns at most 1000 |
| `get_events_returns_nextSince_last_id` | Last response includes `nextSince` = ULID of last event |
| `ws_upgrade_receives_hello_then_event` | Connect via `tokio_tungstenite` (dev-dep), receive `hello`; `POST /api/events` triggers a `type:"event"` frame with the event payload |

**Binary smoke test** (gated with `#[ignore]`):

| Test | Verifies |
|---|---|
| `binary_smoke_boot_post_get_ws` | Spawns the actual `domi-server` binary via `tokio::process::Command` in a temp dir, waits for `:4173` to bind (or `--port 0` + log scrape), POSTs an event, GETs it back, opens WS, asserts hello + event frame. Tear down via `child.kill()`. Run with `cargo test -p domi-server -- --ignored`. |

The binary smoke test addresses the `HANDOFF.md` risk directly: "no live integration test against an actual `domi-server` binary." It runs in CI as a gated test (not default, to avoid port conflicts and slow CI on shared runners), and locally on demand.

**Regression**:
- All 22 existing 2c-α/2c-β tests still pass.
- All 83 existing JS tests still pass.
- `cargo test --workspace` green; `npm test` green.

### L. Cargo.lock policy

Unchanged: `Cargo.lock` is **gitignored**. Phase 2c-α and 2c-β are library-only; their lock files are local-only. Phase 2c-γ's binary builds with whatever lock Cargo produces locally; reproducibility is handled by pinned minor versions + locked-down CI container (out of scope here). Phase 2d's release/distribution story (`cargo install`, GitHub release binaries) may revisit this. Documented; no behavior change in 2c-γ.

### M. File-by-file changes

| Path | Action | Lines (approx) |
|---|---|---|
| `crates/domi-server/Cargo.toml` | Modify: +`[[bin]]`, +axum/tokio/tower/tower-http/clap/futures, +dev-dep tokio test-util | +20 |
| `crates/domi-server/src/lib.rs` | Modify: add `pub mod http;` | +1 |
| `crates/domi-server/src/main.rs` | Create: 5-line `#[tokio::main]` wrapper | 8 |
| `crates/domi-server/src/http/mod.rs` | Create: `run(args)` orchestration, shutdown signal, watcher spawn | 80 |
| `crates/domi-server/src/http/args.rs` | Create: clap derive | 25 |
| `crates/domi-server/src/http/state.rs` | Create: `AppState` | 40 |
| `crates/domi-server/src/http/router.rs` | Create: `build_router` | 30 |
| `crates/domi-server/src/http/handlers.rs` | Create: 5 handlers + 16 handler tests | 280 |
| `crates/domi-server/src/http/ws.rs` | Create: ws upgrade + handle loop + 1 ws test | 90 |
| `crates/domi-server/src/bin/` | (alternative layout; not used — `src/main.rs` is canonical) | — |
| `docs/RUST.md` | Modify: layout shows new `http/` module; phasing table updated | +5 |
| `docs/PHASE2-SCOPE.md` | Modify: 2c-γ marked done | +5 |
| `docs/WIRE-PROTOCOL.md` | No change (2a spec is authoritative; `/healthz` is additive and not in the route table) | 0 |
| `RELEASE-NOTES-v0.1.0.md` | Modify: append 2c-γ section | +25 |
| `docs/superpowers/plans/2026-07-05-phase2c-binary-plan.md` | Create (writing-plans skill output) | ~600 |

Library files (`tokens/`, `components/`, `scripts/domi.js`, `scripts/domi-audit.js`, original `templates/*/`, `examples/`) — **untouched**.

## Acceptance

2c-γ is done when:

- `cargo build --workspace` is clean (axum 0.7 + tokio 1 compile on stable Rust 1.96).
- `cargo test -p domi-server` shows 22 prior + 17 new handler tests + 1 ws test + 1 ignored binary smoke test = 40 passing + 1 ignored.
- `cargo test -p domi-server -- --ignored binary_smoke_boot_post_get_ws` passes locally.
- `cargo test --workspace` passes (no regressions).
- `npm test` passes (no regressions; 83/83).
- `cargo run -p domi-server -- --port 4173` actually serves: `curl http://127.0.0.1:4173/` returns the banner; `curl -X POST -H 'content-type: application/json' -d '{"v":2,"id":null,"ts":"2026-07-05T18:21:00Z","src":"domi.js","doc":"smoke","kind":"click","target":{"id":"btn","selector":null,"rect":{"x":0,"y":0,"w":1,"h":1}},"data":{"value":"hi"}}' http://127.0.0.1:4173/api/events` returns 204; `curl http://127.0.0.1:4173/api/events?doc=smoke` returns the event with a stamped ULID.
- WebSocket smoke: a minimal `wscat`/`websocat` connection to `ws://127.0.0.1:4173/ws/events` receives `{"type":"hello","v":2,"serverId":"..."}` then receives a `{"type":"event","event":...}` after a `POST /api/events`.
- Library invariant held (see `M`).
- `docs/RUST.md`, `docs/PHASE2-SCOPE.md`, and `RELEASE-NOTES-v0.1.0.md` reflect the change.

## Risks and open questions

- **axum 0.7 + tower-http 0.6 + tokio 1 version drift.** All on stable; cargo resolves them. If cargo complains, we pin exact patch versions in `Cargo.toml` (still allowed; `Cargo.lock` is local-only).
- **Broadcast channel lag.** Capacity 256 is small for a busy day. Documented; clients can recover via `GET /api/events?since=<last-id>`. Increase capacity in a future round if profiling shows lag.
- **GET `/api/events` is sync I/O on the request task.** Bounded by `limit` (≤ 1000 lines); for a localhost dev tool with a 50 MB cap, this is fast enough. If profiling shows it matters, move to `spawn_blocking` later. Documented risk.
- **GET event parsing drops malformed lines silently.** Phase 1 leftovers that didn't get rotated will be dropped from the response but kept on disk. The 2c-α `EventWriter` rotates on first-write when `FileShape::Legacy` or `MalformedJson` is detected — but 2c-γ's GET handler does not retroactively rotate. Acceptable; document if it surfaces.
- **No server-side WS ping.** Shims reconnect on close; ok for a dev tool. Add ping in a future round if needed.
- **Binary smoke test flakiness.** Spawning a real binary on a real port may collide on shared CI runners. Gate with `#[ignore]` and run on-demand locally. If CI runners need it, allocate a high port or use `--port 0` + log scrape.
- **Watcher on Windows.** `notify` 6.x supports Windows via `ReadDirectoryChangesW`. No platform-specific code in 2c-γ. Documented risk.
- **Path-safety of `GET /<path>`.** The `serve_file` primitive already canonicalizes and rejects `EscapedRoot`. The handler passes the URL path verbatim to `serve_file`. Path traversal via URL-encoded `..` etc. is partially mitigated by `axum::extract::Path` (which percent-decodes) + `serve_file`'s canonicalize-then-check. No new attack surface beyond what 2c-β already addresses.
- **No graceful drain on WS clients.** Shutdown just drops the listener. Clients reconnect via shim. Acceptable for a dev tool.

## Out of scope for this round

- 2d (agent CLI, install/verify.sh that exercise the binary).
- Subscription filter on WS.
- Server-side ping frame.
- Cache layer.
- Cargo.lock commit.
- Per-doc JSONL files.
