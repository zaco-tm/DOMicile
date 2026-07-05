# Phase 2c-β: HTML serving + folder watcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sync `serve` module to `crates/domi-server` exposing a `Watcher` trait + `NotifyWatcher` (notify-backed) + `MockWatcher` (test-only), `serve_file` with HTML shim injection, and `protocol_banner`. Add `scripts/domi-server.js` shim file (≤ 1 KB). Wire the shim's content into Rust via a build script as `domi_server::SHIM_BYTES`.

**Architecture:** Sync library extension only — no async, no HTTP, no WebSocket. The binary in 2c-γ consumes these primitives. The shim is a JS file on disk AND a Rust `&'static [u8]` constant built at compile time, so `serve_file` can inject it without reading the filesystem on every request.

**Tech Stack:** Rust 1.96 stable, `notify` crate (v6.x) added to existing `Cargo.toml`. JS: vanilla, no deps. vitest for JS tests.

## Global Constraints

- Working directory: `/Users/zaco/Projects/Personal/DOMiNice Skill`.
- Wire protocol per `docs/WIRE-PROTOCOL.md` (v2). HTML shim injection rule per spec: inject as a blocking script before the first `<script>` tag in HTML responses whose `src` matches `src="...domi.js"` or `src='...domi.js'` (where `...` is path characters `/`, `.`, alphanumerics, `-`, `_`, `~`).
- The Rust `SHIM_BYTES` constant must match `scripts/domi-server.js` byte-for-byte. Build script enforces this by reading the file at compile time.
- Watcher is sync. `Watcher::next_event(&mut self, timeout_ms: u32) -> io::Result<Option<WatchEvent>>` — `Ok(None)` is a clean idle-timeout, `Err(_)` is a fatal watcher error.
- 2c-β stays sync. Async lands in 2c-γ.
- Files trailing newline invariant holds.
- `crates/domi-server/Cargo.toml` gains `notify = "6"` (runtime) only. No new dev-deps.
- `.gitignore`: `**/target/` is already present. `Cargo.lock` continues to be excluded for library-only.
- Library files (`tokens/`, `components/`, `scripts/domi.js`, `scripts/domi-audit.js`, original `templates/*/`, `examples/`) are **untouched**. The new `scripts/domi-server.js` is additive, not a change to an existing file.
- `docs/RUST.md` is updated to reflect the new `serve/` module.

---

### Task 1: `scripts/domi-server.js` shim (JS half, ≤ 1 KB)

**Files:**
- Create: `scripts/domi-server.js`
- Create: `tests/domi-server-js.test.js`

**Interfaces:**
- Produces: `scripts/domi-server.js` whose content matches the body of `(() => { ... })()` shown in spec §C, sets `window.__DOMI_SERVER__ = true` first, then opens WS, then sets `window.DomiServer.{subscribe, export}`.
- Produces: vitest file `tests/domi-server-js.test.js` covering three invariants.

- [ ] **Step 1: Write the shim**

Write `scripts/domi-server.js` exactly:

```javascript
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
    export() { return new Promise(() => {}); },
    subscribe(cb) { addEventListener('domi-event', (ev) => cb(ev.detail)); },
  };
  connect();
})();
```

That's 19 lines. ≤ 1024 bytes inclusive.

- [ ] **Step 2: Write the vitest file**

Write `tests/domi-server-js.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SHIM = readFileSync(resolve(here, '../scripts/domi-server.js'), 'utf8');

describe('domi-server.js shim', () => {
  it('sets window.__DOMI_SERVER__ to true', () => {
    expect(SHIM).toMatch(/window\.__DOMI_SERVER__\s*=\s*true/);
  });

  it('constructs the WS URL from location.host (same-origin)', () => {
    expect(SHIM).toContain("location.protocol === 'https:'");
    expect(SHIM).toContain("'wss://'");
    expect(SHIM).toContain("'ws://'");
    expect(SHIM).toMatch(/location\.host\s*\+\s*'\/ws\/events'/);
    expect(SHIM).not.toContain('127.0.0.1');
    expect(SHIM).not.toContain('localhost:');
  });

  it('is under 1 KB', () => {
    expect(SHIM.length).toBeLessThanOrEqual(1024);
  });
});
```

