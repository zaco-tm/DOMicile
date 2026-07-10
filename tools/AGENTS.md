# tools/AGENTS.md

Owner: Node tooling (`skill-smoke*.mjs`, `tokens-to-css.mjs`,
`smoke.mjs`, `check-file-size.mjs`, `where-is.mjs`, `agent-rules.md`).

## Safe zones

- New tools (Node scripts that follow the existing `*.mjs`
  convention and exit non-zero on failure).
- Bug fixes inside existing tools.
- Adding ports / flags / new `--doc` arguments to
  `skill-smoke*.mjs`.
- Adding test coverage under `tools/tests/`.

## Ask-first zones

- Structural rewrites that change how the skill loop is wired
  (the existing tools are exercised from Phase 4).
- The check-file-size thresholds (codified in
  `tools/agent-rules.md`; only changeable via spec).
- `tools/agent-rules.md` itself (project-level agent config —
  rename or restructure requires a spec).

## Notes

- All `tools/*.mjs` are ESM (`import` / `export`). Tests live at
  `tools/tests/<script>.test.mjs` and are picked up by Vitest from
  the root config.
- The check-file-size script enforces the 300/500/700 thresholds
  defined in the agent-friendly refactor spec; see the script's
  docblock for exit-code semantics.
