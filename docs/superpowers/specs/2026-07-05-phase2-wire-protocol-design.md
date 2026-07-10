# Phase 2a — Wire Protocol & Event Schema

**Date:** 2026-07-05
**Status:** Draft (post self-review)
**Phase:** 2a of 4 (decomposed out of Phase 2's original roadmap)
**Upstream:** `docs/superpowers/specs/2026-07-05-dominice-design.md` §9 Phasing
**Sibling sub-projects:** 2b (server-attached JS mode), 2c (Rust binary), 2d (agent reader + install)

## Problem

Phase 2 of DOMiNice promises a real-time feedback loop: human clicks → event travels back to the agent → agent writes a new version of the artifact → human re-reviews. The Phase 1 runtime (`scripts/runtime/domi.js`, `scripts/runtime/domi-audit.js`) captures feedback client-side and persists to `localStorage`, but no transport exists between browser and agent.

Phase 2a (this spec) pins down the **wire protocol** so that:
- 2b's server-attached JS mode has a contract to write to.
- 2c's Rust binary has a contract to serve and forward.
- 2d's agent has a contract to consume.
- The JSONL file the existing spec already names (`events.jsonl`) has a concrete shape.

Without this contract pinned first, 2b and 2c each invent their own shape and the boundary breaks.

## Goals

- Define the **event payload** that travels browser → server → file → agent, with version field for forward compatibility.
- Define the **two delivery channels** (file append, WebSocket push) such that they are consistent streams of the same payload.
- Define the **server's responsibilities** at the wire level (read HTML, append events, broadcast) — concrete enough to drive 2c implementation, abstract enough that 2c can choose its dependencies.
- Define the **agent's contract** for consuming events (pull via file tail, or subscribe via WebSocket) — to be reified in 2d.

## Non-goals

- The Rust binary itself (2c). 2a stops at the protocol, not the implementation choices.
- The browser-side upgrade to existing JS runtimes (2b). 2a only writes the contract.
- The agent-side CLI / library that reads events (2d).
- Authentication. Per the original design spec, the server is local-only and unauthenticated.
- Multiplexing or compression over WebSocket. Keep the wire simple.
- Backwards-compatibility shims for events written by Phase 1-only `domi.js` (which used a different shape — `events.jsonl` written by `window.DOMi.exportFeedback` is JSONL but uses a slightly older entry shape).

## Design

### A. Event payload schema

Every event written to file or pushed via WebSocket has the same JSON shape:

```json
{
  "v": 2,
  "id": "01J8XZQ5K2J9Z9Q4X5Y6Z7X8Y1",
  "ts": "2026-07-05T18:21:00.000Z",
  "src": "domi.js | domi-audit.js | browser-ext | unknown",
  "doc": "<docName-or-document-id>",
  "kind": "click | input | submit | rail-add | rail-resolve | custom",
  "target": {
    "id": "data-feedback attribute, or null for the doc itself",
    "selector": "CSS selector path, or null if not derivable",
    "rect": { "x": 120, "y": 480, "w": 200, "h": 32 }
  },
  "data": { /* kind-specific payload, see below */ }
}
```

Field rules:

- `v` — schema version. Starts at `2` because Phase 1's `domi.js` already wrote `v: 1`-shaped entries informally; bumping it lets consumers explicitly branch. Phase 1 JSONL *may* still appear on disk; the server reads it, rewrites it (or quarantines it), and only writes `v: 2` going forward.
- `id` — ULID (sortable, monotonic-ish; used as the primary key in the JSONL stream and as the WebSocket message id).
- `ts` — ISO-8601 UTC timestamp, captured by the *client* at event-creation time (not server time).
- `src` — which runtime produced the event. Lets 2d filter or attribute.
- `doc` — the doc name (matches `localStorage` key suffix `dominice:<doc>` and the `statePath` filename without extension). Required.
- `kind` — string enum, lowercase, kebab-multiword. Kind determines the shape of `data`.
- `target` — best-effort element identification. `id` from `data-feedback`. `selector` is the CSS path the runtime computed (e.g., `main > section:nth-of-type(2) > .domi-card:nth-of-type(1)`). `rect` is the bounding box on screen at the moment of event, useful for the agent when `id` is absent.
- `data` — kind-specific:
  - `click`: `{ value: any }` (optional; what's in the clicked element's textContent / value)
  - `input`: `{ name: string, value: string }`
  - `submit`: `{ formId: string, fields: { [name]: value } }`
  - `rail-add`: `{ body: string, targetId: string|null }` (matches `DomiAudit.addComment` shape)
  - `rail-resolve`: `{ entryId: ULID }` (resolves an entry from `state/<doc>.json`)
  - `custom`: `{ payload: any }` (escape hatch for skill-level events; server forwards unchanged)

### B. File channel — `events.jsonl`

- Path: `.domi/state/events.jsonl` per doc, OR a single rolling `.domi/state/events.jsonl` for the whole project. **Decision: project-level.** Multiple docs in one project share one rolling stream; consumers filter by `event.doc`. This matches the README's roadmap wording `.domi/state/events.jsonl` (singular).
- Encoding: UTF-8, NDJSON (one event per line, no surrounding array), trailing newline at the end of the file at all times.
- Append semantics: server opens with `O_APPEND` (or equivalent). On startup, it must rotate (rename) `events.jsonl` → `events-<UTC-timestamp>.jsonl` if the existing file's first line is not a `v: 2` event (Phase 1 leftovers). This bounds backward-compat to "first-read, rotate-after."
- Rotation policy: server rotates `events.jsonl` when it exceeds a configurable size cap (default 50 MB) or once per UTC day, whichever comes first. Old files are named `events-YYYY-MM-DDTHH-MM-SSZ.jsonl` and kept on disk indefinitely unless the user deletes them. Server does not garbage-collect.
- Truncate policy: server **never** truncates or rewrites. It only appends or rotates.
- Concurrency: single writer (the server process). Multiple readers (the agent, scripts, humans with `tail -f`). The `O_APPEND` semantics are POSIX-atomic for lines ≤ `PIPE_BUF`; for safety the server holds an advisory lock file `.domi/state/events.lock` while appending single lines, released per-line. (Locks are not enforced across processes — they're a debugging hint only. Real correctness comes from the line-level atomicity guarantee.)
- Read API the server exposes (HTTP): `GET /api/events?since=<ULID>&doc=<name>&limit=<n>` returns events strictly after `<ULID>`, optionally filtered by doc. Default `limit=100`, max `limit=1000`. Response shape: `{ events: [Event], nextSince: ULID-of-last | null }`.

### C. WebSocket channel — `/ws/events`

- Path on the server: `ws://localhost:PORT/ws/events`.
- On connect: server immediately sends `{ "type": "hello", "v": 2, "serverId": "<ULID>" }` so the client knows it has a live socket. Then it begins pushing events as they arrive.
- Each push is the event JSON (same shape as file). Wrapped: `{ "type": "event", "event": <Event> }`. The wrapper allows future message types (e.g., `{"type": "pong"}`).
- Server advertises the protocol version on the HTTP root: `GET /` returns `{ name: "domi-server", version: "<semver>", protocol: 2 }`.
- No subscription controls in Phase 2a. The server pushes everything. Filtering by `doc` happens client-side. (Optional 2c addition: client sends `{ "type": "subscribe", "doc": "<name>" }` to filter — defer that to 2c's design call.)
- Client should reconnect with backoff. Server does not re-send missed events on reconnect — the client should fall back to the HTTP `GET /api/events?since=<last-seen-id>` for that. (Documented in 2b / 2d.)
- Heartbeat: server sends `{ "type": "ping" }` every 30s; client may respond with `{ "type": "pong" }` or not (absence is logged at `warn` level).

### D. Server contract at the wire level

The 2c binary's *interface*, not its implementation. 2c chooses axum + tokio + notify per the README, but 2a only fixes:

- HTTP routes:
  - `GET /` — protocol banner (see C above).
  - `GET /<path>` — serve files from `.domi/output/` (or current working dir's `output/`). Inlines `domi-server.js` (a tiny shim that sets `window.__DOMI_SERVER__ = true` and points at `ws://<host>/ws/events`) into any HTML response whose `<script src="…domi.js">` is detected. The shim is the contract — see E below.
  - `POST /api/events` — accept a single event JSON from the browser runtime. Body is the event. Appends to file, broadcasts via WS. Returns `204`.
  - `GET /api/events?since=…` — read API (see B).
  - `GET /ws/events` — WebSocket (see C).
- Watch scope: `.domi/output/` (per the existing spec) — the dir the agent writes to. File change → re-serve (no client-push needed; browsers reload on their own or via 2b's server-attached mode).
- Port: configurable, default `4173` (Vite-style, memorable, unlikely to clash).

### E. Server-attached JS shim — `domi-server.js`

A new tiny runtime (`scripts/runtime/domi-server.js`, ≤ 1 KB) added next to `domi.js` and `domi-audit.js`. Loaded by the server when it serves HTML. It does three things:

1. Sets `window.__DOMI_SERVER__ = true`. Existing runtimes (`domi.js`, `domi-audit.js`) see this and switch modes:
   - `domi.js` writes feedback events to `POST /api/events` instead of `localStorage`.
   - `domi-audit.js` mirrors thread entries to `POST /api/events` (the `rail-add` / `rail-resolve` kinds) and reads via `GET /api/events?since=…`.
   - Persistence semantics documented in 2b. 2a only fixes the **shim's** contract, not the runtime behavior.
2. Opens a WebSocket to `/ws/events` and surfaces a `window.DomiServer.subscribe(cb)` API (deferred detail — minimum: push events to a `window.dispatchEvent(new CustomEvent('domi-event', { detail: event }))` so the runtime can listen without coupling).
3. Provides `window.DomiServer.export()` returning a JSONL string of all events seen so far on this connection (for debug / drop-in replacement of `DOMi.exportFeedback`).

The shim is intentionally minimal in 2a; the mode-switch inside `domi.js` / `domi-audit.js` is 2b's job. 2a's contract is: *if* the shim is loaded and sets `__DOMI_SERVER__`, then *some consumer* (whichever runtime is on the page) will start issuing `POST /api/events` and listening to `/ws/events`. The actual switch is 2b.

### F. Agent contract

Documented in this spec for 2d to reify. Concretely:

- An agent on the same machine reads feedback via one of:
  - **Tail mode:** `tail -F .domi/state/events.jsonl`, filter by `event.doc`. Lossless across agent restarts.
  - **Replay mode:** `GET /api/events?since=<last-seen-id>` on agent startup or socket reconnect. Bounded by 1000 events per call; client paginates.
  - **Push mode:** WebSocket `/ws/events`. Real-time, drops on disconnect.
- The agent picks one. Phase 2d ships a tiny Node CLI that does tail mode by default, with flags for replay and push. The CLI lives in `tools/` (per the existing layout), not in the library proper.

## File-by-file changes (what 2a *itself* produces, vs what it *defers*)

**Produced in 2a:**

- This spec document.
- A short wire-protocol reference doc for clients: `docs/WIRE-PROTOCOL.md` (≤ 80 lines, copy-paste-able into 2b / 2d PRs).
- An event-schema JSON Schema file at `docs/schemas/event.schema.json` (for any consumer that wants to validate; deferable to 2c if 2c prefers doing it once).

**Deferred to 2b:** server-attached mode in `domi.js`, `domi-audit.js`, and the `domi-server.js` shim itself.

**Deferred to 2c:** the Rust binary, the actual HTTP server, the watcher, the WebSocket plumbing. 2c reifies D + the file-writing half of B.

**Deferred to 2d:** the agent reader CLI, install/verify scripts that exercise it.

## Acceptance

2a is done when:

- This spec is committed and self-reviewed.
- `docs/WIRE-PROTOCOL.md` exists and matches this spec.
- `docs/schemas/event.schema.json` exists (or is explicitly deferred to 2c).
- A 100-line "what's deferred to 2b/2c/2d" note exists at `docs/PHASE2-SCOPE.md` so future readers don't confuse this spec's scope with Phase 2's full scope.

No Rust, no shim, no runtime changes happen in 2a. **2a is documentation and a JSON Schema.** The tests for 2a are JSON-schema validation tests against example events (`tests/wire-protocol.test.js`): events must validate, malformed examples must reject, version-downgrade events from Phase 1 must be detected for rotation.

## Risks and open questions

- **Backward compat with Phase 1 `domi.js` export.** Phase 1's `DOMi.exportFeedback` produces JSONL with `id`, `selector`, `text` fields per line. Different shape. Server detects on first read, rotates, writes fresh. Tested in 2c; spec'd here.
- **Concurrent writers from `localStorage` mirror and `__DOMI_SERVER__` mode.** When 2b's mode-switch happens, the runtime must not double-write. Spec says: in server mode, `localStorage` is **read-only** (still the boot mirror) and `POST /api/events` is **only** write. Tested in 2b.
- **Privacy of `target.rect`.** Capturing coordinates means the server sees pixel positions. Acceptable for localhost. Document in WIRE-PROTOCOL.md.
- **JSONL line size.** A `submit` event with a big form could exceed `PIPE_BUF` (4096 on most POSIX). Server writes in `O_APPEND` chunks ≤ 4 KB per syscall. Edge case for 2c.
- **Schema evolution.** `v: 2` is the start. Future versions must coexist; consumers must be able to read past `v`. Documented in WIRE-PROTOCOL.md. No migration path yet (YAGNI for 2a).
- **Concurrent server runs across machines.** Out of scope — local-only, single-process per the original design spec §10. Re-confirming here so 2c does not get tempted into building for it.