The "no `127.0.0.1`" / "no `localhost:`" assertions guard against accidentally inlining a default host into the shim. If the implementer hard-codes a host, those assertions will fail and the bug is caught.

- [ ] **Step 3: Run the tests, verify GREEN**

Run `npm test`.
Expected: 3 new tests pass, 58/58 total (or 61/61 after first run).

- [ ] **Step 4: Commit**

```bash
git add scripts/domi-server.js tests/domi-server-js.test.js
git commit -m "feat(shim): domi-server.js — sets __DOMI_SERVER__ and wires WebSocket subscription"
```

---

### Task 2: `serve/banner` (smallest unit, lowest review risk)

**Files:**
- Create: `crates/domi-server/src/serve/mod.rs`
- Create: `crates/domi-server/src/serve/banner.rs`
- Modify: `crates/domi-server/src/lib.rs`

**Interfaces:**
- Consumes: nothing.
- Produces: `pub fn protocol_banner() -> [(&'static str, &'static str); 3]` returning the three-tuple banner.

- [ ] **Step 1: Write the failing test (inline in banner.rs)**

In `crates/domi-server/src/serve/banner.rs` add at the bottom:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn banner_returns_three_pairs() {
        let b = protocol_banner();
        assert_eq!(b.len(), 3);
        let map: std::collections::HashMap<&str, &str> = b.iter().copied().collect();
        assert_eq!(map["name"], "domi-server");
        assert_eq!(map["protocol"], "2");
        assert!(!map["version"].is_empty());
    }

    #[test]
    fn banner_version_matches_cargo_package() {
        let b = protocol_banner();
        let map: std::collections::HashMap<&str, &str> = b.iter().copied().collect();
        assert_eq!(map["version"], env!("CARGO_PKG_VERSION"));
    }
}
```

- [ ] **Step 2: Run test, verify fail**

```bash
cargo test -p domi-server protocol_banner 2>&1 | tail -10
```
Expected: compile error (function not defined).

- [ ] **Step 3: Write the impl**

In `crates/domi-server/src/serve/banner.rs`:

```rust
//! GET / — protocol banner. Returns name + version + protocol as a fixed array
//! of key-value pairs; the binary's HTTP layer (2c-γ) maps this to JSON.

pub fn protocol_banner() -> [(&'static str, &'static str); 3] {
    [
        ("name", "domi-server"),
        ("version", env!("CARGO_PKG_VERSION")),
        ("protocol", "2"),
    ]
}
```

(Tests stay below; they'll now compile.)

- [ ] **Step 4: Create `serve/mod.rs`**

```rust
//! Sync primitives the binary's HTTP layer wraps.

pub mod banner;
pub mod file;
pub mod shim;
pub mod watcher;
```

The `file`, `shim`, and `watcher` modules aren't built until Tasks 3, 4, and 5. To keep this task compiling, replace `serve/mod.rs` with **just** the `banner` declaration in this task, and let the implementer add the others as each lands:

```rust
pub mod banner;
```

The Task that creates `file` later also extends `mod.rs`. (Each task notes where to extend `mod.rs`.)

- [ ] **Step 5: Update `lib.rs`**

In `crates/domi-server/src/lib.rs`, add `pub mod serve;`:

```rust
//! DOMiNice live-server library.
//! See `events` for the v2 protocol event writer.
//! See `serve` for HTTP primitives (banner, file serving, watcher).

