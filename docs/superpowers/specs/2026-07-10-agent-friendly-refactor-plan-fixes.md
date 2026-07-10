# Plan Fixes for agent-friendly refactor — Spec Addendum

**Date:** 2026-07-10
**Status:** Plan revision (commit-followups)
**Author:** Sisyphus (pre-flight re-read of plan against current source)
**Plan being fixed:** `docs/superpowers/plans/2026-07-10-agent-friendly-refactor.md` (`c0ecaa2`)

This addendum captures 5 plan corrections found by reading the actual
source state before any implementation began. Land before any plan
execution starts; fold changes into the main plan on next refresh.

---

## Fix 1 — Task 3 (split `crates/domi-server/src/http/handlers.rs`)

**The actual layout is already partly split.** The plan assumed
`http/handlers.rs` was the only file in the directory and proposed
creating `http/handlers/`. In reality, `http/` already contains:

```
http/args.rs       70 lines
http/handlers.rs  699 lines  ← the file to split
http/mod.rs       110 lines
http/router.rs     21 lines  ← router wiring already exists
http/state.rs     104 lines  ← AppState already extracted
http/ws.rs        163 lines  ← WebSocket already extracted
```

**Implication**: the plan's proposed `handlers/{mod,state,test_state,events,ws}.rs`
overlaps files that already exist. `state.rs` and `ws.rs` already live at
`http/state.rs` and `http/ws.rs`; the router wiring already lives at
`http/router.rs`.

**Corrected Task 3 (rewritten)**:

`http/handlers.rs` (699 lines) contains 5 route families:

| Lines (approx) | Route family | Destination |
|---:|---|---|
| ~18  | `banner`  (GET `/`)        | `http/handlers/banner.rs`   |
| ~6   | `healthz` (GET `/healthz`) | `http/handlers/healthz.rs`  |
| ~40  | `static_serve` (fallback GET)  | `http/handlers/static_serve.rs` |
| ~150 | `post_event` (POST `/api/events`)            | `http/handlers/events_post.rs` |
| ~150 | `get_events` (GET `/api/events` — GET chain) | `http/handlers/events_get.rs`  |
| ~150 | wire-protocol validation helpers (v==2, id stamp, ts stamp, target/rect normalization, ulid mint, event writer call) | split between events_post + events_get |
| rest | protocol docs / module-level constants | `http/handlers/mod.rs` |

**The split stays inside `http/handlers/`** (a sibling directory), keeping
the `crate::http::handlers::*` import path intact. New files:

```
crates/domi-server/src/http/handlers/
  mod.rs              # module docs + pub use re-exports — ~50 lines
  banner.rs           # pub async fn banner — ~25 lines
  healthz.rs          # pub async fn healthz — ~15 lines
  static_serve.rs     # pub async fn static_serve — ~50 lines
  events_post.rs      # pub async fn post_event + the helpers it's used by — ~200 lines
  events_get.rs       # pub async fn get_events + query helpers — ~200 lines
```

**Validation helper cross-cuts** post_event and get_events (e.g. ulid
minting, ts stamping, target/rect normalization). Per the splitting rule
("one primary owner per file"), if those helpers are ~80 lines and used
by both POST and GET, extract to `handlers/event_normalize.rs` (≤80
lines) and import from both. The plan's "test_state.rs" endpoint
**does not exist** — there is no `/test-state` route. Drop it.

The `http/router.rs` references `handlers::banner`, `handlers::healthz`,
`handlers::post_event`, `handlers::get_events`, `handlers::static_serve`.
Those names carry over verbatim — no signature change.

---

## Fix 2 — Task 2 (scripts split) undercounts cross-references

The plan said "find via rtk grep; update them." The actual cross-reference
footprint is **84 files**, of which the plan mentioned only 5
(`templates/`, `docs/`, root `AGENTS.md`, `package.json`,
`examples/`). The full cross-reference inventory:

### High-priority cross-refs (must update)

- `templates/{dashboard,webapp-shell,mobile-app-shell,admin-tool,pos-kiosk,working-doc}/index.html` (6 files)
- `templates/working-doc/README.md` (1 file)
- `examples/example-audit.html`, `examples/README.md` (2 files)
- `SKILL.md` (the skill itself references scripts)
- `tools/skill-smoke.mjs`, `tools/skill-smoke-server-test.mjs` (the
  smoke tests may literally import from `scripts/`)
- `crates/domi-server/build.rs` — the Rust build script that copies
  runtime files into target. MUST be updated or the binary won't ship
  the new layout.

### Test files (currently unmentioned)

- `tests/domi.test.js`
- `tests/domi-audit.test.js`
- `tests/domi-wire.test.js`
- `tests/domi-server-js.test.js`
- `tests/wire-protocol.test.js`

### Prose refs in agent-config / spec trail (low-priority but real)

- All `docs/superpowers/specs/2026-07-*.md` (11 phase specs) reference
  `scripts/domi*.js` and `scripts/verify*.sh`
- All `docs/superpowers/plans/2026-07-*.md` (10 phase plans)
- `docs/AUDIT.md`, `docs/WIRE-PROTOCOL.md`, `docs/USAGE.md`,
  `docs/RUST.md`, `docs/PHASE2-SCOPE.md`, `docs/EXTENDING.md`
- `docs/superpowers/handoffs/2026-07-06-phase*.md` (5 phase handoffs)
- `packages/react/README.md`, `packages/astro/README.md`

**Corrected Task 2 step 4**: enumerate ALL 84 files via
`rtk grep -l "scripts/(domi|install|verify)"` (matches files, not
lines) and update each. Suggest breaking into two commits:

