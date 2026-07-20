# scripts/runtime/AGENTS.md

Owner: Phase 1 + Phase 2 client runtimes (`domi.js`, `domi-audit.js`,
`domi-wire.js`, `domi-server.js`, `domi-status.js`).

## Library invariant (read-only by default)

The files in this directory are part of the design-system library
invariant (root `AGENTS.md`). NEVER edit without explicit user
sign-off in the session.

**Exception:** `domi-status.js` is **library-adjacent**, not library-invariant.
It is owned by the iter-modal feature, embedded into the Rust binary at
compile time, and injected by the server shim. Edits follow the same
review discipline but do not require explicit user sign-off in-session.

## Safe zones

- (none)

## Ask-first zones

- Any file in this directory except `domi-status.js` (see above).

## Notes

- These files are loaded by working-doc artifacts under
  `templates/working-doc/` and any clone under `.domi/output/<name>.html`.
- Cross-language drift: `domi-wire.js` mirrors
  `crates/domi-server/src/serve/wire_events.rs` semantics. Edit
  both ends if you touch either.
- `domi-server.js` is the shim that `crates/domi-server/build.rs`
  embeds into the Rust binary at compile time.
- `domi-status.js` (added 2026-07-20) is the iter-modal runtime: it
  listens for `agent-iterating` events on `domi-event` and toggles a
  dismissable "Iterating…" modal + status-chip spinner. See
  `docs/superpowers/specs/2026-07-20-iterating-modal-design.md`.