pub mod events;
pub mod serve;
```

- [ ] **Step 6: Run tests, verify GREEN**

```bash
cargo test -p domi-server 2>&1 | tail -8
```
Expected: 9 prior tests + 2 new = 11 passing.

- [ ] **Step 7: Commit**

```bash
git add crates/domi-server/src/lib.rs crates/domi-server/src/serve/
git commit -m "feat(domi-server): serve::banner — protocol banner for GET /"
```

---

### Task 3: `serve/watcher` — MockWatcher first, NotifyWatcher stub

**Files:**
- Modify: `crates/domi-server/src/serve/mod.rs` (add `pub mod watcher;`)
- Create: `crates/domi-server/src/serve/watcher.rs`

**Interfaces:**
- Consumes: nothing.
- Produces: `pub trait Watcher: Send { fn next_event(&mut self, timeout_ms: u32) -> std::io::Result<Option<WatchEvent>>; }`, `pub struct WatchEvent { pub kind, pub paths }`, `pub enum WatchEventKind { Created, Modified, Removed, Any }`, `pub struct MockWatcher { evs: VecDeque<WatchEvent>, ... }`.

- [ ] **Step 1: Write failing tests for MockWatcher (no notify yet)**

Write `crates/domi-server/src/serve/watcher.rs`:

```rust
use std::collections::VecDeque;
use std::io;
use std::path::{Path, PathBuf};

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
```

- [ ] **Step 2: Update `serve/mod.rs`**

```rust
pub mod banner;
pub mod watcher;
```

- [ ] **Step 3: Run tests, verify RED→GREEN**

```bash
cargo test -p domi-server --lib events::writer 2>&1 | tail -3
cargo test -p domi-server watcher 2>&1 | tail -10
```
First command should still pass (regression check). Second: 3 new tests pass.

- [ ] **Step 4: Commit (MockWatcher only — no notify yet)**

```bash
git add crates/domi-server/src/serve/
git commit -m "feat(domi-server): serve::watcher — trait, WatchEvent, MockWatcher (test-only)"
```

---

### Task 4: `serve/shim` — Rust `SHIM_BYTES` const via `build.rs`

**Files:**
- Create: `crates/domi-server/src/serve/shim.rs`
- Create: `crates/domi-server/build.rs`
- Modify: `crates/domi-server/Cargo.toml` (add `build = "build.rs"`)

**Interfaces:**
- Consumes: `scripts/domi-server.js` on disk at compile time.
- Produces: `pub const SHIM_BYTES: &[u8]` and `pub const SHIM_LEN: usize` declared via `include_bytes!` or `env!`-driven generated file.

This task is structural — moves the shim bytes into the Rust binary at compile time so `serve_file` can inject them later without runtime I/O.

- [ ] **Step 1: Write `build.rs`**

Write `crates/domi-server/build.rs`:

```rust
use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().and_then(|p| p.parent()).expect("workspace root");
    let shim_path = repo_root.join("scripts").join("domi-server.js");
    println!("cargo:rerun-if-changed={}", shim_path.display());

    let bytes = std::fs::read(&shim_path).unwrap_or_else(|e| {
        panic!(
            "domi-server.js shim not found at {}: {e}. \
             The Rust crate embeds the JS shim at compile time; \
             the file must live at <repo>/scripts/domi-server.js.",
            shim_path.display()
        )
    });

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let declared_len = bytes.len();
    std::fs::write(
        out_dir.join("shim_length.rs"),
        format!("pub const SHIM_BYTES_LEN: usize = {declared_len};\n"),
    )
    .expect("write shim_length.rs");

    std::fs::write(
        out_dir.join("shim_token.rs"),
        format!("pub const SHIM_BYTES: &[u8] = include_bytes!(\"{}\");\n", shim_path.display()),
    )
    .expect("write shim_token.rs");
}
```

The `shim_token.rs` is a generated file with `include_bytes!("...absolute path...")`. Cargo invalidates its build when the JS file changes via `cargo:rerun-if-changed`.

- [ ] **Step 2: Write `shim.rs`**

Write `crates/domi-server/src/serve/shim.rs`:

```rust
//! Embedded server-side shim. Build script reads `scripts/domi-server.js`
//! at compile time and produces `SHIM_BYTES` (the raw bytes) and
//! `SHIM_BYTES_LEN` (length) so `serve_file` can inject without runtime I/O.

