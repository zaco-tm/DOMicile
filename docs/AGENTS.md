# docs/AGENTS.md

Owner: Library docs under `docs/`.

## Safe zones

- Editing prose in `docs/{USAGE,DESIGN,STANDARDS,AUDIT,EXTENDING,
  LAYOUTS,WIRE-PROTOCOL,RUST}.md`.
- Adding a new `docs/<topic>.md` guide (preferred path under
  `docs/`, not deeper).
- Adding cross-references between docs (don't break links).

## Ask-first zones

- Editing anything under `docs/superpowers/specs/`,
  `.../plans/`, `.../handoffs/` — those are append-only trails.
- Renaming a doc (every external link to it breaks).

## Notes

- See root `AGENTS.md` for the global doc conventions.
- Wire protocol is canonically defined by
  `docs/schemas/event.schema.json`; the prose in
  `docs/WIRE-PROTOCOL.md` is the human-readable mirror.
