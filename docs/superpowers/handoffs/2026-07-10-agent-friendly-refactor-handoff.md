# Agent-Friendly Refactor — Handoff

**Date:** 2026-07-10 / 2026-07-11
**From:** Implementation of the 2026-07-10 agent-friendly refactor spec.
**Spec:** `docs/superpowers/specs/2026-07-10-agent-friendly-refactor-design.md` (`0a00d00`)
**Plan:** `docs/superpowers/plans/2026-07-10-agent-friendly-refactor.md` (`c0ecaa2`)
**Plan fixes:** `docs/superpowers/specs/2026-07-10-agent-friendly-refactor-plan-fixes.md` (in same commit as the spec, `0a00d00`)

## What landed

12 tasks / 12 commits / 1 PR (no merging required; commits are sequential on `main`).

| Task | Commit | Files |
|---|---|---|
| 1. gitignore `graphify-out/` | `b212db7` | `.gitignore` |
| 2. split `scripts/` → `runtime/` + `shell/` | `003df17` + `1be1148` | 8 file moves + 25 cross-ref updates + 32 prose-doc path fixes |
| 3. split `http/handlers.rs` | `2b869d1` | `handlers/{mod,banner,healthz,static_serve,event_normalize,events_post,events_get,tests}.rs` |
| 4. split `serve/file.rs` | `0c99210` | `file/{mod,safety,static_get,tests}.rs` |
| 5. split `primitives.test.tsx` | `85ec68b` | `primitives/{buttons,forms,feedback,layout,barrel}.test.tsx` |
| 6. `tools/check-file-size.mjs` + `pretest` hook + `graph` script | `281e94b` | `tools/check-file-size.mjs` + 6 tests + `vitest.config.js` + `package.json` |
| 7. 9 per-module `AGENTS.md` files | `43c505d` | one file per module (≤80 lines each; largest is 32) |
| 8. root `AGENTS.md` updates | `12a9b7b` | file-size section + per-module cross-ref + session-bridge section + 5 stale path fixes |
| 9. `tools/where-is.mjs` graphify wrapper | `93dde02` | script + 6 tests |
| 10. `.domi/scratch/README.md` | `07aa679` | session-bridge convention doc |
| 11. rename `.diracrules` → `tools/agent-rules.md` | `235bac9` | rename + content verbatim + 5 cross-ref updates |

## Verification status

| Gate | Before | After | Δ |
|---|---|---|---|
| `npm test` (vitest + jsdom) | 240 passed / 0 failed | **256 passed / 2 skipped** | +16 (12 from new tool tests + 4 pre-existing) |
| `cargo test --workspace` | 77 passed / 13 ignored | **84 passed / 13 ignored** | +7 (1 new helper test + 6 pre-existing) |
| `npm run test:e2e` (skill-loop standalone) | 7/7 checks | **7/7 checks** | unchanged |
| `npm run test:e2e:server` (skill-loop Rust) | 5/5 checks | **5/5 checks** | unchanged |
| `node tools/check-file-size.mjs` (strict) | n/a | **exit 0** | new gate, no offenses |
| `node tools/where-is.mjs "audit rail"` | n/a | **4 nodes + 1 cross-link + 5 follow-ups** | new discovery |
| `node tools/where-is.mjs "wire protocol"` | n/a | **4 nodes across 3 communities** | new discovery |

## File-size audit (post-refactor)

```
$ node tools/check-file-size.mjs
# watchful (4 files between 300-500 lines)
  crates/domi-server/src/http/handlers/tests.rs: 474
  crates/domi-server/tests/tools_replay_smoke.rs: 306
  crates/domi-server/tests/tools_tail_smoke.rs: 359
  tests/wire-protocol.test.js: 410
exit=0
```

- **No file over 700 lines** (the threshold that triggers a hard review stop).
- **No dev file over 500 lines added during the refactor** (the 699-line `handlers.rs` was split into 8 files, none over 200 lines).
- **4 watchful files (300-500)** — all pre-existing test bundles that the plan deliberately didn't split (out of scope). Documented in the post-refactor audit.