include!(concat!(env!("OUT_DIR"), "/shim_token.rs"));

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shim_contains_marker() {
        // Sanity: the embedded bytes actually contain the marker line.
        let s = std::str::from_utf8(SHIM_BYTES).expect("shim is utf-8");
        assert!(
            s.contains("window.__DOMI_SERVER__"),
            "embedded shim is missing the __DOMI_SERVER__ marker"
        );
    }

    #[test]
    fn shim_uses_same_origin_ws_url() {
        let s = std::str::from_utf8(SHIM_BYTES).unwrap();
        assert!(s.contains("location.host"), "shim must derive WS URL from location.host");
        assert!(s.contains("/ws/events"));
        assert!(!s.contains("127.0.0.1"), "shim must not hardcode a host");
    }

    #[test]
    fn shim_under_2kb_safety_margin() {
        assert!(SHIM_BYTES.len() <= 2048);
    }
}
```

- [ ] **Step 3: Update `Cargo.toml`**

Append at the bottom:

```toml
build = "build.rs"
```

(File starts with `[package]`; the `build` key is conventionally under `package`. Place it after the existing `description` line so the manifest reads top-down logically.)

- [ ] **Step 4: Update `serve/mod.rs`**

```rust
pub mod banner;
pub mod shim;
pub mod watcher;
```

- [ ] **Step 5: Run tests, verify GREEN**

```bash
cargo test -p domi-server shim 2>&1 | tail -8
cargo test -p domi-server 2>&1 | tail -3
```

Expected: 11 prior tests + 3 new = 14 passing.

- [ ] **Step 6: Commit**

```bash
git add crates/domi-server/Cargo.toml crates/domi-server/build.rs crates/domi-server/src/serve/
git commit -m "feat(domi-server): serve::shim — embed domi-server.js into SHIM_BYTES via build.rs"
```

---

### Task 5: `serve/file::serve_file` (with shim injection)

**Files:**
- Create: `crates/domi-server/src/serve/file.rs`
- Modify: `crates/domi-server/src/serve/mod.rs` (add `pub mod file;`)

**Interfaces:**
- Consumes: `SHIM_BYTES` from `serve::shim`.
- Produces: `pub fn serve_file(root: &Path, requested: &Path) -> Result<ServedFile, ServeError>`, `pub struct ServedFile { body, content_type }`, `pub enum ContentType`, `pub enum ServeError`.

- [ ] **Step 1: Write failing tests**

`crates/domi-server/src/serve/file.rs`:

```rust
use std::io;
use std::path::{Path, PathBuf};

use super::shim::SHIM_BYTES;

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
    NotAFile,
    Io(io::Error),
    EscapedRoot,
}

fn content_type_for_path(p: &Path) -> ContentType {
    let ext = p.extension().and_then(|s| s.to_str()).map(str::to_ascii_lowercase);
    match ext.as_deref() {
        Some("html") | Some("htm") => ContentType::Html,
        Some("css") => ContentType::Css,
        Some("js") | Some("mjs") => ContentType::Js,
        Some("json") => ContentType::Json,
        Some("png") => ContentType::Png,
        Some("jpg") | Some("jpeg") => ContentType::Jpeg,
        Some("svg") => ContentType::Svg,
        Some("txt") | Some("md") => ContentType::PlainText,
        _ => ContentType::OctetStream,
    }
}

