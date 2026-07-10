# Phase 2b — Server-Attached JS Mode

**Date:** 2026-07-05
**Status:** Draft (post self-review)
**Phase:** 2b
**Upstream contracts:**
- `docs/WIRE-PROTOCOL.md` (v2 wire format)
- `docs/schemas/event.schema.json` (canonical v2 event shape)
- `docs/superpowers/specs/2026-07-05-phase2c-html-watcher-design.md` §C (server shim contract)
**Sibling sub-projects:** 2c-α (events writer; shipped), 2c-β (HTML serving + shim; shipped), 2c-γ (binary; future), 2d (agent reader; future)

## Problem

Phase 1 produced two JS runtimes:

- `scripts/runtime/domi.js` — captures clicks and inputs, writes to `localStorage`, exports JSONL.
- `scripts/runtime/domi-audit.js` — backs the audit rail (a per-doc comment thread), also writes to `localStorage`.

Phase 2a pinned the v2 wire format. The event payload (`{v, id, ts, src, doc, kind, target, data}`) is structurally different from the Phase 1 localStorage entries. Phase 2c-β shipped `scripts/runtime/domi-server.js` — a tiny shim that, when served with HTML by the Phase 2 binary, sets `window.__DOMI_SERVER__ = true` and opens a WebSocket.

What remains before the loop is closed: **the two Phase 1 runtimes need to detect the server-attached flag and route events to `POST /api/events` (or via the WebSocket) instead of localStorage.** That's 2b.

Lock two design defaults up front because they're load-bearing:

- **Q1 = A.** In server-attached mode, `localStorage` becomes **read-only boot mirror** — read once on `init()`, replay into UI, never write again. Server is canonical. WS keeps the UI in sync. (Documented in 2a §D.)
- **Q2 = B.** Server stamps ULID at append time. JS doesn't generate ULIDs. JS submits events with `id: null` (or omits `id`); the server fills it before append. Eliminates the JS-side ULID polyfill and audit burden.

## Goals

- `scripts/runtime/domi.js` and `scripts/runtime/domi-audit.js` work as before in standalone mode (no flag → localStorage).
- When the server-attached shim runs first (sets `window.__DOMI_SERVER__ = true` and connects the WebSocket), both runtimes switch to server mode:
  - `domi.js` POSTs v2 events; localStorage becomes read-only.
  - `domi-audit.js` POSTs v2 `rail-add` and `rail-resolve` events; hydrates from `GET /api/events?since=&doc=<doc>` on mount.
  - Both runtimes consume `domi-event` CustomEvents from the shim (`window.addEventListener('domi-event', …)`) and route them through the same handlers they use for direct user interaction.
- Existing Phase 1 tests still pass.
- New tests cover: mode detection, event payload shape, WS bridge, rehydration on mount.

## Non-goals

- Rust binary, HTTP server, WebSocket plumbing (2c-γ).
- Agent reader CLI (2d).
- Replay of full v1 (Phase 1 localStorage) JSONL: **the two modes are deliberately distinct.** Phase 1 localStorage entries are not v2 events and will not be uploaded. The JSONL file's first-line version check (`v: 2`) handles the transition at the file boundary; the in-page running runtime does **not** reconcile Phase 1 entries.
- A new `domi.js`-level event ID generator. Server stamps (Q2=B).
- A new public API on the runtimes (`DOMi` / `DomiAudit` shapes unchanged). Same exports; new internal branches.

## Design

### A. Mode detection

Both runtimes begin with the same check at the top of their IIFE, after `'use strict'`:

```js
const SERVER = typeof window.__DOMI_SERVER__ === 'boolean' && window.__DOMI_SERVER__;
```

Server mode = `SERVER === true`. Standalone mode = `SERVER === false` OR the global is missing (Phase 1 default).