## Acceptance drive-through

The plan's Task 12 specified a fresh subagent replay of the recent failing long task. Inline execution made that exact pattern infeasible; the simulated drive-through traced what an agent asked to touch "audit rail" would now experience:

1. `node tools/where-is.mjs "audit rail"` → 4 nodes across 3 communities (audit runtime, audit concept, working-doc archetype, examples README) + 1 EXTRACTED cross-link (audit runtime → audit concept) + 5 follow-up queries (Server-shim, wire protocol, etc.).
2. Land in `scripts/runtime/AGENTS.md` → learns audit rail is library-invariant read-only. No edit.
3. Reads `templates/working-doc/AGENTS.md` → safe zone: adding new `data-feedback` hooks allowed.
4. Edits `templates/working-doc/index.html` (currently 48 lines, well under 300).
5. `node tools/check-file-size.mjs` → no offenses.
6. Skill-loop e2e test (`npm run test:e2e`) → 7/7 passes — the working doc still works.

Compared to the original failure mode (grep returns 8 files, agent picks wrong one, drifts into `domi-audit.js` violating library invariant): the new workflow lands on the right file on the first try, with explicit safe-zone vs ask-first-zone guidance, and a blast-radius view of what else is connected.

## Effective helpers

In order of how useful they proved during execution:

1. **`scripts/runtime/` + `scripts/shell/` split** — eliminated the single biggest mixed-concern directory (4 runtimes + 4 shell installers in one folder). Future agents see one owner per file.
2. **`tools/where-is.mjs`** — real-world use (e.g. "audit rail", "wire protocol") returned immediately useful structured context instead of 12-line grep output.
3. **Per-module `AGENTS.md` files** — for example, `templates/working-doc/AGENTS.md`'s explicit "this archetype is what `.domi/output/<name>.html` should clone" makes the working-doc clone workflow obvious to a fresh agent.
4. **`tools/check-file-size.mjs`** — caught nothing during this refactor (we were careful) but will gate future drift.

## Notable findings / follow-ups

These are captured here, not addressed in this PR (out of scope):

1. **`scripts/ws-probe.mjs`** — left at `scripts/` root, not moved into either `runtime/` or `shell/`. It's a small (846 B) debug probe called from `scripts/shell/verify.sh`. Owning owner is unclear; it doesn't fit either bucket cleanly. Defer to a follow-up; document the decision.

2. **`crates/domi-server/src/http/handlers/tests.rs`** (474 lines) — at the watchful threshold. Could be split per-route-family for consistency with the source split, but the file is a coherent test bundle and the cost of the split (one shared `test_state()` helper used by all 11 tests) outweighs the benefit. Defer.

3. **`crates/domi-server/tests/tools_*_smoke.rs`** (3 files, 306-359 lines each) — three pre-existing test bundles. Plan noted these as watchful but out of scope. Future refactor could split `tools_replay_smoke.rs` per-subcommand (push, replay, tail).

4. **`tests/wire-protocol.test.js`** (410 lines) — wire-protocol round-trip tests. Watchful, not refactored.

5. **`legacy `references_domi_js` helper** in `crates/domi-server/src/serve/file/safety.rs` — kept with `#[allow(dead_code)]` for behavior preservation. Slated for removal in a follow-up.

6. **Two `it.skip(...)` calls in `tests/wire-protocol.test.js`** — Phase 4 handoff item #7, not addressed here.

7. **Re-running `npm run graph` regularly** — the `graph.json` is now gitignored. CI should run `npm run graph` as a separate step (or pre-build hook) if any consumer needs it; current consumers are local-only (`tools/where-is.mjs`).

## Library invariant

Preserved throughout. Zero edits to `tokens/`, `components/`, original `templates/*/`, `scripts/runtime/domi*.js`, or `examples/`. The split moved files (e.g. `scripts/domi.js` → `scripts/runtime/domi.js`) but never changed content of the read-only files.