/// True when the body references a `domi.js` script via `src="..."` or `src='...'`.
fn references_domi_js(body: &[u8]) -> bool {
    let hay = String::from_utf8_lossy(body);
    hay.contains("src=\"domi.js\"")
        || hay.contains("src='domi.js'")
        || hay.contains("src=\"./domi.js\"")
        || hay.contains("src='./domi.js'")
        || hay.contains("src=\"../scripts/domi.js\"")
        || hay.contains("src='../scripts/domi.js'")
}

/// Insert shim bytes as an inline-blocking `<script>` before the first
/// `<script>` tag. If no `<script>` tag exists, the body is returned
/// unchanged (we don't mint a new tag — the page would have to opt in).
fn inject_shim_inline(body: Vec<u8>) -> Vec<u8> {
    let tag = b"<script>";
    if !body.windows(tag.len()).any(|w| w == tag) {
        return body;
    }
    let mut out =
        Vec::with_capacity(body.len() + SHIM_BYTES.len() + tag.len() + b"</script>".len());
    let mut injected = false;
    let mut i = 0usize;
    while i < body.len() {
        if !injected && body[i..].starts_with(&tag[..]) {
            out.extend_from_slice(b"<script>");
            out.extend_from_slice(SHIM_BYTES);
            out.extend_from_slice(b"</script>");
            i += tag.len();
            // Skip leading whitespace/newline after `<script>`.
            while i < body.len() && (body[i] == b'\n' || body[i] == b' ' || body[i] == b'\t' || body[i] == b'\r') {
                out.push(body[i]);
                i += 1;
            }
            injected = true;
        } else {
            out.push(body[i]);
            i += 1;
        }
    }
    out
}

