# packages/astro/AGENTS.md

Owner: `@domi/astro` wrappers (Phase 3b). 15 components.

## Safe zones

- Under `src/components/<name>.astro` (one component per file).
- Adding tests in `tests/` (parser-first; `experimental_AstroContainer`
  is unstable in the current toolchain).

## Ask-first zones

- Structural changes to hydration-control wrappers (the
  `client:` directives are load-bearing for the Astro integration).
- Bumping the Astro peer dep.

## Notes

- Static-analysis tests in `tests/parser.ts` ship today. If
  Astro 6 ships a working `astro test` subcommand, the swap is
  mechanical.
