# DOMiNice Examples

Each example is a self-contained HTML file you can open with `file://` to see the pattern in action.

## `example-audit.html`

A working-doc-mode artifact with the feedback rail wired up. It loads `../templates/working-doc/index.html`'s structure and `../scripts/domi-audit.js`.

Open it, type in the rail, reload — the comment persists via `localStorage` under `dominice:example-audit`.

In a real workflow the agent produces similar files in `.domi/output/<name>.html` in the user's project; this example just lives in the repo so you can see how the pieces fit.