pub fn serve_file(root: &Path, requested: &Path) -> Result<ServedFile, ServeError> {
    let canonical_root = std::fs::canonicalize(root).map_err(ServeError::Io)?;
    let target = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        canonical_root.join(requested)
    };
    let canonical_target = std::fs::canonicalize(&target).map_err(|e| {
        if e.kind() == io::ErrorKind::NotFound {
            ServeError::NotFound
        } else {
            ServeError::Io(e)
        }
    })?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err(ServeError::EscapedRoot);
    }
    let meta = std::fs::metadata(&canonical_target).map_err(ServeError::Io)?;
    if !meta.is_file() {
        return Err(ServeError::NotAFile);
    }
    let body = std::fs::read(&canonical_target).map_err(ServeError::Io)?;
    let content_type = content_type_for_path(&canonical_target);
    let body = if content_type == ContentType::Html && references_domi_js(&body) {
        inject_shim_inline(body)
    } else {
        body
    };
    Ok(ServedFile { body, content_type })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    fn write(p: &Path, s: &str) {
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        let mut f = std::fs::File::create(p).unwrap();
        f.write_all(s.as_bytes()).unwrap();
    }

    #[test]
    fn serves_html_with_domi_js_injects_shim_before_script() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let file = root.join("dashboard.html");
        write(
            &file,
            r#"<!doctype html><html><body><script src="../scripts/domi.js"></script></body></html>"#,
        );
        let body = std::fs::read(&file).unwrap();
        let requested = Path::new("dashboard.html");
        let s = serve_file(root, requested).expect("serve ok");
        assert_eq!(s.content_type, ContentType::Html);
        let out = std::str::from_utf8(&s.body).unwrap();
        // Shim injected before the existing script tag.
        let shim_pos = out.find("window.__DOMI_SERVER__").expect("shim present");
        let original_script_pos = out.find("domi.js").expect("original ref present");
        assert!(shim_pos < original_script_pos, "shim must come before the existing <script>");
        // Original content preserved.
        assert!(out.contains("domi.js"));
    }

    #[test]
    fn html_without_domi_js_returns_unchanged() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let file = root.join("plain.html");
        write(&file, "<html><body><h1>hi</h1></body></html>");
        let original = std::fs::read(&file).unwrap();
        let s = serve_file(root, Path::new("plain.html")).unwrap();
        assert_eq!(s.body, original);
    }

    #[test]
    fn css_returns_unchanged() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let file = root.join("style.css");
        write(&file, "body { color: red; }");
        let s = serve_file(root, Path::new("style.css")).unwrap();
        assert_eq!(s.content_type, ContentType::Css);
        assert!(std::str::from_utf8(&s.body).unwrap().contains("color: red"));
    }

    #[test]
    fn missing_file_returns_NotFound() {
        let dir = tempdir().unwrap();
        let s = serve_file(dir.path(), Path::new("nope.html"));
        assert!(matches!(s, Err(ServeError::NotFound)));
    }

    #[test]
    fn directory_returns_NotAFile() {
        let dir = tempdir().unwrap();
        let sub = dir.path().join("subdir");
        std::fs::create_dir(&sub).unwrap();
        let s = serve_file(dir.path(), Path::new("subdir"));
        assert!(matches!(s, Err(ServeError::NotAFile)));
    }

    #[test]
    fn path_escape_returns_EscapedRoot() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let outside = dir.path().parent().unwrap().join("outside.html");
        std::fs::write(&outside, "<html></html>").unwrap();
        let s = serve_file(root, Path::new("../outside.html"));
        assert!(matches!(s, Err(ServeError::EscapedRoot)));
    }

    #[test]
    fn content_type_js_for_js_files() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write(&root.join("app.js"), "console.log(1);");
        let s = serve_file(root, Path::new("app.js")).unwrap();
        assert_eq!(s.content_type, ContentType::Js);
    }

    #[test]
    fn content_type_default_is_octet_stream() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write(&root.join("mystery.xyz"), "data");
        let s = serve_file(root, Path::new("mystery.xyz")).unwrap();
        assert_eq!(s.content_type, ContentType::OctetStream);
    }
}
```

- [ ] **Step 2: Update `serve/mod.rs`**

```rust
pub mod banner;
pub mod file;
pub mod shim;
pub mod watcher;
```

- [ ] **Step 3: Run tests, verify GREEN**

```bash
cargo test -p domi-server file 2>&1 | tail -10
cargo test -p domi-server 2>&1 | tail -3
```

Expected: 14 prior tests + 8 new = 22 passing.

- [ ] **Step 4: Commit**

```bash
git add crates/domi-server/src/serve/
git commit -m "feat(domi-server): serve::file — serve_file with HTML shim injection"
```

---

### Task 6: `serve/watcher::NotifyWatcher` (notify-backed impl, gated test)

**Files:**
- Modify: `crates/domi-server/src/serve/watcher.rs` (add `NotifyWatcher`)
- Modify: `crates/domi-server/Cargo.toml` (add `notify = "6"`)

**Interfaces:**
- Consumes: `notify` crate (v6.x).
- Produces: `pub struct NotifyWatcher` with `pub fn new(root: &Path, coalesce_ms: u32) -> io::Result<Self>`, `pub fn root(&self) -> &Path`, `impl Watcher for NotifyWatcher`.

- [ ] **Step 1: Update `Cargo.toml`**

Append to `[dependencies]`:

```toml
notify = "6"
```

- [ ] **Step 2: Add `NotifyWatcher` impl to `serve/watcher.rs`**

Append (below the existing `MockWatcher` impl, above `#[cfg(test)] mod tests`):

