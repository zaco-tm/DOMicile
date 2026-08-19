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

The body is a working doc during iteration, not a deliverable yet. When the user says "ship it," strip the annotation chrome first.

The canonical strip procedure (works in any install — including `npx skills`, which doesn't carry `tools/`) lives in **`domicile/SKILL.md` §"Ship mode — strip the body"**. That section gives the three patterns to remove, what stays, and the destination filename convention. Read it before stripping.

For repo users, `tools/strip-annotations.mjs` does the same three transforms in one command:

```bash
node tools/strip-annotations.mjs .domi/output/<name>-body.html
# writes .domi/output/<name>-body.shipped.html
node tools/strip-annotations.mjs .domi/output/<name>-body.html --in-place
node tools/strip-annotations.mjs .domi/output/<name>-body.html --dry-run
```

What the strip removes:

- All `data-feedback="..."` attributes (per-element comment targets).
- The `[data-feedback]` and `[data-feedback]:hover` CSS rules in the inline `<style>` block (the dashed outline + copy cursor).
- The `<script src="...domi.js">` reference (the click-feedback runtime that logs `[data-feedback]` clicks to the audit thread).

What stays:

- The `data-theme` attribute on `<html>` (the body theme).
- The `domi.css` link (the design system CSS).
- All `domi-*` classes (the design system primitives).
- Any other CSS the body file owns (e.g. `body { margin: 0; padding: 24px; }`).
- The body's own `domi.js`-free form logic if it has any.

Flags:

```bash
node tools/strip-annotations.mjs <input> --in-place   # overwrite the input
node tools/strip-annotations.mjs <input> --out <path> # write to a specific path
node tools/strip-annotations.mjs <input> --dry-run    # print to stdout, no file
```

## See also

- `../working-doc-chrome/README.md` — the chrome half.
- `../../../docs/superpowers/specs/2026-08-17-studio-frame-design.md` — the full design.
- `../../../docs/AUDIT.md` — the audit loop, JSON schema, and domi-audit API.
