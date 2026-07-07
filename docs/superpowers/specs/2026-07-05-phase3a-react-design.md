# Phase 3a — `@domi/react` Design Spec

**Date:** 2026-07-05
**Status:** Draft v1 — pending user review
**Phase:** 3a of Phase 3 (decomposed: 3a `@domi/react`, 3b `@domi/astro`, 3c `domi-dvui`)
**Sibling specs:** none yet (3a is the first)

## Upstream contracts

- **HTML primitives** (canonical): `components/primitives/*.html` — 15 files (button, card, form, input, select, checkbox, radio, table, nav, modal, alert, badge, tabs, toast, tooltip)
- **Design tokens** (canonical): `tokens/tokens.json` (locked palette + spacing) — JS-side wrappers only *reference* CSS that the tokens drive; no token logic in JS
- **CSS** (canonical): `components/domi.css` — variant class suffixes live here (e.g., `.domi-button--primary`); React wrappers never construct class names from JS

## Problem

The 15 HTML primitives work as raw HTML — but most production apps in 2026 don't ship raw HTML; they ship React (or Astro, or Vue, or Svelte). Without a React wrapper layer, users of `@domi/*` must hand-write:

```tsx
<button className="domi-button domi-button--primary" onClick={...}>Click</button>
```

…which means:

1. **No TypeScript autocomplete** for variants — typo `primry` silently breaks styling.
2. **No central place to update variant strings** — if `domi-button--primary` becomes `domi-button--cta` in v2, every consumer must update.
3. **No compile-time guarantee** that a variant even exists in the CSS — drop a typo, no error.
4. **Inconsistency across the ecosystem** — every React user writes a slightly different wrapper.

`@domi/react` solves this by exposing the 15 primitives as typed React components with a uniform variant API.

## Goals

