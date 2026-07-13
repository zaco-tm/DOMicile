# Usage — DOMicile

For humans and AI agents who want to author DOMicile HTML artifacts.

## Quickstart

```bash
git clone https://github.com/zaco-tm/DOMicile.git
cd DOMicile
npm install
```

Open any `templates/<archetype>/index.html` in a browser. No server needed.

## Authoring a new artifact

1. Pick the closest archetype (`templates/<name>/`).
2. Copy its `index.html` to your working location.
3. Replace placeholder content with real data.
4. Use only DOMicile primitives (`components/primitives/<name>/README.md`).
5. For feedback capture: add `data-feedback="<id>"` to interactive elements, include `<script src="../../scripts/runtime/domi.js"></script>`, and add `<button data-export-feedback>Export feedback</button>` so the user can download `events.jsonl`.

## Adding a new primitive

1. Create `components/primitives/<name>/` with `<name>.html` (canonical snippet), `<name>.css`, `demo.html`, `README.md`.
2. Append `<name>.css` contents to `components/domi.css`.
3. Add a test at `tests/primitives/<name>.test.js`.
4. Update `tokens.json` if the primitive introduces new tokens.

## Reading feedback events

In standalone mode: user clicks "Export feedback" → downloads `events.jsonl` → paste back to the agent.

In server-attached mode: `domi-server` writes to `.domi/state/events.jsonl` and pushes via WebSocket. The agent subscribes.

Event schema:

```json
{"type":"click","selector":"apply","ts":"2026-07-05T16:43:22Z","page":"dashboard","tag":"button","text":"Apply"}
{"type":"input","name":"projectName","value":"Acme Co","ts":"2026-07-05T16:43:25Z","page":"dashboard"}
```
