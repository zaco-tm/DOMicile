# DOMiNice — Where We Are

## Phase status as of 2026-07-05

### Shipped
- **Phase 1** — skill + design tokens + 15 primitives + 5 archetypes + `domi.js` runtime + STATUS/UX-MEMORY docs.
- **1.x rework** — SKILL.md reframe, AUDIT/EXTENDING/LAYOUTS docs, `domi-audit.js` runtime, `templates/working-doc/`, `examples/example-audit.html`.
- **Phase 2a** — `docs/WIRE-PROTOCOL.md`, `docs/schemas/event.schema.json`, 11 wire-protocol tests.
- **Phase 2c-α** — `crates/domi-server/src/events/` (Event, EventWriter, WriteError, FileShape, Rotation), 9 tests.
- **Phase 2c-β** — `crates/domi-server/src/serve/` (banner, file, shim, watcher), `scripts/domi-server.js` shim, 13 new Rust tests + 3 JS shim tests, all 22 wired in.
- **Phase 2b** — server-attached JS mode for `domi.js` + `domi-audit.js`, `scripts/domi-wire.js` helpers, 22 new tests, schema annotation for `id: null`.

### What's locked in by these phases
- The wire protocol (events.jsonl shape, HTTP routes, WS framing).
- Sync event writer (TDD'd, crash-safe, lock-based writer exclusion, ISO-form filename rotation, Phase-1 backward-compat detection).
- Sync HTML serving + folder watcher primitives.
- JS runtimes that route to either localStorage (standalone) or POST + WebSocket (server).
- Server-side `domi-server.js` shim that flips the `__DOMI_SERVER__` flag and opens the WS before any other script runs.

### What's deferred (per your sequencing)
- **2c-γ** — the `domi-server` Rust binary: axum HTTP, tokio runtime, WebSocket upgrade, integration of all the primitives above. **Largest single chunk left.**
- **2d** — agent reader + install/verify CLI.

## Real round-trip status

| Link in the loop | Source | Sink | Status |
|---|---|---|---|
| Human click → event | `domi.js` click handler | server | shipped (2b) |
| Human comment → event | `domi-audit.js` form submit | server | shipped (2b) |
| Server → JSONL | `EventWriter::write` | `.domi/state/events.jsonl` | shipped (2c-α) |
| Live WS push | shim `WebSocket` | `domi-event` CustomEvent | shipped (2c-β + 2b) |
| Server ↔ JSONL `GET /api/events?since=` | server | `domi-audit.js` rehydration | shipped (2b) |
| HTML served with shim | `serve_file` | browser | shipped (2c-β) |
| Folder watch | `NotifyWatcher` | future consumer | shipped (2c-β) |
| **Browser ↔ server over HTTP** | `domi.js` POST | binary's `axum` route | **not built** (2c-γ) |
| **Server's axum routes + WS plumbing** | binary | shim | **not built** (2c-γ) |
| **Agent reader** | binary | `tools/` | **not built** (2d) |

## What's next

The remaining work (`2c-γ` + `2d`) is bounded by what already exists. No new contracts to invent. The biggest single risk is that I don't have a live integration test against an actual `domi-server` binary — the runtimes and the binary will only meet when someone actually wires them up on a real machine.

## To resume

Reply with one of:

- **"2c-γ"** — I dispatch a brainstorm for the Rust binary. Most natural next step.
- **"2d"** — agent reader + install/verify. Smaller, but depends on 2c-γ being shipped first.
- **"stop"** — close this push here. Phase 2 has shipped three of five sub-projects; the binary is the remaining gap.
- Anything else — list of remaining work you'd like redone, additional fixes, etc.
