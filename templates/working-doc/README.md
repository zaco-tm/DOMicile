# working-doc (body template)

The body half of a working doc. The artifact that the agent is iterating on. Loads into the chrome (`templates/working-doc-chrome/`) inside an iframe.

## What it ships with

- `index.html` — the template; clone it to `<doc>-body.html`.
- It wears the chosen body theme (neo or bundoro) via the `data-theme` attribute on the root `<html>` element. The theme is fixed for the lifetime of the body.
- It carries `data-feedback="..."` attributes on user-likely-to-comment elements. The chrome's postMessage bridge reads them.

## What it does NOT ship with

- The rail (`<aside data-domini-rail>`) — that's in the chrome.
- The status chip — that's in the chrome.
- The `domi-audit.js` / `domi-audit-render.js` scripts — those are in the chrome.
- The `DomiAudit` global. The body has no audit thread of its own; comments live in the chrome's audit thread.

## Ship mode

When the user says "ship it," take `<doc>-body.html` and rename or copy it to the destination filename. No strip step. The body is already clean.

## See also

- `../working-doc-chrome/README.md` — the chrome half.
- `../../../docs/superpowers/specs/2026-08-17-studio-frame-design.md` — the full design.
