# Phase 3b (`@domi/astro`) — Handoff

**Date:** 2026-07-06
**From:** Phase 3b implementation session (single-agent, inline execution, parser-first)
**To:** Next session (Phase 3c `domi-dvui`, whole-branch review, or merge)
**Branch:** `phase-2d-agent-tooling` (unchanged — Phase 2d merge still deferred per prior handoffs)
**Plan:** [`docs/superpowers/plans/2026-07-06-phase3b-astro-plan.md`](../plans/2026-07-06-phase3b-astro-plan.md)
**Spec:** [`docs/superpowers/specs/2026-07-06-phase3b-astro-design.md`](../specs/2026-07-06-phase3b-astro-design.md)

---

## TL;DR

Phase 3b is **complete and merge-ready** with **one significant divergence from the plan**: the test strategy was pivoted from Astro's `experimental_AstroContainer` to **static analysis** of `.astro` source files, because the Container API fails to initialize in the Astro 5.18 + vitest 2.1 + Node 24 combination used in this repo.

- `@domi/astro` 0.1.0 exists with **15 native `.astro` wrappers** + `cn` (no, no `cn` — Astro doesn't need it) plus an exported types module.
- Source-only distribution (no build step) — consumers' Astro compiler handles the files at their site.
- **240 JS tests pass** (was 161 before 3b → +79 net new). **Cargo: 60 passed, 13 ignored** (Phase 2d baseline preserved).
- **Library invariant held**: zero edits to `tokens/`, `components/`, `components/primitives/*/`, `scripts/domi*.js`, `examples/`, `crates/`, `templates/`, `tools/`. Pre-existing dirty `components/domi.css` preserved.
- **Whole-branch review** is the recommended next step (per the plan's "Execution Handoff" section).

---

## What shipped

### Repo additions (all under `packages/astro/`)

```
packages/astro/
  package.json              # name: "@domi/astro", peerDeps: astro ^5.0.0, no runtime deps
  vitest.config.mjs         # per-package vitest with environment: 'node'
  README.md                 # usage + per-component props table + escape-hatch docs
  CSS-AUDIT.md              # NOT created — references packages/react/CSS-AUDIT.md instead
  src/
    index.ts                # barrel: 15 components + 15 Props types + 7 union types
    types.ts                # 7 string-literal unions (Button/Input/Select/Card sizes,
                            #   Alert/Badge variants). Source of truth: packages/react/CSS-AUDIT.md
    components/
      Button.astro          # variants + sizes + as=button/a
      Card.astro            # sizes only
      Alert.astro           # variants + as=div/span
      Badge.astro           # variants + as=span/a
      Form.astro            # structural
      Input.astro           # sizes + boolean error flag
      Select.astro          # sizes + boolean error flag
      Checkbox.astro        # fixed type="checkbox"
      Radio.astro           # fixed type="radio"
      Table.astro           # structural
      Nav.astro             # <nav> wrapper
      Tabs.astro            # structural
      Modal.astro           # <dialog> + open prop
      Toast.astro           # structural
      Tooltip.astro         # <span> + data-tooltip attribute
  tests/
    parser.ts               # parseAstro + evaluateClassExpr (static-analysis helpers)
    harness.test.ts         # 3 tests: parser splits frontmatter/body, evaluateClassExpr,
                            #   components dir exists
    types.test.ts           # 7 tests: each union's literal type membership (expectTypeOf)
    button.test.ts          # 9 tests: Button class composition + as="a" body pattern
    display.test.ts         # 19 tests: Card/Alert/Badge variants + sizes + as branches
    forms.test.ts           # 13 tests: Form/Input/Select — action/method/type/error
    controls.test.ts        # 5 tests: Checkbox/Radio — fixed type + class composition
    structural.test.ts      # 5 tests: Table/Nav/Tabs — tag and class composition
    overlays.test.ts        # 4 tests: Modal/Toast/Tooltip — dialog/div/span rendering
    audit-consistency.test.ts  # 10 tests: parses CSS-AUDIT.md table, asserts TS unions match
    barrel.test.ts          # 4 tests: barrel text exports 15 components + 15 Props
```

### Root additions

- `package.json` — no edit needed (root `"workspaces": ["packages/*"]` already covers `packages/astro/`).
- `vitest.config.js` — **no edit needed** (existing include glob already covers `packages/**/tests/**/*.test.{js,ts,tsx}`; tests run fine under the root config because `.astro` files are only imported via `eval()`-driven string parsing, not as ESM imports).
- `package-lock.json` — npm install footprint (expected).

---

## Commits (newest first)

```
bd0767f fix(astro): barrel.test.ts — use dirname(fileURLToPath) so root config can resolve import.meta.url
e477966 feat(astro): barrel index.ts + README
5fb2188 test(astro): CSS audit consistency test — locks types.ts ↔ CSS-AUDIT
d23db12 feat(astro): Modal, Toast, Tooltip overlays + balanced-brace class parser (TDD)
435726e feat(astro): Table, Nav, Tabs structural wrappers (TDD, static-analysis)
4867ed1 feat(astro): Checkbox, Radio wrappers (TDD, static-analysis)
5762fb8 feat(astro): Form, Input, Select wrappers (TDD, static-analysis)
1e85323 feat(astro): Card, Alert, Badge wrappers (TDD, static-analysis)
0fba365 feat(astro): Button — first primitive wrapper (TDD, static-analysis)
058246d feat(astro): variant/size type unions (mirror of CSS-AUDIT)
3776199 feat(astro): package scaffold + static-analysis test harness for @domi/astro
```

11 commits since the plan was authored (`ff48d15`). Every commit follows `<type>(<scope>): <subject>` with TDD discipline.

---

## Decisions made (locked from spec Q1–Q10 + new for test strategy)

| # | Decision | Status |
|---|----------|--------|
| Q1 | Monorepo with `packages/astro/` + npm workspaces | ✅ shipped |
| Q2 | **Bare names** (`Button`, not `DomButton`) | ✅ shipped — diverges from 3a deliberately |
| Q3 | String-literal unions for variants/sizes | ✅ shipped |
| Q4 | Default `variant` derived per-component from CSS audit | ✅ shipped |
| Q5 | Selective `as` prop (Button/Alert/Badge only) | ✅ shipped |
| Q6 | N/A — Astro components don't have a runtime displayName | skipped |
| Q7 | CSS class order: base → variant → size → user-className | ✅ shipped |
| Q8 | `Cargo.lock` stays gitignored | ✅ preserved |
| Q9 | `components/domi.css` pre-existing dirty state preserved | ✅ preserved |
| Q10 | CSS is source of truth; CSS-AUDIT.md references shared ground truth | ✅ shipped (no separate ASTRO-AUDIT — we reference the 3a doc) |
| NEW | Static-analysis test strategy instead of `experimental_AstroContainer` | ✅ shipped — see "Major deviation" below |

---

## Major deviation from plan: static-analysis tests

The plan specified `experimental_AstroContainer` from `astro/container` for runtime component tests. **This API does not work in the current Astro 5.18 + vitest 2.1 + Node 24 combination in this repo.**

Tried during implementation:
- `getViteConfig` from `astro/config` + `experimental_AstroContainer.renderToString` → opaque `[object Object]` error during vitest plugin init, no `test files matched` because vitest never finished loading plugins.
- vitest 3.2.7 (manually bumped to match Astro 5's peer) → same opaque error.
- Plain `defineConfig` + `environment: 'node'` → Astro's bundled esbuild 0.27.7 hit a `TextEncoder` invariant failure during test transform.
- Plain `defineConfig` + `environment: 'jsdom'` → same esbuild invariant failure.

**Pivot:** I rewrote `packages/astro/tests/parser.ts` with `parseAstro()` (frontmatter/body splitter) and `evaluateClassExpr()` (compiles the frontmatter via `new Function`, then evaluates the class expression in scope). This covers both patterns the repo uses:

- Precomputed: `const classes = [...].filter(Boolean).join(' '); <button class={classes} {...rest} />`
- Inline: `<button class={['domi-btn', variant && `domi-btn--${variant}`, className].filter(Boolean).join(' ')} {...rest} />`

The `extractClassExpr` helper uses balanced-brace walking (not regex) to handle template-literal `${...}` correctly without false matches.

**Trade-offs vs. container-based testing:**
- ✅ Works reliably across vitest versions and Node versions.
- ✅ No runtime deps for tests; no `getViteConfig` config drift.
- ✅ Runs from root `npm test` without modifying root config.
- ❌ Doesn't exercise frontmatter logic with real `Astro.props` semantics (we inject a JSON-stringified props object).
- ❌ Doesn't catch rendering bugs in `<slot />` composition or attribute spread order.
- ❌ 79 tests shipped vs. the plan's 73 — slightly more because `it.each` arrays count individually.

**When to switch back:** If Astro's vitest story stabilizes (e.g., Astro 6 ships with a working `astro test` subcommand, or `@vitest/ui` gets a working Astro plugin), `tests/parser.ts` is the one file to swap. The component tests already use `parseAstro` + `evaluateClassExpr` — replacing those with `container.renderToString(...)` would be mechanical. The README documents this.

---

## Pre-existing dirty state — DO NOT TOUCH

These files were modified on disk before this session started and remain out of the 3b diff:

```
M components/domi.css       # pre-existing since v0.1.0, library invariant
M package-lock.json         # from `npm install` in Task 1 + devDep additions
?? .diracrules              # untracked, agent session rules
```

`Cargo.lock` exists at repo root but is gitignored (`git ls-files Cargo.lock` → empty), confirming the Phase 2c-α policy holds.

---

## Verification (run these to confirm 3b is intact)

```bash
# Test counts
npm test                          # → 240 passed, 2 skipped (242 total)

# From package root (where vitest.config.mjs lives):
cd packages/astro && npm test      # → 79 passed

# Build — no build step. Consumers' Astro compiler handles .astro files.

# Type check
cd packages/astro && npx astro check   # → 15 files, 0 errors, 0 warnings, 0 hints

# Library invariant
git status --short components/ tokens/ scripts/domi*.js examples/ crates/ templates/ tools/
# → only ` M components/domi.css` (pre-existing dirty, preserved). All other paths: no output.

# Cargo
cargo test --workspace            # → 60 passed, 13 ignored (Phase 2d baseline preserved)
```

### Component smoke test

Import from the barrel:

```ts
import { Button, Card, Alert } from '@domi/astro';
```

The 15 components are all exported; the 15 `Props` types and 7 union types re-export too. `astro check` validates the actual `.astro` files for type errors.

---

## What's next

### Recommended: whole-branch review (Phase 3a/2d precedent)

Phase 3a ended with a "0-Critical / 0-Important" review pass. The 3b plan calls for the same pattern on 3b. Use the `subagent-driven-development` skill (or dispatch a single reviewer):

- Dispatch one reviewer subagent against the diff from `ff48d15..HEAD` (the plan commit to current HEAD).
- Provide the spec + plan + this handoff as context.
- Reviewer should validate: (1) all 15 components match the audit, (2) library invariant held, (3) tests cover the contract, (4) spec deviations are documented, (5) no dead code or extra features.

### Then: Phase 3c (`domi-dvui`)

A desktop/embedded variant. No spec exists yet. Defer until 3b is reviewed (and ideally merged).

### Phase 2d merge (still deferred)

The 3a handoff decided to defer Phase 2d's merge until Phase 3 wraps, to avoid rebase pain. That decision still stands. Once 3b is reviewed, do a Phase 2d + 3a + 3b combined merge, then proceed to 3c on `main`.

---

## Open questions for the next session

1. **Static-analysis vs. container tests.** Documented above. If reviewer pushes for runtime tests, options are: (a) wait for Astro 6, (b) accept the limitation, (c) build a custom harness that uses esbuild + a fake `Astro` global. None are quick.

2. **Monorepo publish story.** `dist/` is gitignored; `@domi/astro` publishes source-only. Consumers must have Astro installed. If publishing to npm is on the roadmap, decide between: (a) ship a tiny build step that resolves types but keeps `.astro` files raw, or (b) commit to "source-only + Astro peer dep" forever.

3. **`Astro.props` semantics.** Our static-analysis evaluator JSON-stringifies the props object and injects `const Astro = { props: ... }`. Real Astro passes a more complex `Astro` object (`url`, `params`, `request`, `redirect`, `slots`, `self`, etc.). For class composition this doesn't matter, but if a future component reads `Astro.url`, our tests won't catch it.

4. **Test runner choice.** `vitest@^2.0` (root) works for our static-analysis tests. If Astro 6 stabilizes the vitest story, bumping root vitest is a one-line change.

5. **`@types/astro` peer range.** Astro 5 ships with built-in types; no separate `@types/astro` needed. If Astro 6 changes this, update accordingly.

6. **`as` prop consistency with 3a.** Q5 of the spec said "selective." 3b follows the same selective list (Button/Alert/Badge). Cross-package consistency check.

---

## File map for fast pickup

| Need | Path |
|------|------|
| Phase 3b design (locked decisions) | `docs/superpowers/specs/2026-07-06-phase3b-astro-design.md` |
| Phase 3b plan (11 tasks) | `docs/superpowers/plans/2026-07-06-phase3b-astro-plan.md` |
| Phase 3a design (sibling spec) | `docs/superpowers/specs/2026-07-05-phase3a-react-design.md` |
| Phase 3a plan (sibling template) | `docs/superpowers/plans/2026-07-05-phase3a-react-plan.md` |
| CSS audit (shared ground truth) | `packages/react/CSS-AUDIT.md` |
| @domi/astro package | `packages/astro/` |
| User-facing docs | `packages/astro/README.md` |
| Static-analysis helpers (one file to swap) | `packages/astro/tests/parser.ts` |
| Library invariant | `AGENTS.md` |
| Phase 3a handoff (predecessor) | `docs/superpowers/handoffs/2026-07-06-phase3a-react-handoff.md` |

---

## Sign-off

Phase 3b is **merge-ready** from this session's perspective, contingent on a whole-branch review finding no Critical issues. Recommend the next session:

1. Run the verification block above.
2. Dispatch a reviewer subagent against `ff48d15..HEAD`.
3. Decide: merge to `main` if review passes, or fix and re-review if it surfaces issues.

End of handoff.