```rust
use notify::{Event as NotifyEvent, EventKind, RecommendedWatcher, RecursiveMode, Watcher as NotifyWatcherTrait};
use std::sync::mpsc::{channel, RecvTimeoutError};

pub struct NotifyWatcher {
    _impl: RecommendedWatcher,
    rx: std::sync::mpsc::Receiver<std::io::Result<notify::Result<NotifyEvent>>>,
    root: PathBuf,
}

impl NotifyWatcher {
    pub fn new(root: &Path, coalesce_ms: u32) -> io::Result<Self> {
        let (tx, rx) = channel();
        let mut impl_ = RecommendedWatcher::new(
            move |res: notify::Result<NotifyEvent>| {
                let _ = tx.send(res.map_err(|e| io::Error::other(e.to_string())));
            },
            notify::Config::default().with_poll_interval(std::time::Duration::from_millis(coalesce_ms.max(10) as u64)),
        )
        .map_err(|e| io::Error::other(e.to_string()))?;
        impl_
            .watch(root, RecursiveMode::Recursive)
            .map_err(|e| io::Error::other(e.to_string()))?;
        Ok(Self { _impl: impl_, rx, root: root.to_path_buf() })
    }

    pub fn root(&self) -> &Path { &self.root }
}

fn map_kind(k: EventKind) -> WatchEventKind {
    match k {
        EventKind::Create(_) => WatchEventKind::Created,
        EventKind::Modify(_) => WatchEventKind::Modified,
        EventKind::Remove(_) => WatchEventKind::Removed,
        _ => WatchEventKind::Any,
    }
}

impl Watcher for NotifyWatcher {
    fn next_event(&mut self, timeout_ms: u32) -> io::Result<Option<WatchEvent>> {
        let recv = self.rx.recv_timeout(std::time::Duration::from_millis(timeout_ms as u64));
        match recv {
            Ok(Ok(ev)) => Ok(Some(WatchEvent {
                kind: map_kind(ev.kind),
                paths: ev.paths,
            })),
            Ok(Err(e)) => Err(io::Error::other(e.to_string())),
            Err(RecvTimeoutError::Timeout) => Ok(None),
            Err(RecvTimeoutError::Disconnected) => Ok(None),
        }
    }
}
```

- [ ] **Step 3: Append a gated integration test**

Add at the end of `tests` module:

```rust
    #[test]
    #[ignore = "flaky in CI on macOS FSEvents; run with --ignored to verify manually"]
    fn notify_watcher_emits_event_on_create() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        // Initialize the watcher before creating the file.
        let mut w = NotifyWatcher::new(root, 50).expect("watcher created");
        // Give the watcher time to attach.
        std::thread::sleep(std::time::Duration::from_millis(50));
        std::fs::write(root.join("new.html"), "<h1>x</h1>").unwrap();
        // Poll for up to 2 seconds.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        let mut got = None;
        while std::time::Instant::now() < deadline {
            if let Some(ev) = w.next_event(100).unwrap() {
                got = Some(ev);
                break;
            }
        }
        let ev = got.expect("watcher emitted an event within 2s");
        assert!(ev.paths.iter().any(|p| p.ends_with("new.html")));
    }
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
cargo test -p domi-server 2>&1 | tail -3
cargo test -p domi-server -- --ignored notify_watcher_emits_event_on_create 2>&1 | tail -10
```

Expected first command: 22 passing, 1 ignored (the gated notify test). Second command: gated test passes locally.

- [ ] **Step 5: Commit**

```bash
git add crates/domi-server/Cargo.toml crates/domi-server/src/serve/watcher.rs
git commit -m "feat(domi-server): serve::watcher::NotifyWatcher — notify-backed impl"
```

---

### Task 7: Workspace + JS regression verification

**Files:** none (verification only).

- [ ] **Step 1: Run full Rust suite**

```bash
cargo test --workspace 2>&1 | tail -3
```
Expected: 22 passing, 1 ignored.

- [ ] **Step 2: Run full JS suite**

```bash
npm test 2>&1 | tail -5
```
Expected: 61/61 passing (58 prior + 3 shim tests).

- [ ] **Step 3: Re-confirm no JS-half files were modified**

