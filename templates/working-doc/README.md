# Working Doc Archetype

A working doc is a working-doc-mode artifact: feedback rail, status chip, and `data-feedback` hooks on the elements the user is likely to comment on.

Use this archetype when the user says "let's work on X," "review this," or anywhere a working doc is appropriate (see `../../domicile/SKILL.md` for the mode-choosing rules).

## What it ships with

- `index.html` — the template; clone it.
- It loads `../../scripts/runtime/domi-audit.js` to mount the rail.
- It expects `.domi/state/<docName>.json` to be writable; in Phase 1, `domi-audit.js` mirrors to `localStorage`.
- It wears the neo skin via `../../components/domi.css`.

## What it does NOT ship with

- A real-time server (Phase 2).
- A pre-populated feedback thread. The JSON file is seeded empty; the first comment creates the first entry.
