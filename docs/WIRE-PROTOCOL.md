# DOMicile Wire Protocol — v2 Reference

This is the protocol v2 contract. Consumers: the server-attached JS mode (`scripts/runtime/domi-audit.js`), the `domi-server` binary, and the agent-side `domi` CLI.

## Version

Protocol version: **2**. Every event carries `"v": 2`. The server prints the protocol version on `GET /` as `{ name, version, protocol: 2 }`.

If you read a `v` other than `2`, branch. Older (`v: 1`) events came from legacy `domi.js` — the server rotates those on first read.

## Event payload

```json
{
  "v": 2,
  "id": "01J8XZQ5K2J9Z9Q4X5Y6Z7X8Y1",
  "ts": "2026-07-05T18:21:00.000Z",
  "src": "domi.js | domi-audit.js | browser-ext | domi-server | domi | unknown",
  "doc": "<docName>",
  "kind": "click | input | submit | rail-add | rail-resolve | custom | agent-iterating",
  "target": {
    "id": "data-feedback attribute, or null",
    "selector": "CSS selector path, or null",
    "rect": { "x": 120, "y": 480, "w": 200, "h": 32 }
  },
  "data": { /* kind-specific, see below */ }
}
```

`id` is a ULID. ULIDs are 26-char Crockford base-32, lexicographically sortable by time. Use a battle-tested ULID library; do not hand-roll.

### `data` shapes by `kind`

| `kind` | `data` |
|---|---|
| `click` | `{ value?: any }` (textContent or attribute value, optional) |
| `input` | `{ name: string, value: string }` |
| `submit` | `{ formId: string, fields: { [name]: value } }` |
| `rail-add` | `{ body: string, targetId: string \| null }` |
| `rail-resolve` | `{ entryId: ULID }` |
| `rail-remove` | `{ entryId: ULID }` |
| `custom` | `{ payload: any }` |
| `agent-iterating` | `{ state: "start" \| "end", source: "watcher" \| "explicit" }` |

**`rail-remove`** is a soft delete: the event is appended to `events.jsonl` but the audit runtime hides the entry from the rail. The audit trail is preserved. The `entryId` references a prior `rail-add` (or other rail event with a body). The runtime treats `rail-remove` as idempotent and silently ignores unknown or already-removed `entryId`s.

Anything else is a server error — the server rejects with `400`.

## Two delivery channels, one payload

The same event JSON reaches the agent via either of:

- **File:** `.domi/state/events.jsonl` (project-level, NDJSON, append-only).
- **WebSocket:** `ws://localhost:PORT/ws/events`.

Consumers pick one or both. The server's contract is identical for both — neither channel is "more canonical." If they ever disagree (e.g., crash between append and broadcast), the file is the source of truth at restart; the WS client re-syncs via `GET /api/events?since=<last-seen-id>`.

### Agent-iteration status

`agent-iterating` events signal that an agent (human or LLM) is mid-edit on a doc. They are emitted by:

- **Watcher (`source: "watcher"`)** — `domi-server` watches `.domi/output/**/*.html` and broadcasts a `start` event on first modify, an `end` event after `--iter-quiescence-ms` of quiet (default 1500ms), or a forced `end` after `--iter-max-duration-ms` (default 30000ms).
- **Explicit CLI (`source: "explicit"`)** — agents can post `domi push --type agent-iterating --state <start|end> --doc <name>` to extend or close the in-flight window without touching a file (planning phase, web fetch, etc.).

Clients ignore `agent-iterating` events for docs they are not viewing. Pages that load after a `start` event has already been emitted do NOT receive a backfill — the modal stays hidden until the next watcher activity (matches the existing v=2 contract: events are not backfilled to late-joining clients).

## HTTP routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Protocol banner: `{ name: "domi-server", version, protocol: 2 }` |
| `GET` | `/<path>` | Serve files from the watched output dir. Inlines the `domi-server.js` shim as a **blocking script** before the first `<script>` tag in HTML responses whose `src` resolves to a `domi.js` file. The shim lives at `scripts/runtime/domi-server.js` and constructs its WebSocket URL from `window.location.host` (same-origin); no per-request host injection. |
| `POST` | `/api/events` | Accept a single event JSON. Append + broadcast. Returns `204`. |
| `GET` | `/api/events?since=<ULID>&doc=<name>&limit=<n>` | Read events strictly after `<ULID>`. `limit` default 100, max 1000. Response: `{ events: [Event], nextSince: ULID \| null }`. |
| `GET` | `/ws/events` | WebSocket push. Server sends `{ type: "hello", v: 2, serverId }` on connect, then wraps each event as `{ type: "event", event: <Event> }`. |