```bash
git log --since=v0.1.0 --oneline -- tokens/ components/ scripts/domi.js scripts/domi-audit.js templates/dashboard templates/webapp-shell templates/mobile-app-shell templates/admin-tool templates/pos-kiosk examples/
```
Expected: only the prior commits (2c-α's release notes mention `examples/`, plus 2c-β's new `scripts/domi-server.js` and `tests/domi-server-js.test.js` show in this list — but `examples/` and the originals shouldn't have NEW diffs from this round).

Concretely: `git diff v0.1.0..HEAD --stat -- tokens/ components/ examples/` should be empty from THIS session's work (the existing diffs predate 2c-β).

- [ ] **Step 4: Verify Cargo.lock policy**

```bash
ls Cargo.lock 2>/dev/null && echo "exists (gitignored, correct for library)" || echo "absent"
```
Expected: `exists` (still gitignored). Library only.

- [ ] **Step 5: Commit only if anything was discovered-and-fixed**

Likely nothing. Skip if clean.

---

### Task 8: Documentation + release notes

**Files:**
- Modify: `docs/RUST.md` (add `serve/` to layout)
- Modify: `RELEASE-NOTES-v0.1.0.md`

- [ ] **Step 1: Update `docs/RUST.md` crate layout**

Replace the layout block:

```markdown
\`\`\`
crates/domi-server/
  src/lib.rs
  src/events/
    mod.rs
    event.rs       # Event, EventData, Kind, Source, Target, Rect (2 tests inline)
    writer.rs      # EventWriter, WriteError, Rotation, FileShape (7 tests inline)
\`\`\`
```

with:

```markdown
\`\`\`
crates/domi-server/
  src/lib.rs
  src/events/                           # 2c-α
    mod.rs
    event.rs
    writer.rs
  src/serve/                            # 2c-β
    mod.rs
    banner.rs                          # GET /
    file.rs                            # serve_file + shim injection (8 tests inline)
    shim.rs                            # SHIM_BYTES (compile-time embedded)
    watcher.rs                         # Watcher trait + NotifyWatcher + MockWatcher
  build.rs                              # reads scripts/domi-server.js → SHIM_BYTES
\`\`\`
```

(Tests stay described inline next to the file they live in. Update the "Phasing" table to mark 2c-β as done and 2c-γ as next.)

- [ ] **Step 2: Append release-notes section**

Append to `RELEASE-NOTES-v0.1.0.md`:

```markdown

---

## Phase 2c-β — HTML serving + folder watcher (2026-07-05)

- New `crates/domi-server/src/serve/` module: `banner`, `file`, `shim`, `watcher`.
- `serve_file(root, path)` returns content + content-type with HTML shim injection when the file references `domi.js`.
- `Watcher` trait + `NotifyWatcher` (notify-backed, gated integration test) + `MockWatcher` (test-only).
- New `scripts/domi-server.js` shim (≤ 1 KB): sets `window.__DOMI_SERVER__=true`, opens WS, surfaces `DomiServer.{subscribe,export}`. Embedded into Rust as `SHIM_BYTES` via `build.rs` so `serve_file` injects without runtime I/O.
- 22 new Rust tests (7 watcher + 8 file + 3 shim + 4 banner parity + 1 integration gated). 3 new JS shim tests.
- Companion doc updates: `docs/PHASE2-SCOPE.md`, `docs/WIRE-PROTOCOL.md`.
- JS half (tokens, primitives, templates, `domi.js`, `domi-audit.js`, examples): untouched.
```

- [ ] **Step 3: Final verification**

```bash
cargo test --workspace 2>&1 | tail -3
npm test 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add docs/RUST.md RELEASE-NOTES-v0.1.0.md
git commit -m "docs(rust): Phase 2c-β release notes + RUST.md layout update"
```

---

## Done when

All 8 task checklists complete; `cargo test --workspace` shows 22 passing + 1 ignored; `npm test` shows 61/61 passing; the only JS-half file added since v0.1.0 is `scripts/domi-server.js` (intentional); library files (`tokens/`, `components/`, original `templates/*/`, `scripts/domi.js`, `scripts/domi-audit.js`, `examples/`) have no NEW diffs from this round.
