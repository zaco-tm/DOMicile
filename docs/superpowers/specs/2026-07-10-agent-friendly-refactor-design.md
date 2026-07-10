# Agent-Friendly Refactor — Design Spec

**Date:** 2026-07-10
**Status:** Draft → awaiting user review
**Author:** AI-assisted (brainstorming → writing-plans skill sequence)
**Branch:** `main`

## Problem statement

In long agent tasks the subagent loses coherence, edits the wrong file, and
recovery-loops on stale context until the budget runs out. The most recent
skill-loop drive-through failed for exactly this reason.

Underlying root causes that this repo can address structurally:

1. **Mixed-concern layouts** (`scripts/`, `crates/domi-server/src/http/handlers.rs`)
   make it hard to know which file owns what without loading the whole folder.
2. **Token-bloating files** (one 699-line handler; a 444-line test bundle; more
   on the way) force agents to load more than the relevant slice.
3. **A single global `AGENTS.md`** applies to every subdirectory regardless of
   which feature is in scope. An agent touching `audit rail` doesn't need the
   `crates/domi-egui` rules.
4. **No session handoff convention.** When a long task dies mid-loop, nothing
   tells the next session what was decided.
5. **No shared "where do I edit?" map.** Subagents re-`grep` for the same things
   every restart.

A `graphify` build (1321 nodes / 2320 edges; built 2026-07-10) corroborates:
god-nodes cluster around `crates/domi-server/src/http/handlers.rs` (handlers
own AppState, test_state, events routes, WS upgrade, file metadata — five
concerns); `packages/react/tests/primitives.test.tsx` is the second-largest
file; `components/domi.css` is unexpectedly central to the Archetype Cloning
Pipeline (confirming the existing pre-existing-dirty flag in the root
`AGENTS.md`). Communities 0–3 have cohesion <0.1 — classic signs of mixed
concerns.

## Goal

After this refactor, a subagent asked to touch `audit rail`:

- opens **one folder** (or a <300-line file set),
- applies **safe-zone rules from a local `AGENTS.md`**,
- knows **which other files are safe to touch**,
- finishes without drifting.

A long task that crashes mid-loop can be resumed by reading
`.domi/scratch/<feature>-N.md`. A subagent asked "where is X?" queries
`graphify` instead of re-`grep`ing.

## Non-goals

Out of scope for this refactor (do not smuggle these in):

- Wire-protocol, event-schema, or token-value changes
  (library invariant; see `AGENTS.md` "Library invariant").
- `components/` HTML primitives or `components/domi.css` (pre-existing dirty;
  see `AGENTS.md` "Pre-existing dirty state").
- npm-package API changes (`@domi/react`, `@domi/astro`) or `domi-egui` API
  changes (Phase 3 ships are frozen pending distribution).
- `examples/` content.
- Renaming anything in `tokens/`, `templates/` (other than the new
  `scripts/runtime/` and `scripts/shell/` subfolders, which is layout only — see
  §"File structure").
- The skill-loop wiring itself (`tools/skill-smoke*.mjs`,
  `scripts/verify-skill-loop*.sh`) — it's already shipped and working.
- Adding new dependencies. `rtk` and `graphify` are runtime-tooling only.
- Touching `docs/superpowers/specs/`, `.../plans/`, or `.../handoffs/` content
  other than appending this spec + its plan + handoff.

## Design

Four parts. Each part is independently scoped and can be implemented in any
order, but part 1 should be done first because parts 2 and 3 reference the
file structure it establishes.

### Part 1 — File structure + size discipline

**File-size rules** (codified in `AGENTS.md`, enforced by a new
`tools/check-file-size.mjs` invoked from `package.json`'s
`prepush` and `pretest` hooks; not a true git pre-commit hook because
the repo doesn't have `lefthook`/`husky` today and adding one is
out of scope):

| Size              | Meaning                                  | Required behavior                |
|------------------:|------------------------------------------|----------------------------------|
| 0–300 lines       | Healthy default                          | Normal edits allowed             |
| 300–500 lines     | Acceptable but watchful                  | New logic only if it fits the file's single responsibility |
| 500–700 lines     | Refactor pressure                        | **Must** extract a coherent responsibility before adding more behavior |
| 700+ lines        | Architectural failure (refactor target)  | Subagent **must not** add to it without an explicit split plan |

**Function size**: ≤40 lines default; >80 requires extraction or
inline-comment justification.

**Per-file ownership (the "boring code" rule)**: one primary owner per
file = one class, one widget, one route family, one installer script, one
test bundle. Split BEFORE adding new behavior if mixed (lifecycle phase +
external boundary + review path differs from the existing owner).

#### Mixed-concern split: `scripts/`

