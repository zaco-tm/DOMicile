# Audit Loop — How-To

The audit loop is the shape of any working-doc mode. It is how the agent and user iterate on UI/UX without the user having to leave the page.

## Loop

1. Agent writes `.domi/output/<name>.html` (a working doc) and seeds `.domi/state/<name>.json` with an empty thread.
2. User opens the file (Phase 1: `file://`).
3. User clicks an element with `data-feedback="<id>"` → domi-audit adds a comment in the rail and persists to localStorage (and to the file via the JSON mirror if running on the Phase 2 server).
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

## API exposed by `scripts/domi-audit.js`

When `<script src="scripts/domi-audit.js" defer>` is loaded, the global `DomiAudit` is available. Call order:

- `DomiAudit.mount({ statePath, docName })` — wires the rail, hydrates from `localStorage` under the key `dominice:<docName>`. The `statePath` argument is accepted and stored so a Phase 2 server-side mirror can hydrate from the JSON file; Phase 1 reads/writes only `localStorage`.
- `DomiAudit.addComment({ targetId, body })` — programmatic add; `domi-audit.js` invokes this on rail submits.
- `DomiAudit.export()` — returns the current entries as JSON for the agent to read.

The runtime does **not** require any server. The JSON mirror (under Phase 2) is a hot-reload hook only — `statePath` is reserved for it; today it is stored but not read or written.

## What the agent does

- Maintain `data-feedback` ids that don't drift across edits; rename consistently between versions.
- On read, do not delete resolved entries by default — the user may want history.
- When the user signals "ship it," produce a Deliverable-mode HTML: copy the working doc, strip the rail `<div data-domini-rail>`, the status chip, all `data-feedback` attributes, and the `<script src="domi-audit.js">` reference.

## When NOT to use the rail

- Pure read-only status pages (`status/STATUS.html` is one).
- Final deliverables.
- Anything where the user said "this is done, don't ask for more feedback."
