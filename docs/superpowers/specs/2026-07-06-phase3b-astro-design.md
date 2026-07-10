# Phase 3b — `@domi/astro` Design Spec

**Date:** 2026-07-06
**Status:** Draft v1 — pending user review
**Phase:** 3b of Phase 3 (decomposed: 3a `@domi/react`, 3b `@domi/astro`, 3c `domi-dvui`)
**Sibling spec:** [`docs/superpowers/specs/2026-07-05-phase3a-react-design.md`](./2026-07-05-phase3a-react-design.md)

## Upstream contracts

- **HTML primitives** (canonical): `components/primitives/*/` — 15 folders with `index.html` + raw markup
- **CSS** (canonical): `components/domi.css` — variant class suffixes live here (e.g., `.domi-btn--primary`)
- **Design tokens** (canonical): `tokens/tokens.json` (locked palette + spacing) — read by `tools/tokens-to-css.mjs`; no token logic in JS
- **`@domi/react`** (sibling, parallel target): `packages/react/` — same 15 primitives, React-class API. Not a dependency of 3b.

## Problem

The 15 HTML primitives work as raw HTML, but Astro projects need typed `.astro` components so authors can use `<DomButton variant="primary" />` instead of hand-writing `<button class="domi-btn domi-btn--primary domi-btn--lg">`. Without this layer:

1. **No TypeScript autocomplete** for variants — typo `primry` silently breaks styling.
2. **No compile-time guarantee** that a variant exists in CSS.
3. **Every Astro user rewrites the same wrapper** — inconsistency across the ecosystem.
4. **No static-first story** — Astro's selling point is zero JS by default; raw HTML usage forfeits the IDE/DX layer Astro users expect.

`@domi/astro` solves this with 15 native `.astro` components that emit a single HTML element with the right class list. Pure static output, no client runtime, no React.

## Goals

- **15 `.astro` components** matching the HTML primitives 1:1 (`Button.astro` → `<button class="domi-btn ...">`, etc.).
- **Class-composition API**: `<Button variant="primary" size="lg" />` builds `class="domi-btn domi-btn--primary domi-btn--lg"`.
- **Escape hatches**: `class` prop (appended last), `<slot />`, prop pass-through via `{...Astro.props}`, and `as` prop where it makes sense. (`class:list` is intentionally NOT exposed — it would split the class-joining logic between two sources; consumers use `class=` only.)
- **TypeScript-first**: every prop typed; every variant is a string-literal union mapped 1:1 to a CSS class suffix.
- **Zero runtime JavaScript**: components compile to plain HTML. No client directive needed for the default case.
- **Library invariant held**: `tokens/`, `components/domi.css`, `components/primitives/*/`, `scripts/runtime/domi*.js`, `examples/`, `crates/`, `templates/`, `tools/` are **untouched** by 3b.
- **CSS is the source of truth**: components never construct class names in template logic that aren't already in `components/domi.css`. The variants exposed by TypeScript are derived from CSS class suffixes, not invented.

## Non-goals

- **No islands / hydration** — components are static HTML. If a consumer needs interactivity, they hydrate a child element or wrap in a React/Vue island themselves.
- **No `@astrojs/react` integration** — `@domi/astro` does not depend on `@domi/react` (parallel target, not stacked).
- **No state machines** — primitives are stateless; state lives in user code or `domi.js`.
- **No a11y wrappers** — primitives already have correct ARIA; wrappers don't override them.
- **No animation helpers** — CSS handles animation.
- **No new design tokens** — `tokens.json` stays canonical.
- **No `domi.js` integration** — `domi.js` is a separate runtime concern (Phase 1).
- **No SSR stylesheet inlining helper** — consumers `import 'domi/css/domi.css'` (or copy `components/domi.css`) themselves; we don't ship a build plugin.
- **No cross-framework wrappers in this phase** — `@domi/react` and `domi-dvui` are siblings, not consumers.
- **No content collection schemas** — 3b is a component library, not a content layer; no `src/content.config.ts`.
- **No adapter / SSR config** — 3b is a static component package; consumers configure their own `astro.config.mjs` for SSR if they want it.

## Design

### A. Package shape

