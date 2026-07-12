# packages/react/AGENTS.md

Owner: `domicile-react` wrappers (Phase 3a). 15 components mirror
`components/primitives/<name>/`.

## Safe zones

- Under `src/primitives/<name>.tsx` (one component per file,
  one primitive per file).
- Adding or fixing tests in `tests/primitives/<category>.test.tsx`.

## Ask-first zones

- Updating `CSS-AUDIT.md` (the shared audit between React, Astro,
  egui wrappers).
- Bumping the React peer dep (currently `^18`).
- Adding a NEW primitive — the primitive must exist under
  `components/primitives/<name>/` first.

## Notes

- Build via `tsup`. Run before pushing:
  `cd packages/react && npm run build`.
- Tests split per category: `tests/primitives/{buttons,forms,
  feedback,layout,barrel}.test.tsx`. Add a new primitive by
  adding its describe block to the appropriate category file.
