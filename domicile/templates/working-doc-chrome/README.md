# working-doc-chrome

The chrome half of a working doc. The rail, status chip, snap bar, drag handle, and iframe all live here. The iframe loads the body file (`<doc>-body.html`).

## What it ships with

- `index.html` — the template; clone it to `<doc>.html`.
- It loads `../../scripts/runtime/domi-audit.js` to mount the rail.
- It loads `../../scripts/runtime/domi-frame-bridge.js` to wire snap buttons, the drag handle, and the postMessage bridge.
- It wears the `studio` theme (`../../components/studio.css`) — bundoro's visual language in neo's color palette. The studio theme is fixed for the lifetime of the chrome; the user does not toggle it.

## What it does NOT ship with

- A body file. The agent (or the skill at clone time) creates `<doc>-body.html` from `templates/working-doc/`.
- A real-time server. The chrome works in both standalone (`file://`) and server-attached (`domi-server`) modes; same-origin only.
- A pre-populated feedback thread. The JSON file is seeded empty; the first comment creates the first entry.

## Same-origin requirement

The postMessage bridge reads `iframe.contentDocument` to enumerate `[data-feedback]` elements and to attach a delegated click listener. This requires the chrome and the body to share an origin. Both files are served from `.domi/output/` (standalone: `file://`; server: `http://127.0.0.1:<port>/`), so this is the case in both modes. Do not serve the chrome and body from different origins.
