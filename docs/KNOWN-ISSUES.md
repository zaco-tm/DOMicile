# Known issue — third-party skill install is half a skill

**Date logged:** 2026-07-13
**Status:** resolved (shipped via the skill-bundle-restructure change; see `docs/superpowers/specs/2026-07-13-skill-bundle-restructure-design.md` and the merge commit history)

## Summary (historical)

The `domicile` skill, when installed as a third-party Agent
Skills bundle, currently ships only `SKILL.md`. The skill prompt
references a runtime (`scripts/runtime/domi.js`,
`scripts/runtime/domi-audit.js`, and friends) that lives only in
the full repo checkout. A user who installs just the skill
gets a working prompt but a broken page:

- The agent emits a working doc to `.domi/output/<name>.html`.
- The HTML references `../../components/domi.css` and
  `../../scripts/runtime/domi-audit.js`.
- Both 404 at the install location (no library copy, no server).
- The audit rail doesn't render; `data-feedback` clicks do
  nothing.

## What works today

- **Developer mode** — clone the repo, run from a checkout.
  Everything works end-to-end.
- **Single-file prompt install** — agents read and follow the
  prompt. Useful for projects *within* the DOMicile repo.

## What doesn't work

- **Third-party install** — anyone installing the skill without
  cloning the repo (the documented install path for end users).

## Why it's deferred

The fix is a real restructure — move from a single-file skill
to a directory bundle, ship the runtime JS alongside `SKILL.md`,
update `INSTALL.md` table commands from `mkdir + cp` to
`mkdir + rsync`, and decide whether the server binary ships
separately (cargo install / Homebrew / GitHub release artifact).
That's a spec-sized change with cross-language implications.

The `INSTALL.md` honesty fix landed in the same commit so
readers aren't surprised; this file tracks the deeper cleanup.

## Suggested next steps (when picked up)

1. Brainstorm a single spec covering: directory layout, bundle
   contents, install command changes, server-binary distribution.
2. Plan the directory restructure as a multi-file diff (move
   `scripts/runtime/` into `domicile/skills/domicile/scripts/`,
   add `domicile/skills/domicile/SKILL.md`).
3. Update install paths in INSTALL.md and README.md to use the
   new shape.
4. Add a backwards-compat note for users who already have the
   single-file install.
5. Verify by performing a clean third-party install in a temp
   dir and confirming the audit rail renders.

## Resolution

This issue was closed by the skill-bundle-restructure change. The skill now ships as a generated directory (`domicile/domicile/`) that includes the prompt, the audit-rail runtime JS, the CSS, and one starter template. Install is `cp -R domicile/domicile <skills-dir>/domicile`. The build is reproducible from canonical sources via `tools/build-skill-bundle.sh` (idempotent), with a `--check` mode used by `npm run test:bundle` to catch drift.

Remaining follow-ups (not closed by this change; tracked elsewhere):

- Ship the Rust `domi-server` binary — still requires `cargo build --release` today.
- openskills universal-installer support — depends on openskills gaining native directory-bundle install.
- Pre-commit hook — not added; CI lint (via `pretest`) is the catch-all.
- Bundle the other 5 archetypes and the component primitives — out of this spec's scope.
