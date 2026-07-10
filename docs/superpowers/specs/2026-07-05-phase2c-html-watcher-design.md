# Phase 2c-β — HTML Serving & Folder Watcher

**Date:** 2026-07-05
**Status:** Draft (post self-review)
**Phase:** 2c-β of 4 (Phase 2 decomposition: 2a wire protocol, 2b server-attached JS, 2c-α events writer (shipped), **2c-β HTML serving + watcher (this)**, 2c-γ binary + axum + WebSocket, 2d agent tooling)
**Upstream:** `docs/superpowers/specs/2026-07-05-phase2-wire-protocol-design.md` §D (server contract) and §E (shim contract)
**Sibling sub-projects:** 2c-γ (binary), 2b (server-attached JS mode in `domi.js`/`domi-audit.js`)

## Problem

Phase 2a pinned the wire protocol and the HTTP routes the server must expose:

- `GET /` — protocol banner.
- `GET /<path>` — serve files from the watched output directory; inlines the server shim when HTML referencing `domi.js` is served.
- `POST /api/events`, `GET /api/events?since=…`, `GET /ws/events` — event ingest/replay/broadcast.

2c-α shipped the events writer (`crates/domi-server/src/events/`). What remains **before** the binary can do anything useful is the storage-and-serving primitives that the binary's HTTP layer will wrap:

1. A **folder watcher** that observes changes to `.domi/output/` and produces a stream of change events the HTTP server can react to (cache invalidation, log lines, future server-push triggers).
2. An **HTML serving** primitive that, given a request path under a watched root, returns the file's bytes plus the right `Content-Type`. If the file is HTML and references `domi.js`, the server-side shim must be injected so the browser runtime enters "server-attached" mode before `domi.js` runs.
3. A **protocol-banner** builder for `GET /`.
4. The **`domi-server.js` shim** itself — a tiny JS runtime that sets `__DOMI_SERVER__=true` and surfaces WS subscription. ≤ 1 KB per the 2a spec.

These are sync (no HTTP, no WS, no async runtime). They are the foundation that 2c-γ will compose onto `axum` + `tokio` + WebSocket plumbing. Doing them as a sync library extension now means 2c-γ becomes a much smaller chunk: HTTP routing + WS upgrade + tokio glue. Both share the 2a wire contract.

## Goals

- A new `crates/domi-server/src/serve/` module exposing watcher, file-serve, and banner primitives.
- A new `scripts/runtime/domi-server.js` shim file (≤ 1 KB) that 2b's JS side will load before `domi.js` runs.
- The `serve_file` primitive injects the shim inline-blocking — no extra `<script src>` round-trip — so the shim's `window.__DOMI_SERVER__=true` is set before any other script executes.
- TDD against real temp files; an in-memory `Watcher` impl lets tests avoid filesystem signals.
- Behavior locked at the public API; 2c-γ reaches for `domi_server::serve::watch` and `domi_server::serve::file` to wire its routes.

## Non-goals

- HTTP server, request routing, WebSocket upgrade (2c-γ).
- Switching `domi.js` and `domi-audit.js` to server-attached mode (2b).
- Agent reader CLI (2d).
- Async / `tokio` integration. 2c-β stays sync.
- Cache layer for served files. The HTTP layer can add one if needed; the file-serve primitive reads from disk on every call, which is fine for a localhost dev tool.
- Auth, TLS, multi-tenant anything.

## Design

### A. Public API — `serve` module

```rust
//! Sync primitives the binary's HTTP layer wraps.

pub mod watcher;
pub mod file;
pub mod banner;

use std::path::{Path, PathBuf};

/// One event from the folder watcher.
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

/// Abstract over filesystem-notify implementations, so tests use an in-memory source.
pub trait Watcher: Send {
    /// Block (with optional timeout) until the next event, or return `None` on idle timeout.
    /// Implementations must coalesce high-frequency events when `coalesce_ms > 0`.
    fn next_event(&mut self, timeout_ms: u32) -> std::io::Result<Option<WatchEvent>>;
}

/// Implementation backed by the `notify` crate. Long-lived; spawns an OS thread.
pub struct NotifyWatcher { /* … */ }

impl NotifyWatcher {
    /// `coalesce_ms` debounces bursty filesystem signals (default 50 ms).
    pub fn new(root: &Path, coalesce_ms: u32) -> std::io::Result<Self>;
    pub fn root(&self) -> &Path;
}

/// In-memory `Watcher` for tests. A small `Vec<WatchEvent>` the test pushes to.
pub struct MockWatcher { /* … */ }
impl MockWatcher {
    pub fn new() -> Self;
    pub fn push(&mut self, ev: WatchEvent);
}
impl Watcher for MockWatcher { /* next_event pops the queue */ }
```