The check is **synchronous** because the shim is loaded inline-blocking before `domi.js` runs (per 2c-β's serve_file shim injection). If a future regression puts the shim in a deferred script, both runtimes can detect asynchronously by waiting for `domi-server-open` (the shim dispatches a CustomEvent when the WS connects).

### B. `domi.js` in server mode

The runtime keeps its standalone path intact. In server mode:

- `logEvent(ev)` (Phase 1: pushes to localStorage) becomes `submitEvent(ev)` (POSTs to `/api/events`).
- `debounce`-wrapped input writes also POST, batched-as-one or per-keystroke? **Per-keystroke**, debounced 300 ms (matches Phase 1).
- `exportFeedback()` (Phase 1: builds a Blob URL) becomes `fetch('/api/events?since=&doc=<doc>')` returning a JSONL string. Same `window.DOMi.exportFeedback()` API; identical return type (`Blob`-like URL via existing `URL.createObjectURL` or just a promise — see I).
- Standalone-mode `localStorage` reads of `eventsKey` and `inputsKey` are honored once on `init()` to provide the boot mirror. After that, no writes.

The branch point is at the log/dedup site, not at the event-capture site. Event capture is unchanged: clicks/inputs still bubble via `document.addEventListener('click', …)` with `data-feedback` lookup.

**Conversion rule:** `logEvent({type: 'click', selector, tag, text, ts, page})` becomes `submitEvent(toWire('click', selector, tag, text))`, which constructs:

```json
{
  "v": 2,
  "id": null,
  "ts": "<ISO-8601>",
  "src": "domi.js",
  "doc": "<doc-name>",
  "kind": "click",
  "target": {
    "id": "<selector>",
    "selector": "auto-resolved-by-server",
    "rect": null
  },
  "data": { "value": "<truncated text>" }
}
```

`id: null` lets the server fill it. `selector: null` is intentional — the JS side doesn't compute CSS selectors; the v2 schema's `id` field on `target` carries the `data-feedback` value, which is what matters. If the spec requires `selector` non-null in future, the server will fill it from the rect's positioning on the DOM. For now, `null` is the honest answer.

For `input` events:

```json
{
  "v": 2,
  "id": null,
  "ts": "...",
  "src": "domi.js",
  "doc": "<doc>",
  "kind": "input",
  "target": { "id": "<form-name>", "selector": null, "rect": null },
  "data": { "name": "...", "value": "..." }
}
```

### C. `domi-audit.js` in server mode

The rail is fundamentally a real-time surface. Two operational modes:

- **Standalone:** writes to `localStorage` (current behavior).
- **Server:** writes through `POST /api/events` as a `rail-add` event; reads through `GET /api/events?doc=<doc>` on `mount()`.

`mount({ statePath, docName })` behavior:

- **Standalone (today):** hydrate from localStorage key `dominice:<doc>`. Existing.
- **Server:** fetch `/api/events?doc=<doc>&limit=1000`. The response is `{ events: [...], nextSince }`. Filter entries that aren't ours (`src === 'domi-audit.js'` plus we identify rail entries by `kind === 'rail-add' | 'rail-resolve'`).

`addComment({ targetId, body })`:

- **Standalone:** mutate `_state.entries`, save to localStorage, re-render.
- **Server:** POST `{v: 2, id: null, ts, src: 'domi-audit.js', doc, kind: 'rail-add', target: {id: targetId, selector: null, rect: null}, data: {body, targetId}}` to `/api/events`. Do **not** mutate `_state` locally. The WS bridge (next section) will deliver the entry back as a `domi-event` CustomEvent; `addComment`-equivalent handler consumes it and re-renders.

`export()`:

- **Standalone:** existing `JSON.stringify(_state)`.
- **Server:** `GET /api/events?doc=<doc>&limit=1000`, filter to `rail-add` and `rail-resolve` kinds, build a mirror of `_state` shape, return JSON string. Same synchronous signature; reject if `fetch` is unavailable (Phase 1 final deliverables shouldn't depend on a server).

New method `resolveEntry(entryId)`:

- Available in both modes (Phase 1 currently has no resolve path; this is the seed for future feature work).
- **Standalone:** mutate `entry.resolved = true`, save, re-render.
- **Server:** POST `{v: 2, id: null, ts, src: 'domi-audit.js', doc, kind: 'rail-resolve', target: null, data: {entryId}}`.

### D. The WebSocket bridge

The shim dispatches `CustomEvent('domi-event', { detail: <event> })` for each incoming v2 event, plus `CustomEvent('domi-server-open', { detail: undefined })` when the WS connects.

Both runtimes, on `init()` (or `mount()` in domi-audit), subscribe:

```js
window.addEventListener('domi-event', (e) => onServerEvent(e.detail));
window.addEventListener('domi-server-open', () => onServerConnected());
```

`onServerEvent(event)` for `domi.js` re-renders any UI that the in-memory event list maintained. Phase 1's `domi.js` has no persistent event-render UI (events live only in localStorage); this hook is a **future-anchor only** for now. Phase 2 will add a small live "feed" panel in a follow-up — that's outside 2b.

`onServerEvent(event)` for `domi-audit.js` is the real-time heart: for each `rail-add` event with matching `doc`, push into `_state.entries`, persist (or, in server mode, **don't persist — server already accepted it**), re-render the rail. For `rail-resolve`, mark the matching local entry as resolved.

**Critical:** events received via WS are already on the server. The JS must NOT re-POST them. The cycle is: user posts → server appends → WS broadcasts → all clients (including the originator) render the new entry. This means the WS listener is the **same code path** that handles a comment a remote collaborator typed.

### E. Rehydration on mount

`domi-audit.js` in server mode calls `GET /api/events?doc=<doc>` on mount and populates `_state`. Implementation: `await fetch(...)`, parse, filter, set `_state`, `_render()`.

`domi.js` doesn't have a hydrate step in Phase 1 either; the bridge to "show past events" doesn't exist yet. **2b does not add it.** Phase 2 follow-up.

### F. Boot mirror semantics (Q1=A)

When the runtime boots in server mode:

1. Read `localStorage` for the relevant key(s) once. (Same as today.)
2. Replay cached state into UI (Phase 2: rail rendered, or empty if no cache).
3. Begin server-mode operations: from now on, never write localStorage.

A user who opens a working doc **without** the server (e.g., `file://`) gets Phase 1 behavior — the shim isn't there, so `SERVER` is `false`, and localStorage is the source of truth. **No regression on Phase 1.** This is the entire point of Q1=A — keep offline-friendly fallback.

A user who opens the same doc **with** the server runs once with localStorage (mirror), then transitions to server mode. The localStorage data is preserved as a boot mirror but the server is canonical thereafter. If the user comes back later without the server, they see the last localStorage snapshot (which may predate the server session). This is acceptable degradation; full sync is the server's job.

### G. Server ULID stamping (Q2=B)

JS POSTs events with `id: null` (or omits `id`). The server's `POST /api/events` handler stamps a ULID if missing.

**Wire protocol update:** `docs/WIRE-PROTOCOL.md` documents the rule: "Server stamps `id` if absent. Client MAY set `id`; if so, must be a valid ULID." This is added as a brief wire-spec update alongside this 2b work.

**Schema update:** the v2 event JSON Schema's `id` field's `required` stays `true` in the schema — the server is the source of truth and refuses events it cannot stamp. The new behavior is **client MAY set `id`, server MUST set `id` before append**. JS clients omit the field (or send `null`) and the server fills it. The schema's `tests/wire-protocol.test.js` samples continue to include `id` because they're round-trip tests; the new example event in those tests will document the server-stamps rule (a sample without `id` and the server-resolved version).

The Rust 2c-γ binary implementation is responsible for stamping. JS does not need a ULID library — see Q2=B rationale.

### H. Failure modes

- **Server unreachable in server mode:** `POST /api/events` fails (network error). The runtime logs to `console.warn` and continues; localStorage is NOT used as a write-back buffer (per Q1=A). Phase 2 callers must accept events may be lost if the server is down — that's a deliberate scope choice (server is canonical).
- **WS disconnects:** the shim auto-reconnects. JS runtimes don't need to know — they keep firing `POST /api/events` and listening for `domi-event`.
- **`fetch` unavailable:** Only happens for ancient browsers. The runtime bails into standalone mode automatically if `typeof fetch !== 'function'`. Same Q1=A rationale.
- **Server returns 4xx for a malformed event:** The runtime logs the body and stops retrying on that event. No infinite loop.
- **Re-entry via `domi-event` of a comment I just posted:** Idempotent — the render uses the ULID-stamped entry from the server, not whatever the JS-side "intended" entry looked like. Local cache may briefly hold both the pre-stamp `_state` and the broadcast entry; the bridge maps by `entryId`.

### I. `exportFeedback` API continuity

Phase 1 `domi.js#exportFeedback()` returns a `Blob` URL. Phase 2 callers may rely on that signature.

- **Standalone (unchanged):** returns `Blob` URL of localStorage JSONL.
- **Server:** returns a `Blob` URL built from `GET /api/events?doc=<doc>&since=` filtered to client-emitted events (i.e., `src === 'domi.js'`). Synchronous-feeling API: returns a `Blob` URL immediately that *contains at-the-time-of-call* data, then resolves later events via WS into the page state.

This is a small API break for any caller expecting Phase 1's exact localStorage-only content. Acceptable: 2b's contract is server mode is opt-in via the shim flag; standalone-mode callers see no change. **Document the change in `docs/AUDIT.md` (referenced from the runtime's API section).**

## File-by-file changes

| Path | Action | Notes |
|---|---|---|
| `scripts/runtime/domi.js` | Modify | Mode-switch in `logEvent`, `debounce` save, `exportFeedback`. +~80 lines. |
| `scripts/runtime/domi-audit.js` | Modify | Mode-switch in `mount`, `addComment`. New `resolveEntry` method. Rehydration via `fetch`. +~100 lines. |
| `tests/domi.test.js` | Modify | Add server-mode tests (~5 new). |
| `tests/domi-audit.test.js` | Modify | Add server-mode + rehydration tests (~5 new). |
| `tests/wire-protocol.test.js` | Modify | Add a sample event posted from JS without `id`; existing assertions for `v: 2` still pass. |
| `docs/AUDIT.md` | Modify | Add a "Server-attached mode" section explaining `domi-audit.js` POST and rehydration. |
| `docs/WIRE-PROTOCOL.md` | Modify | Add the rule "Server stamps `id` if absent." |
| `RELEASE-NOTES-v0.1.0.md` | Modify | Append a "Phase 2b — server-attached JS mode" section. |

Library files (`tokens/`, `components/`, original `templates/*/`, `crates/domi-server/`, `examples/`) are **untouched**. The two JS runtimes (`domi.js`, `domi-audit.js`) are modified in place — that's the point of 2b.

## Acceptance

2b is done when:

- `npm test` shows all existing tests pass + new server-mode tests pass.
- `tests/domi.test.js` covers: standalone (Phase 1), server mode click → POST shape, server mode input → POST shape, server mode `exportFeedback` shape.
- `tests/domi-audit.test.js` covers: standalone (Phase 1), server mode `addComment` → POST, server mode `resolveEntry`, server mode rehydration via `fetch` (mocked).
- `tests/wire-protocol.test.js` adds at least one example event with `id: null` and documents the server stamping rule.
- A manual smoke test in `examples/example-audit.html` (Phase 2c-β's shipped example) shows: standalone load → localStorage reads work; load with `__DOMI_SERVER__ = true` (fake-flag injection in a unit test) → `addComment` issues a POST rather than a localStorage write.
- Library invariant held.

## Risks and open questions

- **Event ordering on rehydration.** `domi-audit.js` in server mode reads `GET /api/events?doc=<doc>` and renders. ULIDs sort lexically by time, so the JS-rendered order matches the append order. **Documented as the algorithm in the runtime.**
- **No deduplication of localStorage mirror vs server state.** Phase 1 cache and server may diverge after a session. Acceptable per Q1=A — the boot mirror is best-effort.
- **WS bridge timing.** If `init()` runs before the WS opens (rare, since the shim is inline-blocking), the `domi-server-open` event will still arrive, but any code that reads from `domi-event` between init and open will miss events. The rehydration GET (`/api/events?doc=`) catches any events the WS missed. Acceptable.
- **Audit-rail entries with `author: 'user'` only.** Spec §AUDIT.md says `author: 'user | agent'`. The new server-mode doesn't add an agent-post path because that's an agent-side action, not a browser runtime responsibility. Deferred to 2d.
- **Server stamping **requires** `id` field on the JSONL.** If the server-side stamping path is buggy and events get written without IDs, downstream `GET /api/events?since=<ulid>` would fail silently. Mitigation: the Rust events writer validates that `id` is present before append (`EventWriter::write` checks). Tested in 2c-α.