```
packages/astro/
  package.json            # name: "@domi/astro", peerDeps: astro ^5
  README.md               # usage + per-component props table
  src/
    index.ts              # `export { default as Button } from './components/Button.astro'`, etc.
    components/
      Button.astro
      Card.astro
      Alert.astro
      Badge.astro
      Form.astro
      Input.astro
      Select.astro
      Checkbox.astro
      Radio.astro
      Table.astro
      Nav.astro
      Tabs.astro
      Modal.astro
      Toast.astro
      Tooltip.astro
    types.ts              # shared variant/size unions (mirror of packages/react CSS-AUDIT)
  tests/
    components.test.ts    # parse each component's frontmatter with @astrojs/component-test
```

Root changes:
- `package.json` — no edit needed; `"workspaces": ["packages/*"]` already in place.
- `vitest.config.js` — extend `include` glob to `packages/astro/tests/**`.

### B. Naming convention (intentional divergence from 3a)

3a uses the `Dom` prefix (`DomButton`) to avoid collisions with React built-ins. Astro has no such collisions, so 3b uses **bare names** (`Button`, `Card`). This makes `.astro` files read naturally:

```astro
---
import { Button } from '@domi/astro';
---
<Button variant="primary" size="lg">Save</Button>
```

vs. the verbose alternative `<DomButton ...>` that the React side needs.

Component name | File | Renders
---|---|---
`Button` | `Button.astro` | `<button>`
`Card` | `Card.astro` | `<div>`
`Alert` | `Alert.astro` | `<div>`
`Badge` | `Badge.astro` | `<span>`
`Form` | `Form.astro` | `<form>`
`Input` | `Input.astro` | `<input>`
`Select` | `Select.astro` | `<select>`
`Checkbox` | `Checkbox.astro` | `<input type="checkbox">`
`Radio` | `Radio.astro` | `<input type="radio">`
`Table` | `Table.astro` | `<table>`
`Nav` | `Nav.astro` | `<nav>`
`Tabs` | `Tabs.astro` | `<div>`
`Modal` | `Modal.astro` | `<dialog>`
`Toast` | `Toast.astro` | `<div>`
`Tooltip` | `Tooltip.astro` | `<span>`

**Note**: Astro doesn't actually validate that the export name matches the filename at runtime — `.astro` files are imported by their filename. The export name in `index.ts` is what consumers see. We align them anyway for grep-ability.

### C. Component anatomy

Every component follows the same shape, derived from `packages/react/CSS-AUDIT.md` (the same ground-truth doc; 3b does NOT duplicate it — see §D):

```astro
---
// packages/astro/src/components/Button.astro
import type { HTMLAttributes } from 'astro/types';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'lg';

interface Props extends Omit<HTMLAttributes<'button'>, 'class'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  class?: string;
  as?: 'button' | 'a';
}

const { variant = 'primary', size = 'lg', class: className, as = 'button', ...rest } = Astro.props;

const classes = [
  'domi-btn',
  variant && `domi-btn--${variant}`,
  size && `domi-btn--${size}`,
  className,
].filter(Boolean).join(' ');
---

{as === 'a' ? (
  <a class={classes} {...rest}><slot /></a>
) : (
  <button class={classes} {...rest}><slot /></button>
)}
```

**Patterns applied uniformly:**

1. **`Astro.props`** destructuring at the top of frontmatter.
2. **`Omit<HTMLAttributes<'tag'>, 'class'>`** — drop `class` (we own it) but keep everything else (`type`, `onClick` is browser-only so useless in SSR, but `aria-*`, `data-*`, `name`, `value`, `disabled` all pass through).
3. **`classes` array → `.filter(Boolean).join(' ')`** — equivalent of 3a's `cn()` but inlined; no separate util file (3 lines, not worth a dep or a file).
4. **`<slot />`** for children — standard Astro composition.
5. **`as` prop on Button/Alert/Badge only** — same selective list as 3a.

### D. CSS audit — shared ground truth with 3a

`packages/react/CSS-AUDIT.md` already documents the actual variant/size suffixes per component (the source of truth, derived from `components/domi.css`). 3b **references this doc** rather than re-auditing. To make this enforceable:

