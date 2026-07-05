# DOMiNice Wire Protocol — Phase 2 Reference

This is the 2a contract. Consumers: Phase 2b (server-attached JS mode), 2c (Rust server), 2d (agent reader).

## Version

Protocol version: **2**. Every event carries `"v": 2`. The server prints the protocol version on `GET /` as `{ name, version, protocol: 2 }`.

If you read a `v` other than `2`, branch. Older (`v: 1`) events came from Phase 1's `domi.js` — the server rotates those on first read.

## Event payload

```json
{
  "v": 2,
  "id": "01J8XZQ5K2J9Z9Q4X5Y6Z7X8Y1",
  "ts": "2026-07-05T18:21:00.000Z",
  "src": "domi.js | domi-audit.js | browser-ext | unknown",
  "doc": "<docName>",
  "kind": "click | input | submit | rail-add | rail-resolve | custom",
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
| `custom` | `{ payload: any }` |

Anything else is a server error — the server rejects with `400`.

## Two delivery channels, one payload

The same event JSON reaches the agent via either of:

- **File:** `.domi/state/events.jsonl` (project-level, NDJSON, append-only).
- **WebSocket:** `ws://localhost:PORT/ws/events`.

Consumers pick one or both. The server's contract is identical for both — neither channel is "more canonical." If they ever disagree (e.g., crash between append and broadcast), the file is the source of truth at restart; the WS client re-syncs via `GET /api/events?since=<last-seen-id>`.

## HTTP routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Protocol banner: `{ name: "domi-server", version, protocol: 2 }` |
| `GET` | `/<path>` | Serve files from the watched output dir. Inlines `domi-server.js` shim into HTML responses that include `<script src="...domi.js">`. |
| `POST` | `/api/events` | Accept a single event JSON. Append + broadcast. Returns `204`. |
| `GET` | `/api/events?since=<ULID>&doc=<name>&limit=<n>` | Read events strictly after `<ULID>`. `limit` default 100, max 1000. Response: `{ events: [Event], nextSince: ULID \| null }`. |
| `GET` | `/ws/events` | WebSocket push. Server sends `{ type: "hello", v: 2, serverId }` on connect, then wraps each event as `{ type: "event", event: <Event> }`. |

`POST /api/events` validates the body against the schema (`docs/schemas/event.schema.json`). Reject anything missing required fields or with a non-`2` `v`. The server is allowed to reject in either direction; the agent's reader (2d) keeps the file as the durable copy.

## WebSocket protocol summary

Connection lifecycle:

1. Client opens `ws://HOST:PORT/ws/events`.
2. Server sends `{"type":"hello","v":2,"serverId":"<ULID>"}`.
3. Server forwards each new event as `{"type":"event","event":<Event>}`.
4. Server pings with `{"type":"ping"}` every 30 seconds. Client may pong; absence is logged `warn`.
5. Server closes on shutdown. Client reconnects with backoff, then calls `GET /api/events?since=<last-id>` to re-sync.

Future message types (e.g., `subscribe`, `pong`) MAY be added in 2c. Clients MUST ignore unknown message types.

## JSONL file conventions

- Encoding: UTF-8.
- One event per line. No leading `[`, no trailing `,`, no wrapping.
- Lines are valid JSON objects terminated by `\n`.
- The file always ends with `\n`.
- The server opens with `O_APPEND` semantics.
- The server rotates the file when it exceeds the size cap (default 50 MB) or once per UTC day, whichever comes first. Rotated files are named `events-<UTC-timestamp>.jsonl` and kept indefinitely.

Backward-compat with Phase 1: if the existing `events.jsonl`'s first line has a `v` other than `2`, the server rotates that file before appending. Phase 1 entries from `domi.js` use a shape with `id`, `selector`, `text` fields and no `v` — the server does NOT try to migrate them; rotation preserves them untouched.

## Privacy

`target.rect` exposes pixel coordinates of the interacted element. The protocol is local-only; the server binds `localhost` and is not reachable from the network. Do not change this without revising the spec.

## Schema source

The machine-readable JSON Schema lives at `docs/schemas/event.schema.json`. The wire protocol's prose and the schema are kept in sync — drift between the two is a 2a doc bug.
