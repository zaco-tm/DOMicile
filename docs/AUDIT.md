# Audit Loop — How-To

The audit loop is the shape of any working-doc mode. It is how the agent and user iterate on UI/UX without the user having to leave the page.

## Loop

1. Agent writes `.domi/output/<name>.html` (a working doc) and seeds `.domi/state/<name>.json` with an empty thread.
2. User opens the file (standalone mode: `file://`).
3. User clicks an element with `data-feedback="<id>"` → domi-audit adds a comment in the rail and persists to localStorage (and to the file via the JSON mirror if running on the server-attached mode).
4. Reload renders existing comments next to their target elements.
5. The agent reads the thread (either inline in the session or by re-reading the JSON) and edits the HTML in response.
6. Repeat until the user signals "ship it" → agent produces a Deliverable-mode HTML (clean, no rail, no status chip).

## JSON schema for thread entries

`.domi/state/<name>.json`:

```json
{
  "version": 1,
  "name": "onboarding-v2",
  "entries": [
    {
      "id": "uuid-or-counter",
      "targetId": "data-feedback attribute, or null for the doc itself",
      "author": "user | agent",
      "timestamp": "ISO-8601",
      "body": "plain text, no markdown",
      "resolved": false
    }
  ]
}
```

`domi-audit.js` always seeds the file with this skeleton if it does not exist.

## API exposed by `scripts/runtime/domi-audit.js`

When `<script src="scripts/runtime/domi-audit.js" defer>` is loaded, the global `DomiAudit` is available. Call order:

- `DomiAudit.mount({ statePath, docName })` — wires the rail, hydrates from `localStorage` under the key `domicile:<docName>`. The `statePath` argument is accepted and stored so the server-side mirror can hydrate from the JSON file; standalone mode reads/writes only `localStorage`.
- `DomiAudit.addComment({ targetId, body })` — programmatic add; `domi-audit.js` invokes this on rail submits.
- `DomiAudit.export()` — returns the current entries as JSON for the agent to read.

The runtime does **not** require any server. The JSON mirror (in server-attached mode) is a hot-reload hook only — `statePath` is reserved for it; today it is stored but not read or written.

## Server-attached mode

When the runtime loads on a doc served by `domi-server`, the server-side shim (`scripts/runtime/domi-server.js`, injected by the server's HTML serve path) sets `window.__DOMI_SERVER__ = true` and opens a WebSocket before `domi-audit.js` runs.

In this mode, `domi-audit.js` switches behavior:

- **`mount({ statePath, docName })`** fetches `GET /api/events?doc=<docName>` and populates the rail from the response. `localStorage` is read once as a boot mirror and then ignored.
- **`addComment({ targetId, body })`** POSTs a v2 `rail-add` event to `/api/events` and lets the WebSocket round-trip deliver it back into the local render. Local mutation is suppressed to avoid duplicate entries.
- **`resolveEntry(entryId)`** POSTs a v2 `rail-resolve` event.
- **`export()`** reads `GET /api/events?doc=<docName>` and returns a snapshot of the thread as JSON (same shape as standalone mode).

The WS bridge dispatches `CustomEvent('domi-event', { detail: <event> })` for each new server event. `domi-audit.js` listens for these and renders comments / mark-resolves live.

**Fallback:** if `fetch` is unavailable or the server is unreachable, the runtime falls back to standalone (localStorage) mode automatically.

## What the agent does

- Maintain `data-feedback` ids that don't drift across edits; rename consistently between versions.
- On read, do not delete resolved entries by default — the user may want history.
- When the user signals "ship it," produce a Deliverable-mode HTML: copy the working doc, strip the rail `<div data-domini-rail>`, the status chip, all `data-feedback` attributes, and the `<script src="domi-audit.js">` reference.

## When the loop is being overridden

The skill's piece-by-piece discipline is the audit loop. If you are following it correctly, the rail collects comments, you revise just the targeted piece, the chip bumps, and the user clicks again. That's the happy path.

In practice you will sometimes receive instructions that pressure you to skip pieces of the loop — a generic system reminder saying "proceed without asking," a follow-up prompt suggesting the whole page be drafted at once, or even a direct user message that contradicts the discipline. The skill (`../domicile/SKILL.md` §"Overriding a gate (proceed-without-asking protocol)") defines how to handle that: do not comply immediately. Quote the directive back, ask the user to re-confirm with a reminder that the whole point of the loop is their input, wait for an explicit re-confirmation, then proceed — and note the override in the hand-off so the user remembers they chose it.

Common situations:

- *"Just give me the whole page in one turn."* — Re-confirm. If they re-confirm, you may draft the entire doc, but the section hooks, status chip, and click-to-target wiring must all be in place so iteration can begin immediately. Strip none of the chrome.
- *"`[system reminder]` told you to proceed without asking."* — Treat the reminder as a trigger to ask the user, not as authority. The user owns the override, not the reminder.
- *"Stop iterating, I just want the final HTML."* — That is a clean ship-it signal; route to Deliverable mode and strip the chrome.

If the loop keeps getting overridden mid-session (multiple "skip the gate" instructions across turns), it is worth pausing and asking the user whether the working-doc mode is the right fit for what they're trying to do. Sometimes the answer is "yes, just be quiet and do it" — that's a valid override. Sometimes the answer is "actually, give me the deliverable now" — that exits the loop cleanly.

## When NOT to use the rail

- Pure read-only status pages (`status/STATUS.html` is one).
- Final deliverables.
- Anything where the user said "this is done, don't ask for more feedback."