```
scripts/
  runtime/                # Phase 1 + Phase 2 client runtimes — read-only per AGENTS.md library invariant
    domi.js
    domi-audit.js
    domi-wire.js
    domi-server.js
  shell/                  # bash installers + skill-loop runners
    install.sh
    verify.sh
    verify-skill-loop.sh
    verify-skill-loop-server.sh
```

`runtime/` keeps the read-only-by-default library invariant intact (file
contents unchanged; only paths change). `shell/` is the natural home for new
shell helpers (e.g. a future `cleanup-scratch.sh`). The wire-protocol rules
in `AGENTS.md` reference `scripts/domi-wire.js` — update those references to
`scripts/runtime/domi-wire.js`.

#### Split-now targets (in scope for this refactor)

**`crates/domi-server/src/http/handlers.rs` (699 lines) →**

```
crates/domi-server/src/http/handlers/
  mod.rs                  # Router::new() wiring only — <50 lines
  state.rs                # AppState, extractors, lifecycle — <150 lines
  test_state.rs           # GET /test-state — <100 lines
  events.rs               # POST /events + GET /api/events — <200 lines
  ws.rs                   # WebSocket upgrade — <100 lines
```

Each file owns ONE HTTP route family. The `mod.rs` re-exports the route
handlers so the upstream import `use crate::http::handlers::*` keeps working.

**`crates/domi-server/src/serve/file.rs` (377 lines, projected to exceed 500
with the next round of fixes) →**

```
crates/domi-server/src/serve/file/
  mod.rs                  # Router::new() wiring only — <50 lines
  safety.rs               # path-escape, symlink containment — <100 lines
  static_get.rs           # GET handler — <200 lines
```

The handoff shows this file grew by ~150 lines during the recent
skill-loop wiring (shim-injection gate + symlink + null rect normalization);
each was a discrete ownership.

**`packages/react/tests/primitives.test.tsx` (444 lines) →**

```
packages/react/tests/primitives/
  buttons.test.tsx         # button, badge, alert
  forms.test.tsx           # input, select, checkbox, radio
  feedback.test.tsx        # toast, modal, tooltip, tabs
  layout.test.tsx          # card, table, nav
```

Existing `it()` blocks move 1:1 to the new files. Import lines and
`vitest.config.js` `test.include` patterns pick them up automatically.

### Part 2 — Hierarchical `AGENTS.md` with safe/ask-first zones

Currently the root `AGENTS.md` (141 lines, well-maintained) covers everything.
**Keep it.** Add per-module overrides co-located with the code they govern.
Hierarchical context files merge with the closest-scope file taking precedence
(Claude Code, Cursor, GitHub Copilot all support this).

The root file is the **lib rules** (read-only invariants, RTK usage, tests,
`.diracrules`, subagent discipline). Each per-module file is a small list
of safe-zone / ask-first-zone operations specific to that module — never
rewrites the lib rules.

#### Per-module `AGENTS.md` files (this refactor creates these)

| File | Owner | Safe zones | Ask-first zones |
|---|---|---|---|
| `scripts/runtime/AGENTS.md` | Phase 1+2 client runtime | n/a (read-only by lib invariant) | ANY edit (per lib invariant) |
| `scripts/shell/AGENTS.md` | shell installers + loop runners | new shell helpers, bug fixes to existing `verify-*.sh` and `install.sh` | structural rewrites that change CI semantics |
| `crates/domi-server/AGENTS.md` | Rust server binary + CLI | under `src/{events,serve,http,tools}/` files UNDER their size threshold; adding a new subcommand under `src/tools/` | editing `main.rs`, changing `Cargo.toml` deps, bumping MSRV |
| `crates/domi-egui/AGENTS.md` | Phase 3c Rust widgets | under `src/<widget>.rs` per the one-widget-per-file rule; adding a composite under `src/composites/` | changing `Theme`, swapping `ModalManager` paint stub for live impl, bumping egui version |
| `packages/react/AGENTS.md` | `@domi/react` Phase 3a | under `src/primitives/<name>.tsx`; adding or fixing tests in `tests/primitives/<category>.test.tsx` | updating `CSS-AUDIT.md`, bumping React peer dep, adding a new primitive (that needs a primitive to exist in `components/` first) |
| `packages/astro/AGENTS.md` | `@domi/astro` Phase 3b | under `src/components/<name>.astro`; adding tests in `tests/` | structural changes to hydration control wrappers |
| `tools/AGENTS.md` | Node tooling (`skill-smoke*`, `tokens-to-css`, `smoke`) | new tools; bug fixes; adding ports/flags | structural rewrites; the new `tools/check-file-size.mjs` (see Part 4) |
| `templates/working-doc/AGENTS.md` | The audit archetype | adding `data-feedback` hooks, new status chip states, mirroring to `.domi/state/` | changing the audit runtime itself |
| `docs/AGENTS.md` | Library docs | editing prose in `docs/{USAGE,DESIGN,STANDARDS,AUDIT,EXTENDING,LAYOUTS,WIRE-PROTOCOL,RUST}.md` | editing `docs/superpowers/specs/`, `.../plans/`, `.../handoffs/` (those are append-only trails) |