- Commit A: high-priority + test files (`templates/`, `examples/`,
  `SKILL.md`, `tools/*.mjs`, `crates/domi-server/build.rs`,
  `tests/`). Run `npm test && cargo test --workspace` after this.
- Commit B: prose refs in `docs/`. These are documentation trail;
  they don't break tests, but they will surprise anyone reading the
  archived phase specs after the fact.

The plan's Task 2 was underspecified; this addendum makes it concrete.

---

## Fix 3 — Task 5 (split `primitives.test.tsx`) needs primitive inventory

The plan proposed `buttons / forms / feedback / layout` groups but
**never listed the 15 primitives** to confirm they group that way.
Before execution, read
`packages/react/src/primitives/<name>/index.tsx` (15 files) and
verify the grouping. Likely grouping per the rust crate
(`crates/domi-egui/src/` mirrors 1:1):

- **buttons**: button, badge, alert
- **forms**: input, select, checkbox, radio, form
- **feedback**: toast, modal, tooltip, tabs
- **layout**: card, table, nav

(Five-per-category is a guess; verify by reading the directory. If
the existing test bundle organizes them differently, follow the
existing organization rather than imposing a new one.)

**Corrected Task 5 step 1**: read the actual primitive inventory
*before* drafting the four file names. The split stays; only the
exact filenames move.

---

## Fix 4 — Task 6 (`prepush` won't fire)

The plan wrote:
```json
"prepush": "node tools/check-file-size.mjs"
```

**`prepush` is not a recognized npm lifecycle script.** npm honors
`prepublishOnly`, `prepare`, `prepublish`, and a handful of others,
but **`git push` is a git operation**, not an npm script. `prepush`
silently does nothing.

The correct options are:

1. **`preversion`** — fires on `npm version` (commits + tags + runs).
   Wrong for this case.
2. **`test` script** — runs on every `npm test`, which is the gate
   that gates CI. This is the right gate, but the plan already has
   `pretest` doing `--no-fail`.
3. **A real git hook** at `.git/hooks/pre-commit` invoking the
   script. Works, but git hooks aren't version-controlled.
4. **`husky`** or **`lefthook`** config — adds tooling, which the
   design spec explicitly excludes.

**Corrected Task 6 step 4**: drop `prepush`. Keep `pretest` (with
`--no-fail`, the existing shape). If a hard gate is wanted, the
right gate is making `npm test` itself run `check-file-size.mjs`
in `--strict` mode (fail if anything ≥500 lines, allowing only
the pre-split exceptions). Adjust:
```json
"pretest": "node tools/check-file-size.mjs --no-fail",
"test":    "...existing test command..."
```

The strict mode for CI: the workflow can call
`node tools/check-file-size.mjs` (no `--no-fail`) as its own step.
Document this in `tools/check-file-size.mjs`'s docblock:

```js
// CI: run `node tools/check-file-size.mjs` with no flags. Exit 1
// fails the build. Local: `npm test` uses --no-fail so dev loops
// stay green even if a pre-existing big file hasn't been split yet.
```

---

## Fix 5 — Task 9 (`tools/where-is.mjs`) field-shape assumptions

The plan wrote:
```js
const m = matches;
console.log(`- ${m.label || m.id} ... source=${m.source_file || '?'}`);
```

The real `graph.json` from this corpus has nodes with `file_type`
(`code` / `document` / `rationale` / `concept`), `label`, `id`,
`source_file`, but the wrapper assumed a `community` field on every
node. Real graphify output stores community membership in
`graph.communities` (a map `{ community_id: [node_id, ...] }`), NOT on
the node itself. The wrapper needs to look up community per-node via
the communities map, not assume `m.community` exists.

**Corrected Task 9 step 1**: replace `m.community ?? '?'` with a
lookup against `graph.communities`:

```js
const nodeComm = (nodeId) => {
  if (!graph.communities) return '?';
  for (const [cid, members] of Object.entries(graph.communities)) {
    if (Array.isArray(members) && members.includes(nodeId)) return cid;
  }
  return '?';
};
```

Same applies to the `community_labels` lookup — that's stored at the
graph root as `graph.community_labels: { '0': 'Audit Runtime', ... }`,
which the wrapper read correctly but indexed by string.

Tests should be updated to include the `communities` map in the
sample graph fixture (`SAMPLE_GRAPH` in step 2).

---

## Cross-cutting: the original inventory said 1 file over 500 lines

A second pass confirmed three file-size offenders, all addressed in
this addendum. The plan's structure for them is correct; only the
details (file names, where AppState lives) needed correction.

## Cross-cutting: workflow

The fixes above are surgical — the plan's overall structure
(12 tasks, one PR, fully reversible) stands. The execution-mode
choice and the spec sign-off from the user remain unchanged.

If the user approves the spec, the implementer reads this addendum
*before* Task 3, Task 5, or Task 6. Tasks 2, 7, 8, 10, 11, 12 are
unaffected.

---

## Self-review (spec coverage for THIS addendum)

| Original-plan issue | Fix here |
|---|---|
| Task 3 made up `test_state.rs` route + duplicated state.rs/ws.rs/router.rs | Fix 1 — corrected file inventory + 6 actual filenames |
| Task 2 said "find and update" generically | Fix 2 — concrete list of 84 files, split into 2 commits |
| Task 5 fabricated category list without reading source | Fix 3 — read primitive inventory first |
| Task 6 used non-existent `prepush` lifecycle script | Fix 4 — corrected lifecycle; documented CI gate |
| Task 9 used non-existent `community` field on nodes | Fix 5 — lookup against `graph.communities` |

All fixes are pre-execution. No code has been touched.