Both `NotifyWatcher` and `MockWatcher` implement `Watcher`. The 2c-γ binary uses `NotifyWatcher`; tests use `MockWatcher`. Same trait, same consumer.

### B. File serving — `file::serve_file`

```rust
use std::path::Path;

#[derive(Debug)]
pub struct ServedFile {
    pub body: Vec<u8>,
    pub content_type: ContentType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentType {
    Html,
    Css,
    Js,
    Json,
    Png,
    Jpeg,
    Svg,
    PlainText,
    OctetStream,
}

#[derive(Debug)]
#[non_exhaustive]
pub enum ServeError {
    NotFound,
    NotAFile,         // path exists but is a directory
    Io(std::io::Error),
    EscapedRoot,      // canonicalized path is outside root
}

pub fn serve_file(root: &Path, requested: &Path) -> Result<ServedFile, ServeError>;
```

**Resolution rules:**

- `root` is the watched output directory (e.g., `.domi/output/`).
- `requested` is the URL path, **already canonicalized and validated to be inside `root`**. The HTTP layer is responsible for `..` stripping and symlink-loop detection before calling `serve_file`. `serve_file` itself asserts the invariant via canonicalize and rejects `EscapedRoot`. Belt and suspenders; spec'd for safety because the binary's URL handler is a different process boundary and trust flows in through both sides.
- Content-Type by extension: `.html`, `.htm` → `Html`; `.css` → `Css`; `.js` / `.mjs` → `Js`; `.json` → `Json`; `.png` → `Png`; `.jpg` / `.jpeg` → `Jpeg`; `.svg` → `Svg`; `.txt` / `.md` → `PlainText`; everything else → `OctetStream`.
- **HTML shim injection:** when `content_type == Html` AND the response body contains a literal `<script` tag referencing `domi.js` (detection rule: byte substring `src="...domi.js"` or `src='...domi.js'` where `...` is any sequence of path characters `/`, `.`, alphanumerics, `-`, `_`, `~` — i.e., resolves to a `domi.js` file path), `serve_file` prepends `DOMI_SERVER_SHIM_BYTES` (loaded from `domi_server::SHIM_BYTES` const) as an **inline blocking script before the first `<script` tag in the file**. This guarantees synchronous execution before any other script.
- Files that don't reference `domi.js` are returned unchanged.
- Non-HTML files are returned unchanged regardless.
- Default module-wide `<meta charset>` is not added — file content is preserved verbatim except for the shim insertion.
- `Vec<u8>` for body because the binary's HTTP layer may want to stream or buffer; binary adapts. The sync primitive returns owned bytes.

### C. The shim — `scripts/runtime/domi-server.js`

A new file, sized ≤ 1 KB raw, lives at `scripts/runtime/domi-server.js`. Two responsibilities per 2a spec §E:

1. Set `window.__DOMI_SERVER__ = true` synchronously, before any other script on the page runs. This is the mode flag `domi.js` and `domi-audit.js` check.
2. Open a WebSocket and surface a custom event subscription.

**Same-origin WS URL by default.** Per locked-in Q1=B: the shim does not receive an injected host. It derives the WS URL from `window.location`:

```js
const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/events';
```

This means the server doesn't have to know its own bind address when serving HTML. Tested by having `domi.js`/`domi-audit.js` wire up against `window.__DOMI_SERVER__ = true` in 2b. **No string-rewriting in `serve_file` for the WS URL.**

Full shim shape (the IIFE is inlined by `serve_file`, but the file on disk is the canonical source):

