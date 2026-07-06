# DOMiNice v0.1.0 — Phase 1 Complete

> Sponsored by [stoopery](https://stoopery.app)

First public release of the DOMiNice HTML-first design system.

## What's included

- 15 HTML primitives (button, card, form, input, select, checkbox, radio, table, nav, modal, alert, badge, tabs, toast, tooltip)
- 5 archetypes (dashboard, webapp-shell, mobile-app-shell, admin-tool, pos-kiosk)
- `domi.js` standalone runtime (click-to-feedback, form capture, JSONL export)
- `SKILL.md` for AI agents (Claude/Kilo/etc.)
- Full docs: DESIGN, USAGE, STANDARDS, STATUS, UX-MEMORY
- Locked Neo-Glass-Vintage "Sunset Pastel" aesthetic

## What's NOT included (later phases)

- Phase 2: `domi-server` Rust binary (live feedback loop)
- Phase 3: `@domi/react`, `@domi/astro`, `domi-dvui` (Rust crate)
- Phase 4: distribution polish + examples

## Install

```bash
git clone https://github.com/your-org/dominice.git
cd dominice
npm install
```

Open `templates/dashboard/index.html` in a browser.

## License

MIT

---

## SKILL reframe (post-v0.1.0 docs patch, 2026-07-05)

- `SKILL.md` rewritten to lead with the *authoring* + *audit-loop* purpose; neo aesthetic moved to a scoped section.
- New docs: `docs/AUDIT.md`, `docs/EXTENDING.md`, `docs/LAYOUTS.md`.
- New runtime: `scripts/domi-audit.js` (additive; `domi.js` unchanged).
- New archetype: `templates/working-doc/`.
- No library changes — tokens, primitives, templates (other than the new archetype), and `domi.js` are untouched.

---

## Phase 2c-α — Events writer crate (2026-07-05)

- New Rust workspace member: `crates/domi-server` (library only).
- `events` module: `Event`, `EventWriter`, `WriteError`, `Rotation`, `FileShape`. Sync-only, TDD'd.
- 9 tests: round-trip, append-with-newline, rotation-on-cap, force-rotate, file_shape (V2/Legacy/MalformedJson/Empty), lock-busy.
- Companion docs: `docs/WIRE-PROTOCOL.md` (wire format), `docs/schemas/event.schema.json` (canonical shape), `docs/RUST.md` (crate layout + phasing).
- JS half (tokens, primitives, templates, `domi.js`, `domi-audit.js`, examples): untouched.

---

## Phase 2c-β — HTML serving + folder watcher (2026-07-05)

- New `crates/domi-server/src/serve/` module: `banner`, `file`, `shim`, `watcher`.
- `serve_file(root, path)` returns content + content-type with HTML shim injection when the file references `domi.js`.
- `Watcher` trait + `NotifyWatcher` (notify-backed, gated integration test) + `MockWatcher` (test-only).
- New `scripts/domi-server.js` shim (≤ 1 KB): sets `window.__DOMI_SERVER__=true`, opens WS, surfaces `DomiServer.{subscribe,export}`. Embedded into Rust as `SHIM_BYTES` via `build.rs` so `serve_file` injects without runtime I/O.
- 22 new Rust tests (7 watcher + 8 file + 3 shim + 4 banner parity + 1 integration gated). 3 new JS shim tests.
- Companion doc updates: `docs/PHASE2-SCOPE.md`, `docs/WIRE-PROTOCOL.md`.
- JS half (tokens, primitives, templates, `domi.js`, `domi-audit.js`, examples): untouched.

---

## Phase 2b — Server-attached JS mode (2026-07-05)

- `scripts/domi.js` and `scripts/domi-audit.js` now branch on `window.__DOMI_SERVER__ === true`.
- **Standalone mode** (Phase 1) is unchanged: localStorage is the source of truth, all 4 prior `domi.js` and 4 prior `domi-audit.js` tests still pass.
- **Server mode:**
  - `domi.js` POSTs v2 click/input events to `/api/events` with `id: null`; server stamps the ULID.
  - `domi-audit.js` POSTs v2 `rail-add` / `rail-resolve` events; hydrates via `GET /api/events?doc=<doc>` on mount. Boot-mirror from localStorage renders immediately, server state merges in.
  - WebSocket bridge: `domi-event` CustomEvents render comments / resolve events live as they arrive.
  - `localStorage` becomes a read-only boot mirror — read once on init, never written.
  - `DomiAudit.resolveEntry(entryId)` is new in 2b; phase 1 had no resolve path.
- New `scripts/domi-wire.js`: stateless `isServerMode`, `postEvent`, `getEvents`, `onServerEvent`, `onServerOpen`, `serverOrigin` helpers used by both runtimes.
- 22 new tests: 12 for `domi-wire` (helper coverage), 3 server-mode for `domi.js`, 5 server-mode for `domi-audit.js`, 1 server-stamps rule for `wire-protocol`, plus the schema annotation allowing `id: null`.
- Spec + companion docs:
  - `docs/superpowers/specs/2026-07-05-phase2b-server-attached-js-design.md`
  - `docs/AUDIT.md` (new "Server-attached mode" section)
  - `docs/WIRE-PROTOCOL.md` (server stamps `id` if absent rule)
  - `docs/schemas/event.schema.json` (top-level `id` accepts `null`)
- Library files (`tokens/`, `components/`, original `templates/*/`, `crates/domi-server/`, `examples/`, `scripts/domi-server.js`): untouched.



---

## Phase 2c-γ — `domi-server` binary (2026-07-05)

- New `domi-server` binary: `cargo run -p domi-server -- --port 4173` boots the live feedback server.
- axum 0.7 + tokio 1 + tower/tower-http + clap 4 + futures 0.3 (all permissively licensed).
- `crates/domi-server/src/http/` module: `args` (clap derive), `state` (AppState with broadcast channel), `router` (axum Router), `handlers` (banner, healthz, static_serve, post_event, get_events), `ws` (WebSocket upgrade + broadcast loop), `mod` (top-level orchestration with graceful shutdown).
- Routes wired per 2a spec: `GET /`, `GET /<path>` (HTML shim injection from 2c-β), `POST /api/events` (validates v=2, stamps id/ts on missing, spawn_blocking write, broadcast), `GET /api/events?since=&doc=&limit=` (filter + clamp limit 1–1000), `GET /ws/events` (hello frame + event broadcasts).
- Additive `GET /healthz` for tooling (not in 2a route table; documented).
- Graceful shutdown on SIGINT/SIGTERM via `tokio::signal`.
- Watcher wired to a `tracing::debug!` loop to demonstrate end-to-end correctness of the 2c-β API; no cache layer.
- 15 new handler tests + 1 WebSocket test + 1 gated binary smoke test (`cargo test -p domi-server -- --ignored binary_smoke`).
- 47 passing + 1 ignored (notify watcher FSEvents, pre-existing) on the Rust side; 83/83 passing on the JS side, no regressions.
- `Cargo.lock` continues to be gitignored (unchanged from 2c-α/2c-β).
- Library files (`tokens/`, `components/`, `scripts/domi.js`, `scripts/domi-audit.js`, original `templates/*/`, `examples/`): untouched.