- `packages/astro/src/types.ts` re-declares each `*Variant` and `*Size` type union by hand (TypeScript can't import `.md`).
- A test (`tests/css-audit-consistency.test.ts`) parses the React `CSS-AUDIT.md` and asserts the 3b types match the suffixes listed in the doc. If a future Phase 3c wants the same audit, it imports the same parser.
- This keeps `CSS-AUDIT.md` the single human-edited source of truth; the TS unions are generated-checked, not drifted.

### E. Per-component mapping (the spec table, derived from the audit)

Mirrors `packages/react/CSS-AUDIT.md`. Provisional — the implementation TDDs verify each one.

| Component | HTML element | Variant options | Size options | `as` allowed |
|---|---|---|---|---|
| `Button` | `<button>` | `primary` \| `ghost` \| `danger` | `sm` \| `lg` | `button` \| `a` |
| `Card` | `<div>` | — | `sm` \| `lg` | — |
| `Alert` | `<div>` | `info` \| `success` \| `warning` \| `danger` | — | `div` \| `span` |
| `Badge` | `<span>` | `primary` \| `success` \| `warning` \| `danger` | — | `span` \| `a` |
| `Form` | `<form>` | — | — | — |
| `Input` | `<input>` | (boolean `error` flag) | `sm` \| `lg` | — |
| `Select` | `<select>` | (boolean `error` flag) | `sm` \| `lg` | — |
| `Checkbox` | `<input type="checkbox">` | — | — | — |
| `Radio` | `<input type="radio">` | — | — | — |
| `Table` | `<table>` | — | — | — |
| `Nav` | `<nav>` | — | — | — |
| `Tabs` | `<div>` | — | — | — |
| `Modal` | `<dialog>` | — | — | — |
| `Toast` | `<div>` | — | — | — |
| `Tooltip` | `<span>` | — | — | — |

`Input`/`Select` use `error?: boolean` (not a string union) — matches 3a and the single `.domi-input--error` / `.domi-select--error` suffix in CSS.

### F. Escape hatches (in order of power)

1. **`class` prop** — appended last in the joined class string. Wins specificity ties. `class:list` is intentionally NOT exposed (see §C note).
2. **`Astro.props` spread (`{...rest}`)** — every standard HTML attribute passes through (`type`, `aria-*`, `data-*`, `disabled`, `name`, `value`, `href` on `as="a"`, etc.).
3. **`as` prop** — selective (Button/Alert/Badge only).
4. **`<slot />`** — children composition. (Not `class="..."` on the slot; that would re-introduce variant strings inside consumers.)

### G. Build & publish

- **No build step.** Astro components are published as source — consumers' Astro compiler handles them at build time.
- **`package.json` `exports`**:
  ```json
  {
    "name": "@domi/astro",
    "version": "0.1.0",
    "type": "module",
    "exports": {
      ".": "./src/index.ts",
      "./components/*": "./src/components/*"
    },
    "files": ["src", "README.md"]
  }
  ```
- **Peer deps**: `astro ^5.0.0`.
- **No runtime deps**, no devDeps needed beyond what's already in root `node_modules` (`vitest`, `jsdom`).
- **No `tsup` / `tsc` build**: source-only distribution. Consumers' Astro TS plugin compiles `.astro` files in their own project.
- **Why no build?** Astro components are not portable as compiled JS — they need to be parsed by Astro's own compiler. Distributing source is the canonical pattern (Astro itself does this for `@astrojs/*` integrations and many community packages).

### H. Dependencies

**New**:

| Dep | Type | Purpose |
|---|---|---|
| `astro` | peer | Consumer's Astro installation (^5.0.0) |
| `@testing-library/dom` (optional, dev) | dev | Used by `tests/components.test.ts` only if `@astrojs/component-test` doesn't ship a renderer; confirmed during planning |

That's it. No `tsup`, no `@types/astro` (Astro ships its own types), no React, no React-dom. Tests use existing root `vitest` + `jsdom`.

### I. Testing

- **Framework**: `vitest` + `jsdom` (existing in repo). Plus `@astrojs/component-test` if it lands in time, otherwise parse frontmatter manually with a small harness.
- **Location**: `packages/astro/tests/components.test.ts`.
- **Per component**:
  - Frontmatter parses (TS errors caught at `tsc --noEmit`).
  - Default variant renders correct class list (assertion on the joined string).
  - Each variant renders the correct suffix.
  - `class` prop appends last.
  - `as` prop renders the alternative element.
  - `{...rest}` propagates attrs (e.g., `<Button type="submit">` → `<button type="submit">`).
- **Snapshot tests avoided** — same rationale as 3a; markup-level assertions are more explicit.
- **CSS audit consistency**: `tests/css-audit-consistency.test.ts` parses `packages/react/CSS-AUDIT.md` and asserts every variant union in `packages/astro/src/types.ts` matches the doc's suffix lists. Catches drift between the two packages.

### J. Acceptance criteria

1. All 15 components exported from `@domi/astro` with TypeScript types.
2. Default variants produce classes that exist in `components/domi.css` (verified by reading CSS).
3. `npm test` runs the per-component vitest suite; all pass.
4. CSS audit consistency test green — 3b types match `packages/react/CSS-AUDIT.md`.
5. **Library invariant held**: tokens/, components/domi.css, components/primitives/, scripts/runtime/domi*.js, examples/, crates/, templates/, tools/ untouched in the 3b diff.
6. `package.json` (root) unchanged — `"workspaces": ["packages/*"]` already covers `packages/astro/`.
7. `Cargo.lock` stays gitignored.
8. `components/domi.css` pre-existing dirty state preserved (per AGENTS.md).
9. Permissively licensed deps only (`astro` is MIT).
10. README with usage examples and per-component props table (mirror of 3a's README structure, using `.astro` examples).
11. No build step required — `npm test` runs the suite directly against source (the test harness is whatever `@astrojs/component-test` provides, or a small vitest+`node-html-parser` fallback if that package isn't usable; chosen in plan Task 1).

## Open questions (decided in spec self-review)

1. **Naming convention**: `Button` vs `DomButton`. **Bare names** (Button/Card/etc.). Astro has no React collisions; `DomButton` reads awkwardly in `.astro` files.
2. **Build step**: tsup vs source-only. **Source-only.** Astro components can't be compiled to portable JS — consumers' Astro compiler handles them. This matches how `@astrojs/starlight` and most community integrations ship.
3. **CSS audit location**: copy vs reference. **Reference** `packages/react/CSS-AUDIT.md`. Add a consistency test to catch drift. Avoids two human-edited lists that can disagree.
4. **Class-name helper**: 3-line inlined `.filter(Boolean).join(' ')` vs shared util. **Inline.** Same logic as 3a's `cn()` but not worth a separate file or a cross-package import.
5. **`as` prop scope**: same selective list as 3a. **Button/Alert/Badge only.**
6. **Default variants**: derived per-component from CSS audit. Same defaults as 3a (`Button` → `primary`+`lg`, `Input`/`Select` → `lg`, etc.).
7. **CSS class order in joined string**: base → variant → size → user-`class`. User always wins specificity ties. Same as 3a.

## Risks

1. **`@astrojs/component-test` maturity**: as of early 2026 the package is usable but has rough edges. If it's flaky in tests, fall back to a custom vitest harness that parses frontmatter via `node-html-parser` and stringifies the template body. Plan Task 1 picks one based on what works in the runtime.
2. **Astro peer dep range**: `^5.0.0` assumes consumer uses Astro 5+. Astro 6 is on the horizon — bump the peer range in a follow-up if 3b extends into that timeframe. Out of scope for 3b.
3. **Astro `<dialog>` quirks**: `<dialog>` needs `open` attribute for visibility. 3a omits `open` by default; 3b should do the same. Consumer toggles via `<Modal open>` prop. No JS shipped.
4. **Pre-existing dirty `components/domi.css`**: must remain dirty after 3b. Wrapper components reference existing class suffixes; we don't modify CSS. Verification: `rtk git status` shows `components/domi.css` still dirty.
5. **Naming divergence from 3a** (bare vs `Dom` prefix): a future spec might want to standardize. Documented in §B; not a blocker.
6. **Two parallel type surfaces** (`packages/astro/src/types.ts` vs `packages/react/src/primitives/*`): mitigated by the CSS audit consistency test. Drift caught at CI.

## Cross-references

- HTML primitives: `components/primitives/*/index.html` (15 files)
- Canonical CSS: `components/domi.css`
- CSS audit (shared with 3a): `packages/react/CSS-AUDIT.md`
- Tokens: `tokens/tokens.json`
- Wire protocol (orthogonal — Phase 2): `docs/WIRE-PROTOCOL.md`
- AGENTS.md library invariant: `AGENTS.md`
- Phase 3a spec: [`docs/superpowers/specs/2026-07-05-phase3a-react-design.md`](./2026-07-05-phase3a-react-design.md)
- Phase 3a plan: [`docs/superpowers/plans/2026-07-05-phase3a-react-plan.md`](../plans/2026-07-05-phase3a-react-plan.md)
- Phase 3a handoff: [`docs/superpowers/handoffs/2026-07-06-phase3a-react-handoff.md`](../handoffs/2026-07-06-phase3a-react-handoff.md)