```js
(() => {
  if (window.__DOMI_SERVER__) return;
  window.__DOMI_SERVER__ = true;
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/events';
  let socket;
  function connect() {
    socket = new WebSocket(url);
    socket.addEventListener('open', () => dispatchEvent(new CustomEvent('domi-server-open')));
    socket.addEventListener('close', () => setTimeout(connect, 500));
    socket.addEventListener('error', () => setTimeout(connect, 500));
    socket.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg && msg.type === 'event' && msg.event) {
          dispatchEvent(new CustomEvent('domi-event', { detail: msg.event }));
        }
      } catch (_) {}
    });
  }
  window.DomiServer = {
    export() {
      return new Promise(() => {});
    },
    subscribe(cb) {
      addEventListener('domi-event', (ev) => cb(ev.detail));
    },
  };
  connect();
})();
```

The `export()` returns a never-resolving promise on purpose. The handler-state is held only in the browser; per the 2a spec, `export()` is a *drop-in replacement for `DOMi.exportFeedback`* but in server-attached mode the server is the source of truth, so there's nothing to export. The promise is a placeholder kept for shape compatibility with 2b.

`scripts/runtime/domi-server.js` ships with the JS half because it's runtime JS, not Rust bytes. **2c-β tests the byte-equality** (file is present, length ≤ 1 KB, contains `__DOMI_SERVER__=true`, contains the WS URL constructor). The Rust side embeds *its own copy of the same content* in a `&'static [u8]` constant at `domi_server::SHIM_BYTES` so `serve_file` can inject it without doing filesystem I/O on every request.

`SHIM_BYTES` is generated by a build script (`build.rs`) that reads `../../scripts/runtime/domi-server.js` and embeds its bytes at compile time. **The build script is the only piece keeping Rust and JS in sync.** Tests cover both the file on disk and the embedded constant.

### D. Banner — `banner::protocol_banner`

```rust
pub fn protocol_banner() -> [(&'static str, &'static str); 3] {
    [("name", "domi-server"), ("version", env!("CARGO_PKG_VERSION")), ("protocol", "2")]
}
```

The HTTP layer (`axum` in 2c-γ) returns this as a JSON object. Version is captured at compile time from `Cargo.toml`. No surprises.

### E. Data flow — request lifecycle

For the two sync routes that 2c-β covers:

```
HTTP request (GET /dashboard.html)
        │
        ▼
axum handler (2c-γ)
        │
        ├─ canonicalize requested path
        ├─ check it stays inside root (else 404)
        ▼
serve_file(root, requested)            ← 2c-β primitive
        │
        ├─ stat + read body
        ├─ detect content_type from extension
        ├─ if HTML + references domi.js → inject SHIM_BYTES inline
        ▼
ServedFile { body, content_type }
        │
        ▼
