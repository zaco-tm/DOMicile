# scripts/shell/AGENTS.md

Owner: bash installers + skill-loop runners.

## Safe zones

- Adding a new top-level helper (e.g. `cleanup-scratch.sh`) — keep
  it idempotent and POSIX-sh friendly.
- Bug fixes inside existing `.sh` scripts (preserve the existing
  exit-code contract).

## Ask-first zones

- Structural rewrites that change CI semantics (the existing
  scripts are wired into `npm run test:e2e` and the GitHub Actions
  matrix).
- Renaming or removing an existing `.sh` file — every reference
  must be updated atomically.
- `install.sh` is the user-facing installer; it copies binaries
  into `~/.local/bin` on a real system.

## Notes

- All scripts in this directory use `set -eu` (or should).
- Verify with `shellcheck` before pushing if available:
  `shellcheck scripts/shell/*.sh`.
- The verify-skill-loop scripts invoke `tools/skill-smoke*.mjs`
  which spawns the Rust binary (when applicable).