Each per-module file is **≤80 lines** and **focused** — the goal is for an
agent asked to touch `x` to land in `x/AGENTS.md` and immediately know the
operational boundaries without reading the global rules again.

`.diracrules` (the project-level agent config noted in the Phase 4 handoff
as confusingly named) gets **renamed to `tools/agent-rules.md`** — it lives
under `tools/` because it's tooling, not because of any file its name
implies. The current `.diracrules` content moves verbatim; old path stays as
a 1-line symlink for one release if any external tool reads it (none known).

### Part 3 — `graphify` as a subagent lookup

The corpus `graph.json` already exists in `graphify-out/` (1321 nodes / 2320
edges, 120 communities). Surface it through a sub-routine in
`tools/where-is.mjs` that wraps `graphify query "..."` with sensible defaults
for this repo (depth=2, only `.domi/` / `.superpowers/` / `graphify-out/`
excluded from search):

```
$ node tools/where-is.mjs "audit rail rail-add"
  Found 6 nodes matching 'audit rail':
    scripts/runtime/domi-audit.js:rail_add          (community: Audit Runtime)
    crates/domi-server/src/events/event.rs:EventData::RailAdd  (community: Event Schema)
    crates/domi-server/src/http/handlers/:events:POST_events   (community: HTTP routes)
    docs/WIRE-PROTOCOL.md:RailAdd                  (community: Wire Protocol)
    docs/AUDIT.md:section-3-rail-add                (community: Audit Loop Guide)
    tests/wire-protocol.test.js:rail_add_roundtrip  (community: Wire Protocol Tests)

  Edges:
    domi-audit.js:rail_add  --[calls, weight=1.0]-->  EventData::RailAdd (EXTRACTED)
    EventData::RailAdd      --[implements, INFERRED 0.85]-->  docs/WIRE-PROTOCOL.md:RailAdd
    ...

  Suggested next: where-is "EventData ordering" -- across Rust ↔ JS schemas
```

A subagent asked "where does audit rail-add go?" runs `node tools/where-is.mjs
"audit rail"` instead of `grep -r "rail" scripts/ crates/ docs/` which is
what causes the "grep returned 8 files, model picks file 4" failure mode.

The script:
- reads `graphify-out/graph.json` (built via `graphify query`),
- prints matches grouped by community,
- prints the EXTRACTED edges so the agent sees blast radius,
- prints one "suggested next" follow-up question.

This is **only** a thin wrapper — it does NOT replace grep. It's the
discoverability layer that turns the graph into something an agent can
actually ask.

`graphify-out/` is **gitignored** (added to `.gitignore`); it's regenerated
locally via `npm run graph` (which runs `graphify --update`). The 1321-node
graph and its `GRAPH_REPORT.md` don't ship in source control — they're a
runtime asset, like `.domi/`. Any agent that needs to query runs
`npm run graph` first (or the wrapper itself regenerates if `graph.json`
is missing).

For `tools/where-is.mjs`, the wrapper reads `graphify-out/graph.json` if
present. If the file is missing, the wrapper prints a one-line instruction
to run `npm run graph` and exits 1 — never silently returns empty results.

### Part 4 — Session-bridge scratch convention (long-task recovery)

Long tasks die mid-loop. Today nothing survives the crash. Add a
`./scratch/` convention that any subagent picks up automatically because
`AGENTS.md` says so:

**Layout**:
```
.domi/scratch/
  README.md                      # how the convention works
  <feature-or-task-name>/
    session-1.md                 # raw session output, written before each /clear or context reset
    session-2.md
    ...
    handoff.md                   # THE artifact: distilled state for next session
```

**Trigger**: at 80–85 % context usage, OR before any "/clear", "/compact",
session-end, or topic-switch signal, the agent writes the latest raw output
to `session-N.md`. The agent also writes (or updates) `handoff.md` with:

```
# Handoff for <feature-or-task-name>

## Current goal
<verbatim original user instruction>

## Decisions made
- decision-1: <one line + one-line why>
- decision-2: ...

## Decisions deferred
- ...

## Files in play
- <path> — <status: done|in-progress|untouched|not-applicable>

## Next concrete action
- <one task the next session should do first>

## Don't forget
- warnings, fragile spots, deferred edge cases
```

The convention is in `AGENTS.md` (one paragraph) so every agent sees it.
Cap each `handoff.md` at ≤1000 tokens. Keep `session-N.md` raw and bound to
disk space (~5–10 KB per session is normal).

