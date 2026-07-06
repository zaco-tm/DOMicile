# Phase 2 Scope Map

Phase 2 of DOMiNice was originally scoped as "live server." The 2026-07-05 rework decomposed it into multiple sub-projects, each with its own brainstorm→plan→execute cycle.

| Sub | Name | Status | Deliverable |
|---|---|---|---|
| **2a** | Wire protocol & event schema | **Done** (`64225a0`) | `docs/WIRE-PROTOCOL.md`, `docs/schemas/event.schema.json` |
| 2b | Server-attached JS mode | Not started | `domi.js` + `domi-audit.js` mode-switch on `__DOMI_SERVER__`; pairs with 2c-β's `scripts/domi-server.js` |
| 2c-α | `domi-server` events writer crate | **Done** (`638b29d` + earlier) | `crates/domi-server/src/events/` |
| **2c-β** | HTML serving + folder watcher | **Spec this round** | `crates/domi-server/src/serve/` + `scripts/domi-server.js` |
| **2c-γ** | `domi-server` binary + axum + tokio + WS | **Done** | The actual `domi-server` binary; uses 2c-α + 2c-β |
| **2d** | Agent reader + install/verify | **Done** | Tail/replay/push CLI in `crates/domi-server/src/tools/`, `scripts/install.sh` + `scripts/verify.sh` + `scripts/ws-probe.mjs` exercising 2c-γ |

## Dependency order

- 2a must land first (done).
- 2b and 2c-β can run after 2a (both reference its schema and route table).
- 2c-γ depends on 2c-α (events writer) and 2c-β (serve + watcher).
- 2d depends on 2c-γ (binary must exist to be exercised by install/verify scripts and the agent CLI). **Done.**

Smallest sequential schedule:

1. **2a** — done.
2. **2c-β** *(this round)* → unblocks the binary's storage-and-serving primitives.
3. **2b** + **2c-γ** in parallel after 2c-β.
4. **2d** once 2c-γ exists. **Done.**

## What each round ships

**2a:** JSON Schema + wire-protocol prose. No code, no Rust, no JS half changes. Tests are JSON-schema validation.

**2c-α:** Sync Rust library exposing `EventWriter` + `Event` typed Rust struct. No HTTP, no watcher, no JS half changes. Tests against real temp files.

**2c-β (this round):** Sync Rust library exposing `Watcher` trait + `NotifyWatcher` + `MockWatcher`, `serve_file` + `ContentType` + shim injection. New `scripts/domi-server.js` shim (≤ 1 KB). No HTTP, no WS, no async. Tests: vitest for the JS shim; cargo for the Rust primitives.

**2b:** JS half changes — `domi.js` and `domi-audit.js` see `window.__DOMI_SERVER__ === true` and switch from `localStorage` to `POST /api/events` + WebSocket subscription.

**2c-γ:** The `domi-server` binary. axum HTTP, tokio runtime, WS upgrade, integration of 2c-α + 2c-β. The largest single chunk.

**2d:** Agent tooling. install/verify/smoke scripts. A small CLI in `tools/` for tailing `events.jsonl` or replaying via `GET /api/events`.

## Why "wire protocol" first

2b and 2c (α/β/γ) each invent their own event shape if allowed to design independently. The boundary between them is the wire — the cost of getting it wrong is a re-implementation across both. 2a's whole job is to make sure all implementers reach for the same shape and ship a JSON Schema either can validate against.

## Cross-references

- 2a spec: `docs/superpowers/specs/2026-07-05-phase2-wire-protocol-design.md`
- 2a reference for clients: `docs/WIRE-PROTOCOL.md`
- 2a machine-readable schema: `docs/schemas/event.schema.json`
- 2c-α spec: `docs/superpowers/specs/2026-07-05-phase2c-events-writer-design.md`
- 2c-β spec: `docs/superpowers/specs/2026-07-05-phase2c-html-watcher-design.md`
- Phase 1 design spec (source of Phase 2's existence): `docs/superpowers/specs/2026-07-05-dominice-design.md`
- SKILL reframe that establishes working-doc mode (the consumer of these events): `SKILL.md` + `docs/AUDIT.md`
- Repo conventions: `AGENTS.md`
