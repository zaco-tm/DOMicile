# scripts/runtime/AGENTS.md

Owner: Phase 1 + Phase 2 client runtimes (`domi.js`, `domi-audit.js`,
`domi-wire.js`, `domi-server.js`).

## Library invariant (read-only by default)

The files in this directory are part of the design-system library
invariant (root `AGENTS.md`). NEVER edit without explicit user
sign-off in the session.

## Safe zones

- (none)

## Ask-first zones

- Any file in this directory.

## Notes

- These files are loaded by working-doc artifacts under
  `templates/working-doc/` and any clone under `.domi/output/<name>.html`.
- Cross-language drift: `domi-wire.js` mirrors
  `crates/domi-server/src/serve/wire_events.rs` semantics. Edit
  both ends if you touch either.
- `domi-server.js` is the shim that `crates/domi-server/build.rs`
  embeds into the Rust binary at compile time.