A crashed session becomes: `cat .domi/scratch/<name>/handoff.md` is the
entire loss surface, recoverable in under a minute. This implements the
"Session Bridge" pattern documented in the linked research without building
new tooling — just a `AGENTS.md` mandate and a directory.

`.domi/scratch/` is added to `.gitignore` (alongside existing `.domi/`) so
handoffs never accidentally land in source control. `.domi/` is already
runtime-only per the root `AGENTS.md`.

## Verification plan

After each refactor step:

1. `npm test` — must stay 240/240 (last verified state per Phase 4 handoff)
2. `cargo test --workspace` — must stay 77/77 + 13 ignored
3. New: `node tools/check-file-size.mjs` — must report 0 files over 700
   lines, and 0 dev files over 500 lines added since the refactor start.
   The single existing file at 699 lines (`handlers.rs`) is an
   exception that this script tracks as a known pre-split target;
   the exception is removed once Part 1's split of that file lands.
4. `node tools/where-is.mjs "audit rail"` — smoke tests the new wrapper.

Cross-language drift check: `crates/domi-server/src/events/event.rs` ↔
`tests/wire-protocol.test.js` (the existing rule from root `AGENTS.md`)
— the new `crates/domi-server/AGENTS.md` repeats this rule for the
scoped subagent.

After the whole change set:

- `npm run test:e2e` and `npm run test:e2e:server` (the skill-loop
  tests from Phase 4) — must stay green.
- A second drive-through agent session reproducing the recent failure
  mode runs the skill-loop task under the new `AGENTS.md` hierarchy
  and reports any behavior change. This is the only acceptance test
  for "agents stopped getting lost."

## Rollout

Single PR, not flagged for any version bump. Order of changes inside
the PR (each commit runs `npm test && cargo test --workspace`):

1. **Mechanical** directory moves (no file content changes):
   - `scripts/domi*.js` → `scripts/runtime/domi*.js`
   - shell scripts stay at `scripts/`
2. **Split** `crates/domi-server/src/http/handlers.rs` into
   `handlers/{mod,state,test_state,events,ws}.rs`.
3. **Split** `crates/domi-server/src/serve/file.rs` into
   `file/{mod,safety,static_get}.rs`.
4. **Split** `packages/react/tests/primitives.test.tsx` into the four
   category files.
5. **Add** `tools/check-file-size.mjs` + a root AGENTS.md paragraph
   codifying the size rules from Part 1.
6. **Add** per-module `AGENTS.md` files (Part 2 table).
7. **Add** `tools/where-is.mjs` (Part 3 wrapper).
8. **Add** `.domi/scratch/README.md` + a session-bridge paragraph in
   root `AGENTS.md` (Part 4).
9. **Rename** `.diracrules` → `tools/agent-rules.md` (Phase 4 handoff
   cleanup; do it here while the area is open).
10. **Drive-through**: in a fresh subagent session, replay the
    task that recently failed and confirm no drift. Capture in the
    handoff for this refactor.

Each step is reversible on its own. The PR is gated on every test
step passing. No migration window — the library invariant is preserved
throughout (split targets move between subdirs of the same crate; the
`scripts/` split keeps every file at the same path with one exception:
the `runtime/` subfolder, which is in-scope per the explicit user
"refactor" instruction; the wire-protocol rule text in root AGENTS.md
is updated in the same commit).

Dependency order inside the PR (each step still individually
revertible, but step N cannot run before step M completes):

- Step 1 must precede Step 6 (Step 6 references the new
  `scripts/runtime/` and `scripts/shell/` paths).
- Steps 2–4 may run in any order or parallel; each is independent.
- Step 5 (file-size check) is preferred after Steps 2–4 so the script
  is enforced against post-split line counts. If landed first, the
  initial check reports the 699-line `handlers.rs` exception; that's
  tolerable.
- Step 7 (where-is.mjs) is independent.
- Step 8 (scratch convention + root AGENTS.md paragraph) is
  independent.
- Step 9 (.diracrules rename) is independent; doing it before Step 6
  keeps the new tools-AGENTS.md consistent with the renamed file.
- Step 10 (acceptance drive-through) is the final gate and depends
  on all prior.

## Out-of-scope consequences

These were considered and explicitly rejected for this refactor:

- **Refactoring `components/domi.css`** (pre-existing dirty; the user
  flagged it as something to NOT touch without explicit ask).
- **Vertical-slice restructuring** of `crates/domi-server/src/` (the
  existing `events/`, `serve/`, `http/`, `tools/` subdirs are already
  feature-aligned; this refactor only splits WITHIN them).
- **Coercing the legacy `Skill/` directory** (per root `AGENTS.md`
  "Suspect / leftover"; the user said don't touch).
- **Replacing `domi-audit.js` or `domi.js`** (read-only library
  invariant; not up for refactor without explicit user sign-off).
