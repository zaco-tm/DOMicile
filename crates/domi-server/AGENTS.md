# crates/domi-server/AGENTS.md

Owner: `domi-server` HTTP binary + `domi` agent CLI.

## Safe zones

- Under `src/{events,serve,http,tools}/` files that are UNDER their
  per-file size threshold (run `node tools/check-file-size.mjs`).
- Adding a new subcommand under `src/tools/`.

## Ask-first zones

- Editing `src/main.rs` (binary entry; semantic changes ripple to
  every CLI invocation).
- Changing `Cargo.toml` dependencies.
- Bumping MSRV in `rust-toolchain.toml`.

## Cross-language drift

- `src/events/event.rs` ↔ `tests/wire-protocol.test.js` — protocol
  shape must match in both. Edit both ends if you change either.

## Per-file ownership

The `src/http/handlers/`, `src/serve/file/`, and `src/events/event_*`
patterns (split per route / per concern) are mandatory. Do NOT
inline a multi-route handler file back into a single `mod.rs`.

The `tests/` directory contains 6 test files (4 skill-loop tool
smoke + 1 binary smoke + 1 common helper). They are not split
further (Task 6 noted the 300+ line bundles as watchful but
not in scope for this refactor).
