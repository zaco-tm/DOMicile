# templates/working-doc/AGENTS.md

Owner: The audit-rail archetype (Phase 1.x).

## Safe zones

- Adding `data-feedback="..."` hooks on user-likely-to-comment
  elements.
- New status-chip variants (`v2`, `v3`, …).
- Mirroring comments to a new persistence mechanism (e.g. an
  IndexedDB shim alongside the existing localStorage path).

## Ask-first zones

- Changing the audit runtime itself
  (`scripts/runtime/domi-audit.js`) — that's a library invariant.
- Removing the rail entirely (the working-doc loop depends on it).

## Notes

- This archetype is what `.domi/output/<name>.html` should clone
  verbatim. Keep it small and grep-able.
- The HTML loads `scripts/runtime/domi-audit.js` (NOT
  `scripts/runtime/domi.js`) — the audit rail is the entry point
  for server-mode communication via `window.__DOMI_SERVER__`.
