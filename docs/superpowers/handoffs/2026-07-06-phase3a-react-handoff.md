# Phase 3a (@domi/react) — Handoff

**Date:** 2026-07-06
**From:** Phase 3a implementation session (single-agent, TDD, inline checkpoints)
**To:** Next session (Phase 3b `@domi/astro`, whole-branch review, or other)
**Branch:** `phase-2d-agent-tooling` (unchanged — Phase 2d merge still deferred per the previous handoff's decision)
**Plan:** [`docs/superpowers/plans/2026-07-05-phase3a-react-plan.md`](../plans/2026-07-05-phase3a-react-plan.md)
**Spec:** [`docs/superpowers/specs/2026-07-05-phase3a-react-design.md`](../specs/2026-07-05-phase3a-react-design.md)

---

## TL;DR

Phase 3a is **complete and merge-ready**. All 12 plan tasks shipped as 15 atomic commits (with one fix + one amendment).

- `@domi/react` 0.1.0 exists with 15 React wrappers + `cn()` helper, fully typed (strict TS, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- ESM + CJS + `.d.ts` bundles build cleanly via tsup.
- **161 JS tests pass, 2 skipped** (was 121 before 3a → +40 net new).
- **cargo test --workspace** still green (Phase 2d baseline preserved).
- **Library invariant held**: no edits to `tokens/`, `components/`, `scripts/runtime/domi*.js`, `examples/`, `crates/`, `templates/`, `tools/`.
- **Whole-branch review** is the recommended next step (per the plan's "Execution Handoff" section).

---

## What shipped

### Repo additions (all under `packages/react/`)

```
packages/react/
├── README.md                 # usage + per-component props table + escape-hatch docs
├── CSS-AUDIT.md              # Task 2 — CSS source-of-truth ↔ wrapper union mapping
├── package.json              # @domi/react 0.1.0, peerDeps react ^18
├── tsconfig.json             # strict TS, ES2020, react-jsx, declaration
├── tsup.config.ts            # ESM + CJS + dts, es2020
├── src/
│   ├── index.ts              # barrel: 15 components + cn + types
│   ├── utils/
│   │   └── cn.ts             # 1-line class joiner
│   └── primitives/
│       ├── button.tsx        # variants + sizes + as + forwardRef
│       ├── card.tsx          # sizes only
│       ├── alert.tsx         # variants + as + forwardRef
│       ├── badge.tsx         # variants + as + forwardRef
│       ├── form.tsx          # structural
│       ├── input.tsx         # sizes + error flag
│       ├── select.tsx        # sizes + error flag
│       ├── checkbox.tsx      # fixed type="checkbox"
│       ├── radio.tsx         # fixed type="radio"
│       ├── table.tsx         # structural
│       ├── nav.tsx           # <nav> wrapper
│       ├── tabs.tsx          # structural
│       ├── modal.tsx         # <dialog> + open prop
│       ├── toast.tsx         # structural
│       └── tooltip.tsx       # content prop → data-tooltip attr
└── tests/
    ├── cn.test.ts            # 5 tests
    └── primitives.test.tsx   # 73 tests covering all 15 + barrel
```

### Root additions

- `package.json` — added `"workspaces": ["packages/*"]` and `"build:react": "cd packages/react && tsup"`.
- `vitest.config.js` — widened `include` glob to pick up `packages/**/tests/**/*.test.{ts,tsx}`.

### Commits (newest first)

```
8b28650 docs(react): README with usage, component table, escape hatches
ebc130d fix(react): build:react script — cd into package dir so tsup resolves src/index.ts
39009a2 feat(react): barrel index.ts + smoke test (15 components + cn exported)
fbe63ae feat(react): DomModal, DomToast, DomTooltip overlay wrappers (TDD)
685620d feat(react): DomTable, DomNav, DomTabs structural wrappers (TDD)
5136367 feat(react): DomCheckbox, DomRadio wrappers (TDD)
eed43f1 feat(react): DomForm, DomInput, DomSelect wrappers (TDD)
d9d5a85 feat(react): DomCard, DomAlert, DomBadge wrappers (TDD)
5fa771c docs(3a): plan amendment — AnchorHTMLAttributes cast for as="a" branches
158195f fix(react): cast rest to AnchorHTMLAttributes in DomButton as="a" branch
46e11a5 feat(react): DomButton — first primitive wrapper (TDD)
83f3ee9 feat(react): cn() utility for className joining (TDD)
b94f003 docs(react): CSS audit + reconciliation doc (locks actual wrapper API)
9d6b6ea feat(react): monorepo scaffold + TS toolchain for @domi/react
045f1bc docs(3a): Phase 3a (@domi/react) implementation plan  ← baseline
a8debdf spec(3a): @domi/react — class-composition wrappers with escape hatches
```

15 commits since the plan was authored (`045f1bc` baseline). Every commit except the plan-amendment follows `<type>(<scope>): <subject>` with TDD discipline where applicable.

---

## Decisions made (locked from spec Q1–Q10)

| # | Decision | Status |
|---|----------|--------|
| Q1 | Monorepo with `packages/react/` + npm workspaces | ✅ shipped |
| Q2 | `tsup` for build (zero-config) | ✅ shipped |
| Q3 | String-literal unions for variants (not `as const` arrays) | ✅ shipped |
| Q4 | Default `variant` derived per-component from CSS audit | ✅ shipped |
| Q5 | Selective `as` prop (Button/Alert/Badge only) | ✅ shipped |
| Q6 | `displayName` on every component | ✅ shipped (asserted in tests) |
| Q7 | CSS class order: base → variant → size → user-className | ✅ shipped (asserted in DomButton test) |
| Q8 | `Cargo.lock` stays gitignored | ✅ preserved |
| Q9 | `components/domi.css` pre-existing dirty state preserved | ✅ preserved |
| Q10 | CSS is source of truth; spec deviations recorded in `CSS-AUDIT.md` | ✅ shipped |

---

## Known drift from plan (transparency)

The plan's stated test counts were slightly off. Actual counts are higher because `it.each` arrays count individually:

| Task | Plan said | Actual | Why |
|------|-----------|--------|-----|
| Task 5 (Card+Alert+Badge) | 29 | 33 | Plan didn't fully account for it.each × 4 |
| Task 6 (Form+Input+Select) | 45 | 49 | Same |
| Task 9 (Modal+Toast+Tooltip) | 67 | 71 | Same |
| Task 10 (barrel) | 69 | 73 | Same |

The tests still cover exactly what the plan describes; only the bookkeeping is off. Plan should be amended if strict alignment matters, but no code change needed.

**One semantic correction** (Task 6): The plan's `<DomSelect value="b">` test asserted `value="b"` appears on the `<select>` element. React renders controlled `<select value>` by setting `selected` on the matching `<option>`, not by emitting `value` on the parent. Test was rewritten to assert `<option value="b" ... selected>` — captures the actual contract. Commit `eed43f1` notes this in the body.

**One type fix** (Task 4 follow-up): DomButton's `as="a"` branch TS2322'd because `rest` was typed for `ButtonHTMLAttributes`. Fixed by casting `rest` to `AnchorHTMLAttributes<HTMLAnchorElement>` at the spread site. Commit `158195f`. Plan amended accordingly in `5fa771c` so future polymorphic components (Alert, Badge) follow the same pattern.

---

## Pre-existing dirty state — DO NOT TOUCH

These files were modified on disk before this session started and must remain out of the 3a diff:

```
M components/domi.css       # pre-existing since v0.1.0, library invariant
M package-lock.json         # from `npm install` in Task 1, expected
?? .diracrules              # untracked, agent session rules
```

The `domi.css` modification is a known long-standing issue tracked by the project owner; do not sweep it into a 3a commit. `Cargo.lock` exists at repo root but is in `.gitignore` (`git ls-files Cargo.lock` → empty), confirming the Phase 2c-α policy holds.

---

## Verification (run these to confirm 3a is intact)

```bash
# Test counts
npm test                          # → 161 passed, 2 skipped
cargo test --workspace            # → green (gated integration tests ignored)

# Build
npm run build:react               # → dist/index.{js,cjs,d.ts,d.cts} + maps

# Smoke import (proves barrel works)
node -e "import('./packages/react/dist/index.js').then(m => console.log(Object.keys(m).sort().join(' ')))"
# → DomAlert DomBadge DomButton DomCard DomCheckbox DomForm DomInput
#   DomModal DomNav DomRadio DomSelect DomTable DomTabs DomToast DomTooltip cn

# Type check
npx tsc --noEmit -p packages/react/tsconfig.json   # → clean

# Library invariant
git status --short components/ tokens/ scripts/runtime/domi*.js examples/ crates/ templates/ tools/
# → only ` M components/domi.css` (pre-existing)
```

---

## What's next

### Recommended: whole-branch review (Phase 2d precedent)

Phase 2d ended with a "0-Critical / 0-Important" review pass. The plan calls for the same pattern on 3a. Use the `subagent-driven-development` skill:

- One reviewer subagent per task (or per logical batch: scaffold + audit + cn + Button, then 5/6/7/8/9, then 10/11/12).
- Final whole-branch review at the end.

### Then: Phase 3b (`@domi/astro`)

The Phase 3 decomposition (per the 3a plan preamble) lists 3b as the Astro integration. **No spec exists yet.** To kick off 3b:

1. Spec: `docs/superpowers/specs/2026-07-06-phase3b-astro-design.md` (or fresh date)
   - Should reuse the same 15 primitives — likely as Astro components that re-export `@domi/react` wrappers, or a parallel Astro-native set using the same CSS.
   - Decide: Astro components vs React-via-Astro vs HTML-only.
2. Plan: `docs/superpowers/plans/2026-07-06-phase3b-astro-plan.md`
   - Should mirror 3a's structure: scaffold → audit → per-primitive tasks → barrel → build → README → invariant check.
   - Reference 3a plan as a template.
3. Library invariant continues to apply.

### Then: Phase 3c (`domi-dvui`)

A desktop/embedded variant. No spec exists. Defer until 3b ships.

### Phase 2d merge (still deferred)

The previous handoff decided to defer Phase 2d's merge until Phase 3 wraps, to avoid rebase pain. That decision still stands. Once 3a is reviewed (and ideally merged), do a Phase 2d + 3a combined merge, then proceed to 3b on `main`.

---

## Open questions for the next session

1. **Monorepo publish story.** `dist/` is gitignored; consumers build from source. If publishing to npm is on the roadmap, add a `prepublishOnly` hook or commit `dist/`. **Not a 3a concern** — out of scope per the plan.
2. **`@types/react` version.** The plan pinned `^18.0.0`. If React 19 lands during 3b/3c, re-check `peerDependencies` ranges.
3. **`as` prop consistency.** Q5 said "selective." If reviewers push for `as` on more components, audit whether each target element supports the props the wrapper passes through (e.g., `as="label"` on a Checkbox that adds `htmlFor` semantics).
4. **React 19 `forwardRef` deprecation.** React 19 makes ref a regular prop (no `forwardRef` needed). If targeting React 19, refactor to plain function components. **Not urgent** — peerDep is `^18`.
5. **Test runner choice.** `vitest` covers the React tests fine, but `@testing-library/react` was deliberately avoided (per the plan). If reviewers want behavioral tests (clicks, state changes) instead of pure SSR markup assertions, add it as a Phase 3b+ concern.

---

## File map for fast pickup

| Need | Path |
|------|------|
| Phase 3a design (locked decisions) | `docs/superpowers/specs/2026-07-05-phase3a-react-design.md` |
| Phase 3a plan (12 tasks) | `docs/superpowers/plans/2026-07-05-phase3a-react-plan.md` |
| Phase 3a CSS source-of-truth | `packages/react/CSS-AUDIT.md` |
| Phase 3a user-facing docs | `packages/react/README.md` |
| Phase 3 decomposition map (3a/3b/3c) | preamble of the 3a plan; not extracted to a separate file |
| Phase 2 scope (predecessor) | `docs/PHASE2-SCOPE.md` |
| Wire protocol (predecessor) | `docs/WIRE-PROTOCOL.md` |
| Rust crate layout (Phase 2c-α) | `docs/RUST.md` |
| Agent rules (project-local) | `AGENTS.md`, `tools/agent-rules.md` |
| Phase 2d handoff (predecessor) | (not yet found — search `docs/superpowers/handoffs/` if 2d had one) |

If a Phase 2d handoff exists, archive it alongside this one for traceability.

---

## Sign-off

Phase 3a is **merge-ready** from this session's perspective. Recommend the next session:

1. Run the verification block above.
2. Decide: review-then-merge or merge-then-3b?
3. Either way, start the Phase 3b spec/plan if going forward.

End of handoff.