axum HTTP response
```

Watcher doesn't sit on the hot path of `serve_file`. The watcher exists for binary-side use cases (logging changes, future cache invalidation, future server-push triggers). For 2c-β the watcher is shipped as a tested, working primitive and the binary chooses how to use it.

### F. Error semantics

`ServeError::Io(_)` wraps any underlying filesystem error. `NotFound` returns when canonicalize fails with `NotFound`. `NotAFile` if the resolved path is a directory. `EscapedRoot` if canonicalization produces a path outside `root`. All are mapped to HTTP codes by the binary — `serve_file` does NOT know about HTTP status numbers.

`Watcher` errors propagate as `std::io::Error` because the watcher is closer to OS-level events. The `Watcher` trait returns `Result<Option<WatchEvent>>`; `Ok(None)` means idle-timeout reached, `Ok(Some(ev))` is a real event, `Err(_)` is a fatal watcher error (caller should drop the watcher and reconstruct or log).

## File-by-file changes

| Path | Action | Lines (approx) |
|---|---|---|
| `crates/domi-server/src/serve/mod.rs` | Create | 20 |
| `crates/domi-server/src/serve/watcher.rs` | Create | 200 (NotifyWatcher + MockWatcher + trait) |
| `crates/domi-server/src/serve/file.rs` | Create | 150 (serve_file + ContentType + ServeError + shim injection) |
| `crates/domi-server/src/serve/banner.rs` | Create | 30 |
| `crates/domi-server/src/serve/shim.rs` | Create | 20 (the SHIM_BYTES const, validated at compile time) |
| `crates/domi-server/src/lib.rs` | Add `pub mod serve;` | +1 |
| `crates/domi-server/build.rs` | Create | 30 (embeds `../../scripts/runtime/domi-server.js`) |
| `crates/domi-server/Cargo.toml` | Add `notify = "6"` dep + `serde_json` (already present) | +1 |
| `scripts/runtime/domi-server.js` | Create | ≤ 1 KB |
| `tests/domi-server-js.test.js` | Create (JS) | 80 (vitest) |
| `docs/WIRE-PROTOCOL.md` | Update: clarify "the server-side shim is `scripts/runtime/domi-server.js`" and the inline-blocking behavior | +5 |
| `docs/PHASE2-SCOPE.md` | Update: 2c-α → done; 2c-β entry updated; 2c now decomposed into α/β/γ | +10 |
| `docs/RUST.md` | Update: layout shows new `serve/` module | +5 |

Library files (`tokens/`, `components/`, `scripts/runtime/domi.js`, `scripts/runtime/domi-audit.js`, original `templates/*/`, `examples/`): **untouched**.

## Acceptance

2c-β is done when:

- `cargo build --workspace` is clean (notify 6.x compiles on stable Rust 1.96).
- `cargo test -p domi-server` shows 9 prior tests pass + new tests cover:
  - `serve_file_html_with_domi_js_injects_shim_inline_blocking`
  - `serve_file_html_without_domi_js_returns_unchanged`
  - `serve_file_css_returns_unchanged`
  - `serve_file_escapes_root_returns_EscapedRoot`
  - `serve_file_directory_returns_NotAFile`
  - `serve_file_missing_returns_NotFound`
  - `NotifyWatcher_emits_event_on_create` (uses real tmp dir + small sleep; gated with `#[ignore]` if too flaky for CI)
  - `MockWatcher_yields_pushed_events`
  - `banner_protocol_banner_returns_json_shape`
- `tests/domi-server-js.test.js` (vitest): 3 tests
  - `shim_sets___DOMI_SERVER___to_true`
  - `shim_constructs_ws_URL_from_location_host`
  - `shim_under_1_KB`
- `cargo test --workspace` and `npm test` both pass.
- DOM iNice wire protocol reference (`docs/WIRE-PROTOCOL.md`) updated to describe the shim exactly.
- A 2c-γ brainstorm round can write its design *using 2c-β's `serve` module* without re-specifying the watcher or content-type logic.

## Risks and open questions

- **`notify` cross-platform behavior.** macOS FSEvents, Linux inotify, Windows ReadDirectoryChangesW. Each has slightly different event coalescing. Spec accepts that; tests cover Linux/macOS only (the GitHub Actions runners). FSEvents on macOS sometimes emits two events for one real change; `coalesce_ms` parameter exists to dampen this.
- **`serve_file` with huge HTML.** The whole file is read into `Vec<u8>`. For localhost dev tool serving ≤ 1 MB HTML, this is fine. Documented risk; the binary in 2c-γ may add streaming later if real artifacts grow.
- **Inline shim blocking parse.** If the HTML has a malformed `<script>` tag near the start, my regex-by-hand-LIBC-string-find may misfire. Two layers of safety: (1) we only inject when the file is *known* to reference `domi.js`, so this is a low-probability path; (2) `serve_file` returns the original bytes unchanged on any parse failure (logged at debug).
- **`build.rs` reading a file outside the crate dir.** `../../scripts/runtime/domi-server.js` is the canonical path from `crates/domi-server/`. Build scripts can read external paths but they cross crate boundaries, which is a maintainability smell. Mitigation: `build.rs` errors out clearly if the JS file doesn't exist; **a one-line note in `docs/RUST.md`** tells the next person editing either side that both must move together.
- **Cross-language drift (revisited).** Same risk as 2c-α's Rust `Event` vs. JS tests. Tests on both sides catch it. The shim file is the new risk surface; `tests/domi-server-js.test.js` covers its three invariants.
- **HTML rewrites and content caches.** Phase 1 server-side caches would have to invalidate on file change. The watcher exists for that. Out of scope for 2c-β.