- **15 React components** matching the HTML primitives 1:1.
- **Class-composition API**: `<DomButton variant="primary" size="md" />` builds `class="domi-button domi-button--primary domi-button--md"`.
- **Escape hatches**: `className` (appended last), `...props` spread (all HTML props pass through), `as` prop (render a different element), `ref` forwarding.
- **TypeScript-first**: every prop typed; every variant is a string-literal union mapped 1:1 to a CSS class suffix.
- **Zero runtime dependencies** beyond `react` + `react-dom` (peer deps).
- **Library invariant held**: tokens/, components/domi.css, components/primitives/*.html, scripts/domi.js, scripts/domi-audit.js, examples/ are **untouched** by 3a.
- **CSS is the source of truth**: wrapper components never construct class names from JS. The variants exposed by TypeScript are derived from CSS class suffixes, not invented.

## Non-goals

- **No state machines** — primitives are stateless; state lives in user code or `domi.js`.
- **No a11y wrappers** — primitives already have correct ARIA; wrappers don't override them.
- **No animation helpers** — CSS handles animation; wrappers don't add JS animation.
- **No new design tokens** — `tokens.json` stays canonical; wrappers only *reference* existing CSS classes.
- **No `domi.js` integration** — `domi.js` is a separate runtime concern (Phase 1). 3a only mirrors HTML.
- **No server-side rendering** — components are React-only; SSR lives in 3b (`@domi/astro`).
- **No SSR stylesheet inlining** — Astro handles that (Phase 3b).
- **No cross-framework wrappers in this phase** — `@domi/astro` and `domi-dvui` get their own specs/cycles.

## Design

### A. Package shape

```
packages/react/
  package.json          # name: "@domi/react", peerDeps: react/react-dom
  tsconfig.json         # ESM output, strict mode, JSX react-jsx
  src/
    index.ts            # re-exports all 15 components + types
    primitives/
      button.tsx
      card.tsx
      form.tsx
      input.tsx
      select.tsx
      checkbox.tsx
      radio.tsx
      table.tsx
      nav.tsx
      modal.tsx
      alert.tsx
      badge.tsx
      tabs.tsx
      toast.tsx
      tooltip.tsx
    utils/
      cn.ts             # 3-line className joiner (no classnames/clsx dep)
  tests/
    primitives.test.tsx  # vitest + jsdom
  README.md             # usage examples + per-component props table
```

**Monorepo choice**: stay as a single repo with `packages/react/` subdir, not split to a new repo. Rationale: keeps tokens/components/scripts `AGENTS.md` library invariant intact and lets CI run everything together. Splitting to a separate repo is a future-distribution decision (Phase 4).

**ESM-only**: matches the existing `dominice` package (`"type": "module"` in root `package.json`). CJS consumers can use a bundler.

### B. Component API (the canonical example)

```tsx
// packages/react/src/primitives/button.tsx
import { forwardRef } from 'react';
import { cn } from '../utils/cn';

export type DomButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type DomButtonSize = 'sm' | 'md' | 'lg';

export interface DomButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: DomButtonVariant;
  size?: DomButtonSize;
  className?: string;
}

export const DomButton = forwardRef<HTMLButtonElement, DomButtonProps>(
  ({ variant = 'primary', size = 'md', className, ...props }, ref) => (
    <button
      ref={ref}
      {...props}
      className={cn(
        'domi-button',
        variant && `domi-button--${variant}`,
        size && `domi-button--${size}`,
        className,
      )}
    />
  ),
);
DomButton.displayName = 'DomButton';
```

**Three patterns applied uniformly to all 15 components:**

1. **forwardRef** for ref access to the underlying DOM element.
2. **`Omit<HTMLAttributes, 'className'>`** to allow `className` to be optional and properly typed.
3. **`cn()` joins classes** — appends user's `className` last so it wins specificity ties.

### C. Variant system — derived from CSS, typed in TypeScript

The TypeScript variant unions are **derived from** the CSS class suffixes, not invented independently. Process:

1. Read `components/domi.css`.
2. For each primitive, enumerate the `<prefix>--<variant>` suffixes (e.g., for `domi-button`: `--primary`, `--secondary`, `--ghost`, `--danger`, `--sm`, `--md`, `--lg`).
3. Define the TypeScript union to match exactly.
4. The wrapper's default value is the most-used variant (verified against CSS default — for `domi-button`, that's `primary`).

**This means the wrapper can never expose a variant that doesn't exist in CSS, and CSS can never define a variant that the wrapper doesn't type.** Cross-language drift caught at compile time + caught at lint time.

### D. Escape hatches (in order of power)

1. **`className` prop** — appended last in the class list. Wins specificity ties. Most common use: "I need this button 4px lower for this layout."
2. **`...props` spread** — every standard HTML prop passes through (`onClick`, `onFocus`, `aria-*`, `data-*`, `disabled`, `type`, `name`, `value`, etc.). TypeScript enforces validity via `Omit<HTMLAttributes, 'className'>`.
3. **`as` prop** (selectively, where it makes sense) — render a different element. Example: `<DomButton as="a" href="/somewhere">Link styled as button</DomButton>`. Used on `DomButton`, `DomBadge`, `DomAlert`. Not used on form controls (semantic ambiguity).
4. **`ref` forwarding** — `forwardRef` to the underlying HTML element. Standard React pattern.

### E. `cn()` helper — 3 lines, no deps

```ts
// packages/react/src/utils/cn.ts
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
```

Standard pattern, no third-party dep needed. `classnames`/`clsx` add ~1KB and a transitive dep; not worth it for three lines.

### F. Per-primitive mapping

| Component | HTML element | Variant options | Size options |
|---|---|---|---|
| `DomButton` | `<button>` | `primary` \| `secondary` \| `ghost` \| `danger` | `sm` \| `md` \| `lg` |
| `DomCard` | `<div>` (`.domi-card`) | `flat` \| `elevated` \| `outlined` | — |
| `DomForm` | `<form>` | — | — |
| `DomInput` | `<input>` | `text` \| `email` \| `password` \| `number` \| `search` \| `tel` \| `url` | `sm` \| `md` \| `lg` |
| `DomSelect` | `<select>` | — | `sm` \| `md` \| `lg` |
| `DomCheckbox` | `<input type="checkbox">` | — | `sm` \| `md` \| `lg` |
| `DomRadio` | `<input type="radio">` | — | `sm` \| `md` \| `lg` |
| `DomTable` | `<table>` | `striped` \| `bordered` \| `hover` | — |
| `DomNav` | `<nav>` | `tabs` \| `pills` \| `underline` | — |
| `DomModal` | `<dialog>` | — | `sm` \| `md` \| `lg` \| `xl` |
| `DomAlert` | `<div>` (`.domi-alert`) | `info` \| `success` \| `warning` \| `danger` | — |
| `DomBadge` | `<span>` | `primary` \| `secondary` \| `success` \| `warning` \| `danger` | `sm` \| `md` \| `lg` |
| `DomTabs` | `<div>` (`.domi-tabs`) | `default` \| `pills` \| `underline` | — |
| `DomToast` | `<div>` (`.domi-toast`) | `info` \| `success` \| `warning` \| `danger` | — |
| `DomTooltip` | `<span>` | `top` \| `right` \| `bottom` \| `left` | — |

(Variant/size names above are provisional — the spec commit finalizes them after a complete CSS audit. The TDD commit for each component verifies the exact set exists in CSS.)

### G. Build & publish

- **TypeScript** with strict mode; target `ES2020`; module `ESNext`; `jsx: react-jsx`.
- **Build tool**: `tsup` (zero-config tsc + esbuild bundling). Output: `dist/index.js` (ESM), `dist/index.cjs` (CJS), `dist/index.d.ts` (types).
- **`package.json` exports map**:
  ```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
  ```
- **Peer deps**: `react ^18.0.0`, `react-dom ^18.0.0`.
- **No runtime deps**.

### H. Dependencies (new, all devDependencies)

| Dep | Version | Purpose |
|---|---|---|
| `typescript` | `^5.0` | TS compiler |
| `tsup` | `^8.0` | Build bundler |
| `@types/react` | `^18.0` | React types (devDep — consumers provide React) |
| `@types/react-dom` | `^18.0` | ReactDOM types |

No new runtime deps.

### I. Testing

- **Framework**: `vitest` + `jsdom` (already in repo devDeps).
- **Location**: `packages/react/tests/primitives.test.tsx`.
- **Per component**:
  - Default class output snapshot (e.g., `DomButton` → `domi-button domi-button--primary domi-button--md`).
  - Each variant renders the correct class suffix.
  - `className` prop appends correctly.
  - `...props` spread: e.g., `<DomButton onClick={fn} type="submit" />` passes `type="submit"` to the underlying `<button>`.
  - `forwardRef` works.
- **No `@testing-library/react`** — components are too thin to need a renderer; the existing repo's primitives tests (`tests/primitives/primitives.test.js`) already validate the underlying HTML/CSS.

### J. Naming conventions

- **Components**: `Dom` + PascalCase primitive name (`DomButton`, `DomCard`, ...).
- **Types**: `Dom<Primitive>Props`, `Dom<Primitive>Variant`, `Dom<Primitive>Size`.
- **Files**: lowercase, kebab-case where multi-word (`dom-button.tsx`, `dom-card.tsx`).

Rationale: `Dom` prefix avoids collisions with native HTML (`<button>` vs `<DomButton>`) AND with React-built-ins (`<Form>` exists in some libs; `DomForm` is unambiguous).

### K. Acceptance criteria

1. All 15 components exported from `@domi/react` with TypeScript types.
2. Default variants produce classes that exist in `components/domi.css` (verified by reading CSS).
3. `npm run build` produces `dist/{index.js,index.cjs,index.d.ts}`.
4. `npm test` runs the per-component vitest suite; all pass.
5. **Library invariant held**: tokens/, components/domi.css, components/primitives/, scripts/domi.js, scripts/domi-audit.js, examples/ untouched in the 3a diff.
6. `package.json` (root) updated to add a `workspaces` field including `packages/react`.
7. `Cargo.lock` stays gitignored.
8. `components/domi.css` pre-existing dirty state preserved (per AGENTS.md).
9. Permissively licensed deps only (`tsup` is MIT, `typescript` is Apache-2.0, `@types/*` is MIT).

## Open questions (decided in spec self-review)

1. **`tsup` vs `tsc`**: **tsup** (faster, simpler config). Worth one extra devDep.
2. **Variant enum strictness**: **string-literal unions** (better TS narrowing, zero runtime cost). `as const` arrays add runtime data; unions are erased at runtime.
3. **Default `variant` value**: derived per-component from CSS audit. Some components may have `undefined` as default (caller must specify).
4. **`as` prop availability**: **selective** (DomButton, DomBadge, DomAlert). Not on form controls. Documented per-component.
5. **`displayName` on every component**: yes, for React DevTools clarity.
6. **CSS class generation order**: base → variant → size → user-className. User always wins specificity ties.

## Risks

1. **CSS drift**: if `components/domi.css` adds a new variant the wrapper doesn't know about, the wrapper won't surface it. Mitigation: TDD per component reads CSS first and asserts the wrapper exposes exactly the documented set. Future: a `domi-lint` rule could check.
2. **Monorepo tooling**: root `package.json` needs `workspaces: ["packages/*"]`. The existing `vitest` config must include the new package's tests. Mitigation: small, additive root config changes.
3. **`forwardRef` + TypeScript generic inference**: sometimes flaky for component prop types. Mitigation: explicit `interface Dom<Primitive>Props` per file; avoid inline generic forwarding.
4. **Ref handling on `as` prop**: if `as="a"`, ref must point to `HTMLAnchorElement`, not `HTMLButtonElement`. Mitigation: type the `as` prop's ref via `forwardRef<HTMLButtonElement | HTMLAnchorElement, ...>` and let users cast as needed (rare case).
5. **Pre-existing dirty `components/domi.css`**: must remain dirty after 3a. Wrapper components reference the existing class suffixes; we don't modify the CSS. Verification: `rtk git status` shows `components/domi.css` still dirty.

## Cross-references

- HTML primitives: `components/primitives/*.html` (15 files)
- Canonical CSS: `components/domi.css`
- Tokens: `tokens/tokens.json`
- Wire protocol (orthogonal — Phase 2): `docs/WIRE-PROTOCOL.md`
- Phase 3 decomposition: `.superpowers/sdd/phase3-brainstorm-state.md`
- AGENTS.md library invariant: `AGENTS.md`
- Phase 3a spec (this file): `docs/superpowers/specs/2026-07-05-phase3a-react-design.md`