### CLI usage (`domi` binary)

The same routes are exercised by the agent-side `domi` CLI (lives in `crates/domi-server/src/tools/`). All three subcommands default to `--server http://127.0.0.1:4173` and emit the same JSON shapes described above.

```bash
# Stream live events as JSONL (Ctrl-C to stop)
domi tail --server http://127.0.0.1:4173 --follow --limit 50

# One-shot fetch of recent events for a doc, since a known ULID
domi replay --server http://127.0.0.1:4173 --doc dashboard --since 01J8XZQ5K2J9Z9Q4X5Y6Z7X8Y1 --limit 100

# POST a synthetic click event (server stamps id/ts on missing fields)
domi push --server http://127.0.0.1:4173 \
  --type click --doc dashboard \
  --target "[data-feedback='save']" \
--json '{"v":2,"id":null,"ts":null,"src":"browser-ext","doc":"dashboard","kind":"click","target":{"id":"button.ok","selector":null,"rect":{"x":0.0,"y":0.0,"w":0.0,"h":0.0}},"data":{"value":"Save"}}'
```

`POST /api/events` validates the body against the schema (`docs/schemas/event.schema.json`). Reject anything missing required fields or with a non-`2` `v`. The server is allowed to reject in either direction; the agent's reader keeps the file as the durable copy.

**`id` stamping rule:** clients MAY omit `id` (or send `null`) when posting; the **server MUST stamp a fresh ULID before append**. The schema's `id` field stays required — the server enforces it. JS clients use this to avoid carrying a ULID library; they delegate ID generation to the server.

## WebSocket protocol summary

Connection lifecycle:

1. Client opens `ws://HOST:PORT/ws/events`.
2. Server sends `{"type":"hello","v":2,"serverId":"<ULID>","debounceMs":<N>}`. `debounceMs` is the file-change debounce window the server is currently using (default 200 ms) — informational, for future "reloading in…" UI.
3. Client sends `{"type":"subscribe","path":"/<open-path>"}` once to declare the URL the tab is viewing. The server uses this to filter `MatchingPath` reloads to the right tabs. Clients that never send `subscribe` still receive `AllTabs` reloads.
4. Server forwards each new event as `{"type":"event","event":<Event>}`.
5. When a watched file changes, server sends `{"type":"reload","path":"<rel>","target":"path"|"all"}`. Clients MUST call `location.reload()` on receipt. `target` is `"path"` if the server sent it because the changed file's relative path matched this tab's subscribed URL (HTML change → only matching tabs reload). `target` is `"all"` if the server sent it to every tab because the change is a shared asset (CSS/JS/image → every tab reloads). `path` is the changed file's path relative to the served root, for debugging/logging.
6. Server pings with `{"type":"ping"}` every 30 seconds. Client may pong; absence is logged `warn`.
7. Server closes on shutdown. Client reconnects with backoff, then calls `GET /api/events?since=<last-id>` to re-sync.

Future message types (e.g., `pong`) MAY be added in later server versions. Clients MUST ignore unknown message types.

## JSONL file conventions

- Encoding: UTF-8.
- One event per line. No leading `[`, no trailing `,`, no wrapping.
- Lines are valid JSON objects terminated by `\n`.
- The file always ends with `\n`.
- The server opens with `O_APPEND` semantics.
- The server rotates the file when it exceeds the size cap (default 50 MB) or once per UTC day, whichever comes first. Rotated files are named `events-<UTC-timestamp>.jsonl` and kept indefinitely.

Backward-compat with legacy `v: 1` events: if the existing `events.jsonl`'s first line has a `v` other than `2`, the server rotates that file before appending. Legacy entries from older `domi.js` use a shape with `id`, `selector`, `text` fields and no `v` — the server does NOT try to migrate them; rotation preserves them untouched.

## Privacy

`target.rect` exposes pixel coordinates of the interacted element. The protocol is local-only; the server binds `localhost` and is not reachable from the network. Do not change this without revising the spec.

## Schema source

The machine-readable JSON Schema lives at `docs/schemas/event.schema.json`. The wire protocol's prose and the schema are kept in sync — drift between the two is a wire-protocol doc bug.
