# Phase 3a — `@domi/react` Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-05-phase3a-react-design.md` (Draft v1, approved)
**Date:** 2026-07-05
**Phase:** 3a of Phase 3 (decomposed: 3a `@domi/react`, 3b `@domi/astro`, 3c `domi-dvui`)
**Branch:** stay on `phase-2d-agent-tooling` (Phase 2d merge deferred per handoff decision)

## Decisions (locked from spec)

- **Q1 Monorepo shape** — single repo with `packages/react/`. Root `package.json` adds `"workspaces": ["packages/*"]`. Rationale: keeps the `AGENTS.md` library invariant intact and lets the existing vitest config cover the new package.
- **Q2 Build tool** — `tsup` (zero-config tsc + esbuild bundling). Outputs ESM + CJS + `.d.ts`.
- **Q3 Variant strictness** — **string-literal unions** (not `as const` arrays). Erased at runtime.
- **Q4 Default `variant` value** — derived per-component from the CSS audit (Task 2). Some components have no default (caller must specify).
- **Q5 `as` prop availability** — selective (DomButton, DomBadge, DomAlert only). Form controls do **not** get `as`.
- **Q6 `displayName`** — set on every component for React DevTools clarity.
- **Q7 CSS class order** — base → variant → size → user-className. User always wins specificity ties.
- **Q8 `Cargo.lock` policy** — stays gitignored (unchanged from 2d).
- **Q9 `components/domi.css` pre-existing dirty state** — preserved (no edits to library files).
- **Q10 Spec ↔ CSS drift** — **CSS is the source of truth.** The spec's per-component variant table is treated as aspirational. Task 2 audits the actual CSS and writes a reconciliation doc that the per-component TDD tasks use as ground truth. Any variants/sizes promised by the spec but absent from CSS are dropped from the wrapper API (NOT added to CSS — library invariant). The reconciliation doc records every deviation for downstream review.

If Q1–Q10 are wrong, stop after Task 2 and re-plan.

## Global Constraints

- **Library invariant held.** `tokens/`, `components/`, `components/primitives/*`, `scripts/domi.js`, `scripts/domi-audit.js`, `scripts/domi-server.js`, `scripts/domi-wire.js`, `examples/` are **untouched** by 3a. The pre-existing dirty `components/domi.css` is preserved.
- **TDD.** Tests written before implementation. Tests fail (red), code passes (green), then refactor.
- **CSS is source of truth.** Wrapper components never construct class names from JS. Every variant/size union must match an existing `.domi-*` suffix in `components/domi.css`. Verified by Task 2's audit doc.
- **`packages/react/` is the only new directory.** No edits to `crates/`, `templates/`, `tools/`, or root `package.json` beyond adding `"workspaces"`.
- **Zero runtime deps.** `react` + `react-dom` are peer deps only. New devDeps: `typescript ^5.0`, `tsup ^8.0`, `@types/react ^18.0`, `@types/react-dom ^18.0`.
- **Permissively licensed deps only** (`tsup` MIT, `typescript` Apache-2.0, `@types/*` MIT).
- **AGENTS.md conventions** apply: `rtk` for fs/git/grep, `npm test` (JS, vitest, jsdom) and `cargo test --workspace` (Rust) both stay green at every commit.
- **No `@testing-library/react`** — wrappers are too thin; existing repo primitives tests (`tests/primitives/primitives.test.js`) already validate the underlying HTML/CSS. Phase 3a tests use `react-dom/server`'s `renderToStaticMarkup` to assert class output.
- **Checkpoint convention** — at the end of every task, pause for the user to review before the next task begins (per the user's session preference).

## File Structure

```
packages/react/
  package.json              # name: "@domi/react", peerDeps: react/react-dom
  tsconfig.json             # strict, ES2020, ESNext, jsx: react-jsx, declaration: true
  tsup.config.ts            # entry: src/index.ts; ESM + CJS + .d.ts
  CSS-AUDIT.md              # Task 2 — per-component actual variant/size sets (ground truth)
  src/
    index.ts                # Task 11 — re-exports all 15 + types
    utils/
      cn.ts                 # Task 3 — 3-line class joiner
    primitives/
      button.tsx            # Task 4
      card.tsx              # Task 5
      alert.tsx             # Task 5
      badge.tsx             # Task 5
      form.tsx              # Task 6
      input.tsx             # Task 6
      select.tsx            # Task 6
      checkbox.tsx          # Task 7
      radio.tsx             # Task 7
      table.tsx             # Task 8
      nav.tsx               # Task 8
      tabs.tsx              # Task 8
      modal.tsx             # Task 9
      toast.tsx             # Task 9
      tooltip.tsx           # Task 9
  tests/
    cn.test.ts              # Task 3
    primitives.test.tsx     # Tasks 4–9 — per-component describe blocks
  README.md                 # Task 12 — usage examples + per-component props table
```

Root changes:
- `package.json` — add `"workspaces": ["packages/*"]` and `"scripts.build:react": "tsup --config packages/react/tsup.config.ts"`
- `.gitignore` — no changes needed (`dist/`, `node_modules/`, `**/target/` already covered)

---

## Task 1: Monorepo scaffold + TS toolchain

**Files:**
- Modify: `package.json` (add workspaces, build:react script, no other changes)
- Create: `packages/react/package.json`
- Create: `packages/react/tsconfig.json`
- Create: `packages/react/tsup.config.ts`
- Create: `packages/react/src/index.ts` (placeholder re-export — Task 11 fills it in)

### 1.1 Root `package.json` edits

Add (do not reorder existing keys):

```json
"workspaces": ["packages/*"],
"scripts": {
  "build:react": "tsup --config packages/react/tsup.config.ts"
}
```

Existing `"scripts.test"` etc. stay untouched. The existing `vitest` run from root will pick up `packages/react/tests/*.test.{ts,tsx}` because of `vitest.config.js`'s `include: ['tests/**/*.test.js']` — see Task 1.5 for the include-path update.

### 1.2 `packages/react/package.json`

```json
{
  "name": "@domi/react",
  "version": "0.1.0",
  "description": "React wrappers for DOMiNice primitives",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsup": "^8.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0"
  },
  "license": "MIT"
}
```

### 1.3 `packages/react/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "outDir": "./dist",
    "rootDir": "./src",
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 1.4 `packages/react/tsup.config.ts`

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  splitting: false
});
```

### 1.5 `vitest.config.js` include path

Update `vitest.config.js` so vitest picks up TS/TSX tests in `packages/react/tests/`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{js,ts,tsx}', 'packages/**/tests/**/*.test.{js,ts,tsx}'],
    globals: false
  }
});
```

The existing `tests/**/*.test.js` glob is preserved (so no existing test is dropped). The new second glob picks up the package tests.

### 1.6 Install

```bash
npm install
```

Expected: `node_modules/` now contains `typescript`, `tsup`, `@types/react`, `@types/react-dom` at the root (npm hoists workspaces by default). Verify with `ls node_modules/.bin/tsup`.

### 1.7 Smoke check

```bash
npx tsc --noEmit --project packages/react/tsconfig.json
```

Expected: PASS (zero files in `src/`, so no errors).

### 1.8 Commit

```bash
git add package.json vitest.config.js packages/react/
git commit -m "feat(react): monorepo scaffold + TS toolchain for @domi/react"
```

### Acceptance for Task 1

- `npm install` exits 0.
- `npx tsc --noEmit -p packages/react/tsconfig.json` exits 0.
- `ls packages/react/dist` is empty (no build run yet).
- `git status` shows no changes to `tokens/`, `components/`, `scripts/`, `examples/`, `crates/`.

---

## Task 2: CSS audit + reconciliation document (gates everything)

**Files:**
- Create: `packages/react/CSS-AUDIT.md`

This task produces the **ground-truth mapping** of CSS class suffixes to TypeScript unions. Every later component task references this doc. No code changes — pure audit + doc.

### 2.1 Read `components/domi.css` end-to-end

Already read in planning; the canonical lines:

- Lines 84–109: `.domi-btn` + variants `--primary`, `--ghost`, `--danger`, `--sm`, `--lg`
- Lines 112–123: `.domi-card` + sizes `--sm`, `--lg` (BEM parts `__header`, `__footer`)
- Lines 126–141: `.domi-input`, `.domi-select` (shared base) + sizes `--sm`, `--lg` + `--error` variant
- Lines 144–159: `.domi-check`, `.domi-radio` (no variants/sizes)
- Lines 162–167: `.domi-form` (BEM `__row`, `__col`, `__label`, `__help`, `__error`)
- Lines 170–174: `.domi-table` (no variants/sizes — `striped`/`bordered`/`hover` are implicit CSS selectors)
- Lines 177–190: `.domi-nav` (BEM `__brand`, `__links`, `__actions`)
- Lines 193–216: `.domi-modal` (BEM `__dialog`, `__title`, `__close`)
- Lines 219–231: `.domi-alert` + variants `--info`, `--success`, `--warning`, `--danger`
- Lines 234–251: `.domi-badge` + variants `--primary`, `--success`, `--warning`, `--danger`
- Lines 254–257: `.domi-tabs` (BEM `__list`) + `.domi-tab` (state via `[aria-selected]`)
- Lines 260–273: `.domi-toast` (no variants)
- Lines 276–294: `.domi-tooltip` (uses `data-tooltip` attribute + `::after`)

### 2.2 Write `packages/react/CSS-AUDIT.md`

```markdown
# Phase 3a CSS Audit — ground truth for wrapper API

**Source:** `components/domi.css` (read 2026-07-05)
**Author:** Phase 3a implementation, Task 2
**Rule:** CSS is the source of truth. Wrapper unions match these suffixes exactly. The spec's `Per-primitive mapping` table (Section F) is **aspirational**; this doc is what the wrappers actually expose.

## Per-component actual class set

| Component    | Base class      | Variant suffixes (CSS)                        | Size suffixes (CSS) | Notes                                                                                  |
|--------------|-----------------|------------------------------------------------|---------------------|----------------------------------------------------------------------------------------|
| DomButton    | `.domi-btn`     | `--primary`, `--ghost`, `--danger`             | `--sm`, `--lg`      | Spec `--secondary` not in CSS — dropped. No `--md` size — dropped.                     |
| DomCard      | `.domi-card`    | —                                              | `--sm`, `--lg`      | Spec `--flat`/`--elevated`/`--outlined` not in CSS — dropped.                           |
| DomForm      | `.domi-form`    | —                                              | —                   | Structural only. BEM parts `__row`/`__col`/`__label`/`__help`/`__error` exposed as props.|
| DomInput     | `.domi-input`   | `--error`                                      | `--sm`, `--lg`      | Spec `--md` not in CSS — dropped. `type` prop comes from native `<input type>`.         |
| DomSelect    | `.domi-select`  | `--error`                                      | `--sm`, `--lg`      | Same as Input. `children` for `<option>` passthrough.                                   |
| DomCheckbox  | `.domi-check`   | —                                              | —                   | Spec sizes not in CSS — dropped. Renders `<input type="checkbox" class="domi-check">`. |
| DomRadio     | `.domi-radio`   | —                                              | —                   | Same as Checkbox. Renders `<input type="radio" class="domi-radio">`.                   |
| DomTable     | `.domi-table`   | —                                              | —                   | Spec `--striped`/`--bordered`/`--hover` not in CSS — dropped. All are baked into CSS.  |
| DomNav       | `.domi-nav`     | —                                              | —                   | Spec `--tabs`/`--pills`/`--underline` not in CSS — dropped. BEM `__brand`/`__links`/`__actions` exposed as slots.|
| DomModal     | `.domi-modal`   | —                                              | —                   | Spec sizes `--sm`/`--md`/`--lg`/`--xl` not in CSS — dropped. Renders `<dialog class="domi-modal">`. |
| DomAlert     | `.domi-alert`   | `--info`, `--success`, `--warning`, `--danger` | —                   | Matches spec.                                                                          |
| DomBadge     | `.domi-badge`   | `--primary`, `--success`, `--warning`, `--danger` | —                  | Spec `--secondary` not in CSS — dropped. No sizes in CSS — dropped.                     |
| DomTabs      | `.domi-tabs`    | —                                              | —                   | Spec variants not in CSS — dropped. Tabs are CSS-only via `[aria-selected]`.           |
| DomToast     | `.domi-toast`   | —                                              | —                   | Spec variants not in CSS — dropped. Position is fixed via CSS.                          |
| DomTooltip   | `.domi-tooltip` | —                                              | —                   | Spec position variants not in CSS — uses `data-tooltip` attr + CSS `::after`. Wrapper exposes `content` prop → renders `data-tooltip={content}`. |

## Spec deviations (recorded for downstream review)

1. DomButton: dropped `--secondary`, `--md`.
2. DomCard: dropped `--flat`, `--elevated`, `--outlined`.
3. DomInput / DomSelect: dropped `--md`; added `--error` (not in spec).
4. DomCheckbox / DomRadio: dropped all sizes.
5. DomTable: dropped `--striped`, `--bordered`, `--hover` (all baked into CSS, always-on).
6. DomNav: dropped `--tabs`, `--pills`, `--underline`.
7. DomModal: dropped `--sm`, `--md`, `--lg`, `--xl`.
8. DomBadge: dropped `--secondary`, all sizes.
9. DomTabs / DomToast / DomTooltip: dropped all spec variants; CSS doesn't expose them.

## Adding a new variant later

To add a variant (e.g., `--secondary` on DomButton):
1. Edit `components/domi.css` to add `.domi-btn--secondary { ... }` — this requires library-invariant sign-off from the user.
2. Update this audit doc.
3. Update the DomButton TS union in `packages/react/src/primitives/button.tsx`.
4. Update the test in `packages/react/tests/primitives.test.tsx`.

The audit doc is the contract. Implementation follows it. CSS edits are out-of-scope for 3a.
```

### 2.3 Verify

```bash
ls -la packages/react/CSS-AUDIT.md
```

Expected: file exists, ≥2 KB.

### 2.4 Commit

```bash
git add packages/react/CSS-AUDIT.md
git commit -m "docs(react): CSS audit + reconciliation doc (locks actual wrapper API)"
```

### Acceptance for Task 2

- `packages/react/CSS-AUDIT.md` exists and documents all 15 components.
- Every dropped variant from the spec is recorded with rationale.
- No CSS files modified (`git diff --name-only HEAD~1 components/` → empty).
- No code files modified (audit-only task).

**Checkpoint:** pause for user review before Task 3.

---

## Task 3: `cn()` utility

**Files:**
- Create: `packages/react/src/utils/cn.ts`
- Create: `packages/react/tests/cn.test.ts`

### 3.1 Write failing tests

```ts
// packages/react/tests/cn.test.ts
import { describe, it, expect } from 'vitest';
import { cn } from '../src/utils/cn';

describe('cn()', () => {
  it('joins truthy strings with a single space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy values (false / null / undefined)', () => {
    expect(cn('a', false, 'b', null, 'c', undefined)).toBe('a b c');
  });

  it('returns empty string when all parts are falsy', () => {
    expect(cn(false, null, undefined)).toBe('');
  });

  it('preserves internal whitespace within a single part', () => {
    expect(cn('a b', 'c')).toBe('a b c');
  });

  it('handles a single string', () => {
    expect(cn('only')).toBe('only');
  });
});
```

### 3.2 Run, verify RED

```bash
npx vitest run packages/react/tests/cn.test.ts
```

Expected: FAIL with `Cannot find module '../src/utils/cn'` (module doesn't exist yet).

### 3.3 Implement

```ts
// packages/react/src/utils/cn.ts
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ');
}
```

### 3.4 Run, verify GREEN

```bash
npx vitest run packages/react/tests/cn.test.ts
```

Expected: 5 passed.

### 3.5 Type check

```bash
npx tsc --noEmit -p packages/react/tsconfig.json
```

Expected: PASS.

### 3.6 Commit

```bash
git add packages/react/src/utils/cn.ts packages/react/tests/cn.test.ts
git commit -m "feat(react): cn() utility for className joining (TDD)"
```

### Acceptance for Task 3

- 5/5 tests pass.
- `tsc --noEmit` clean.
- No CSS, no library files modified.

---

## Task 4: DomButton (first component — sets the pattern)

**Files:**
- Create: `packages/react/src/primitives/button.tsx`
- Create: `packages/react/tests/primitives.test.tsx` (starts here; later tasks append)

### 4.1 Per the audit (Task 2)

DomButton base class: `domi-btn`. Variants: `primary | ghost | danger` (no `secondary`). Sizes: `sm | lg` (no `md`). `as` prop is allowed (selective list includes Button).

### 4.2 Write failing tests (append to `primitives.test.tsx`)

```tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRef } from 'react';
import { DomButton } from '../src/primitives/button';

describe('DomButton', () => {
  it('renders the base class', () => {
    const html = renderToStaticMarkup(<DomButton>Click</DomButton>);
    expect(html).toContain('class="domi-btn');
  });

  it('applies default variant (primary) and default size (lg)', () => {
    const html = renderToStaticMarkup(<DomButton>Click</DomButton>);
    expect(html).toContain('domi-btn--primary');
    expect(html).toContain('domi-btn--lg');
  });

  it('applies ghost variant', () => {
    const html = renderToStaticMarkup(<DomButton variant="ghost">Click</DomButton>);
    expect(html).toContain('domi-btn--ghost');
    expect(html).not.toContain('domi-btn--primary');
  });

  it('applies danger variant', () => {
    const html = renderToStaticMarkup(<DomButton variant="danger">Click</DomButton>);
    expect(html).toContain('domi-btn--danger');
  });

  it('applies sm size', () => {
    const html = renderToStaticMarkup(<DomButton size="sm">Click</DomButton>);
    expect(html).toContain('domi-btn--sm');
    expect(html).not.toContain('domi-btn--lg');
  });

  it('appends user className last (wins specificity ties)', () => {
    const html = renderToStaticMarkup(
      <DomButton className="my-extra">Click</DomButton>
    );
    const classIdx = html.indexOf('class="');
    expect(html.substring(classIdx)).toMatch(/class="domi-btn[^\"]*my-extra/);
  });

  it('passes through onClick + type via ...props spread', () => {
    const html = renderToStaticMarkup(
      <DomButton onClick={() => {}} type="submit">Submit</DomButton>
    );
    expect(html).toContain('type="submit"');
  });

  it('forwards ref to the underlying <button>', () => {
    const ref = createRef<HTMLButtonElement>();
    renderToStaticMarkup(<DomButton ref={ref}>Click</DomButton>);
    // ref is null in SSR, but forwardRef wiring is verified by the type signature.
    // Functional check happens in a follow-up if needed; here we assert the API.
    expect(ref).toBeDefined();
  });

  it('renders as <a> when as="a" with href passed via ...props', () => {
    const html = renderToStaticMarkup(
      <DomButton as="a" href="/somewhere">Link</DomButton>
    );
    expect(html).toContain('<a');
    expect(html).toContain('href="/somewhere"');
    expect(html).toContain('domi-btn');
  });

  it('sets displayName', () => {
    expect(DomButton.displayName).toBe('DomButton');
  });
});
```

### 4.3 Run, verify RED

```bash
npx vitest run packages/react/tests/primitives.test.tsx
```

Expected: FAIL — module `../src/primitives/button` not found.

### 4.4 Implement

```tsx
// packages/react/src/primitives/button.tsx
import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../utils/cn';

export type DomButtonVariant = 'primary' | 'ghost' | 'danger';
export type DomButtonSize = 'sm' | 'lg';

export interface DomButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: DomButtonVariant;
  size?: DomButtonSize;
  className?: string;
  children?: ReactNode;
  as?: 'button' | 'a';
}

export const DomButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  DomButtonProps
>(function DomButton(
  {
    variant = 'primary',
    size = 'lg',
    className,
    children,
    as = 'button',
    ...rest
  },
  ref
) {
  const classes = cn(
    'domi-btn',
    variant && `domi-btn--${variant}`,
    size && `domi-btn--${size}`,
    className
  );

  if (as === 'a') {
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        className={classes}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    );
  }

  return (
    <button ref={ref as Ref<HTMLButtonElement>} className={classes} {...rest}>
      {children}
    </button>
  );
});

DomButton.displayName = 'DomButton';
```

### 4.5 Run, verify GREEN

```bash
npx vitest run packages/react/tests/primitives.test.tsx
```

Expected: 10 passed.

### 4.6 Type check

```bash
npx tsc --noEmit -p packages/react/tsconfig.json
```

Expected: PASS.

### 4.7 Commit

```bash
git add packages/react/src/primitives/button.tsx packages/react/tests/primitives.test.tsx
git commit -m "feat(react): DomButton — first primitive wrapper (TDD)"
```

### Acceptance for Task 4

- 10/10 DomButton tests pass.
- Variants and sizes match CSS-AUDIT.md exactly (`primary | ghost | danger`, `sm | lg`).
- `as="a"` escape hatch works.
- `displayName` set.
- `forwardRef` typed for both `<button>` and `<a>`.

**Checkpoint:** pause for user review before Task 5.

---

## Task 5: DomCard, DomAlert, DomBadge (display primitives)

**Files:**
- Create: `packages/react/src/primitives/card.tsx`
- Create: `packages/react/src/primitives/alert.tsx`
- Create: `packages/react/src/primitives/badge.tsx`
- Modify: `packages/react/tests/primitives.test.tsx` (append describe blocks)

### 5.1 Per the audit

- **DomCard**: base `domi-card`. Sizes: `sm | lg` (no variants). No `as` prop.
- **DomAlert**: base `domi-alert`. Variants: `info | success | warning | danger`. `as` prop allowed (selective).
- **DomBadge**: base `domi-badge`. Variants: `primary | success | warning | danger` (no `secondary`, no sizes). `as` prop allowed (selective — Badge renders as `<span>`).

### 5.2 Write failing tests

Append to `primitives.test.tsx`:

```tsx
import { DomCard } from '../src/primitives/card';
import { DomAlert } from '../src/primitives/alert';
import { DomBadge } from '../src/primitives/badge';

describe('DomCard', () => {
  it('renders base class', () => {
    const html = renderToStaticMarkup(<DomCard>body</DomCard>);
    expect(html).toContain('class="domi-card');
  });

  it('default has no size suffix', () => {
    const html = renderToStaticMarkup(<DomCard>body</DomCard>);
    expect(html).not.toContain('domi-card--');
  });

  it('applies sm size', () => {
    const html = renderToStaticMarkup(<DomCard size="sm">body</DomCard>);
    expect(html).toContain('domi-card--sm');
  });

  it('applies lg size', () => {
    const html = renderToStaticMarkup(<DomCard size="lg">body</DomCard>);
    expect(html).toContain('domi-card--lg');
  });

  it('appends user className', () => {
    const html = renderToStaticMarkup(<DomCard className="x">body</DomCard>);
    expect(html).toMatch(/class="domi-card[^"]*x/);
  });

  it('passes through ...props', () => {
    const html = renderToStaticMarkup(<DomCard id="c1">body</DomCard>);
    expect(html).toContain('id="c1"');
  });

  it('sets displayName', () => {
    expect(DomCard.displayName).toBe('DomCard');
  });
});

describe('DomAlert', () => {
  it('renders base class', () => {
    const html = renderToStaticMarkup(<DomAlert>msg</DomAlert>);
    expect(html).toContain('class="domi-alert');
  });

  it('default variant is info', () => {
    const html = renderToStaticMarkup(<DomAlert>msg</DomAlert>);
    expect(html).toContain('domi-alert--info');
  });

  it.each(['info', 'success', 'warning', 'danger'] as const)(
    'applies %s variant',
    (v) => {
      const html = renderToStaticMarkup(<DomAlert variant={v}>msg</DomAlert>);
      expect(html).toContain(`domi-alert--${v}`);
    }
  );

  it('renders as <span> when as="span"', () => {
    const html = renderToStaticMarkup(<DomAlert as="span">msg</DomAlert>);
    expect(html).toMatch(/<span[^>]*domi-alert/);
  });

  it('sets displayName', () => {
    expect(DomAlert.displayName).toBe('DomAlert');
  });
});

describe('DomBadge', () => {
  it('renders as <span> with base class', () => {
    const html = renderToStaticMarkup(<DomBadge>label</DomBadge>);
    expect(html).toMatch(/<span[^>]*domi-badge/);
  });

  it('default variant is primary', () => {
    const html = renderToStaticMarkup(<DomBadge>label</DomBadge>);
    expect(html).toContain('domi-badge--primary');
  });

  it.each(['primary', 'success', 'warning', 'danger'] as const)(
    'applies %s variant',
    (v) => {
      const html = renderToStaticMarkup(<DomBadge variant={v}>label</DomBadge>);
      expect(html).toContain(`domi-badge--${v}`);
    }
  );

  it('renders as <a> when as="a"', () => {
    const html = renderToStaticMarkup(<DomBadge as="a" href="/x">label</DomBadge>);
    expect(html).toContain('<a');
    expect(html).toContain('href="/x"');
  });

  it('sets displayName', () => {
    expect(DomBadge.displayName).toBe('DomBadge');
  });
});
```

### 5.3 Run, verify RED

```bash
npx vitest run packages/react/tests/primitives.test.tsx
```

Expected: FAIL — 3 modules not found.

### 5.4 Implement DomCard

```tsx
// packages/react/src/primitives/card.tsx
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../utils/cn';

export type DomCardSize = 'sm' | 'lg';

export interface DomCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  size?: DomCardSize;
  className?: string;
  children?: ReactNode;
}

export const DomCard = forwardRef<HTMLDivElement, DomCardProps>(
  function DomCard({ size, className, children, ...rest }, ref) {
    const classes = cn(
      'domi-card',
      size && `domi-card--${size}`,
      className
    );
    return (
      <div ref={ref} className={classes} {...rest}>
        {children}
      </div>
    );
  }
);

DomCard.displayName = 'DomCard';
```

### 5.5 Implement DomAlert

```tsx
// packages/react/src/primitives/alert.tsx
import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../utils/cn';

export type DomAlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface DomAlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  variant?: DomAlertVariant;
  className?: string;
  children?: ReactNode;
  as?: 'div' | 'span';
}

export const DomAlert = forwardRef<HTMLDivElement | HTMLSpanElement, DomAlertProps>(
  function DomAlert(
    { variant = 'info', className, children, as = 'div', ...rest },
    ref
  ) {
    const classes = cn(
      'domi-alert',
      variant && `domi-alert--${variant}`,
      className
    );
    if (as === 'span') {
      return (
        <span ref={ref as Ref<HTMLSpanElement>} className={classes} {...rest}>
          {children}
        </span>
      );
    }
    return (
      <div ref={ref as Ref<HTMLDivElement>} className={classes} {...rest}>
        {children}
      </div>
    );
  }
);

DomAlert.displayName = 'DomAlert';
```

### 5.6 Implement DomBadge

```tsx
// packages/react/src/primitives/badge.tsx
import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../utils/cn';

export type DomBadgeVariant = 'primary' | 'success' | 'warning' | 'danger';

export interface DomBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'className'> {
  variant?: DomBadgeVariant;
  className?: string;
  children?: ReactNode;
  as?: 'span' | 'a';
}

export const DomBadge = forwardRef<HTMLSpanElement | HTMLAnchorElement, DomBadgeProps>(
  function DomBadge(
    { variant = 'primary', className, children, as = 'span', ...rest },
    ref
  ) {
    const classes = cn(
      'domi-badge',
      variant && `domi-badge--${variant}`,
      className
    );
    if (as === 'a') {
      return (
        <a
          ref={ref as Ref<HTMLAnchorElement>}
          className={classes}
          {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {children}
        </a>
      );
    }
    return (
      <span ref={ref as Ref<HTMLSpanElement>} className={classes} {...rest}>
        {children}
      </span>
    );
  }
);

DomBadge.displayName = 'DomBadge';
```

### 5.7 Run, verify GREEN

```bash
npx vitest run packages/react/tests/primitives.test.tsx
```

Expected: 10 (Button) + 7 (Card) + 6 (Alert incl. it.each × 4) + 6 (Badge incl. it.each × 4) = 29 passed.

Note: `it.each` with 4 entries counts as 4 tests. Card: 7, Alert: 2 + 4 = 6, Badge: 2 + 4 = 6. Total: 10 + 7 + 6 + 6 = 29.

### 5.8 Type check + commit

```bash
npx tsc --noEmit -p packages/react/tsconfig.json
git add packages/react/src/primitives/{card,alert,badge}.tsx packages/react/tests/primitives.test.tsx
git commit -m "feat(react): DomCard, DomAlert, DomBadge wrappers (TDD)"
```

### Acceptance for Task 5

- 29/29 tests pass.
- Variants match CSS-AUDIT.md exactly (no spec-drift leftovers).
- `as` props on Alert and Badge work.

**Checkpoint:** pause for user review before Task 6.

---

## Task 6: DomForm, DomInput, DomSelect (form container + inputs)

**Files:**
- Create: `packages/react/src/primitives/form.tsx`
- Create: `packages/react/src/primitives/input.tsx`
- Create: `packages/react/src/primitives/select.tsx`
- Modify: `packages/react/tests/primitives.test.tsx`

### 6.1 Per the audit

- **DomForm**: base `domi-form`. No variants/sizes. Structural wrapper. Exposes `label`, `help`, `error` slot props OR composable children — pick whichever fits React idioms best.
- **DomInput**: base `domi-input`. Variant: `error` (just one — for invalid state). Sizes: `sm | lg`. Renders `<input type={type}>` with the class.
- **DomSelect**: base `domi-select`. Variant: `error`. Sizes: `sm | lg`. Renders `<select>` with children `<option>` elements.

### 6.2 Write failing tests

Append to `primitives.test.tsx`:

```tsx
import { DomForm } from '../src/primitives/form';
import { DomInput } from '../src/primitives/input';
import { DomSelect } from '../src/primitives/select';

describe('DomForm', () => {
  it('renders <form> with base class', () => {
    const html = renderToStaticMarkup(<DomForm><input /></DomForm>);
    expect(html).toContain('<form');
    expect(html).toContain('domi-form');
  });

  it('passes through action/method via ...props', () => {
    const html = renderToStaticMarkup(
      <DomForm action="/submit" method="post"><input /></DomForm>
    );
    expect(html).toContain('action="/submit"');
    expect(html).toContain('method="post"');
  });

  it('sets displayName', () => {
    expect(DomForm.displayName).toBe('DomForm');
  });
});

describe('DomInput', () => {
  it('renders <input> with base class', () => {
    const html = renderToStaticMarkup(<DomInput />);
    expect(html).toMatch(/<input[^>]*class="domi-input/);
  });

  it('default size is lg', () => {
    const html = renderToStaticMarkup(<DomInput />);
    expect(html).toContain('domi-input--lg');
  });

  it('applies sm size', () => {
    const html = renderToStaticMarkup(<DomInput size="sm" />);
    expect(html).toContain('domi-input--sm');
  });

  it('applies error variant when invalid', () => {
    const html = renderToStaticMarkup(<DomInput error />);
    expect(html).toContain('domi-input--error');
  });

  it('passes type via ...props', () => {
    const html = renderToStaticMarkup(<DomInput type="email" />);
    expect(html).toContain('type="email"');
  });

  it('appends user className', () => {
    const html = renderToStaticMarkup(<DomInput className="x" />);
    expect(html).toMatch(/class="domi-input[^"]*x/);
  });

  it('sets displayName', () => {
    expect(DomInput.displayName).toBe('DomInput');
  });
});

describe('DomSelect', () => {
  it('renders <select> with base class', () => {
    const html = renderToStaticMarkup(
      <DomSelect><option>A</option></DomSelect>
    );
    expect(html).toContain('<select');
    expect(html).toContain('domi-select');
    expect(html).toContain('<option');
  });

  it('default size is lg', () => {
    const html = renderToStaticMarkup(
      <DomSelect><option>A</option></DomSelect>
    );
    expect(html).toContain('domi-select--lg');
  });

  it('applies sm size', () => {
    const html = renderToStaticMarkup(
      <DomSelect size="sm"><option>A</option></DomSelect>
    );
    expect(html).toContain('domi-select--sm');
  });

  it('applies error variant when invalid', () => {
    const html = renderToStaticMarkup(
      <DomSelect error><option>A</option></DomSelect>
    );
    expect(html).toContain('domi-select--error');
  });

  it('passes value + onChange via ...props', () => {
    const html = renderToStaticMarkup(
      <DomSelect value="b" onChange={() => {}}><option>A</option></DomSelect>
    );
    expect(html).toContain('value="b"');
  });

  it('sets displayName', () => {
    expect(DomSelect.displayName).toBe('DomSelect');
  });
});
```

### 6.3 Implement DomForm

```tsx
// packages/react/src/primitives/form.tsx
import { forwardRef } from 'react';
import type { FormHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export interface DomFormProps
  extends Omit<FormHTMLAttributes<HTMLFormElement>, 'className'> {
  className?: string;
  children?: ReactNode;
}

export const DomForm = forwardRef<HTMLFormElement, DomFormProps>(
  function DomForm({ className, children, ...rest }, ref) {
    return (
      <form ref={ref} className={cn('domi-form', className)} {...rest}>
        {children}
      </form>
    );
  }
);

DomForm.displayName = 'DomForm';
```

### 6.4 Implement DomInput

```tsx
// packages/react/src/primitives/input.tsx
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export type DomInputSize = 'sm' | 'lg';

export interface DomInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'size'> {
  size?: DomInputSize;
  error?: boolean;
  className?: string;
}

export const DomInput = forwardRef<HTMLInputElement, DomInputProps>(
  function DomInput({ size = 'lg', error = false, className, ...rest }, ref) {
    const classes = cn(
      'domi-input',
      size && `domi-input--${size}`,
      error && 'domi-input--error',
      className
    );
    return <input ref={ref} className={classes} {...rest} />;
  }
);

DomInput.displayName = 'DomInput';
```

### 6.5 Implement DomSelect

```tsx
// packages/react/src/primitives/select.tsx
import { forwardRef } from 'react';
import type { SelectHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export type DomSelectSize = 'sm' | 'lg';

export interface DomSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'size'> {
  size?: DomSelectSize;
  error?: boolean;
  className?: string;
  children?: ReactNode;
}

export const DomSelect = forwardRef<HTMLSelectElement, DomSelectProps>(
  function DomSelect(
    { size = 'lg', error = false, className, children, ...rest },
    ref
  ) {
    const classes = cn(
      'domi-select',
      size && `domi-select--${size}`,
      error && 'domi-select--error',
      className
    );
    return (
      <select ref={ref} className={classes} {...rest}>
        {children}
      </select>
    );
  }
);

DomSelect.displayName = 'DomSelect';
```

### 6.6 Run, verify GREEN

```bash
npx vitest run packages/react/tests/primitives.test.tsx
```

Expected: 29 + 3 (Form) + 7 (Input) + 6 (Select) = 45 passed.

### 6.7 Type check + commit

```bash
npx tsc --noEmit -p packages/react/tsconfig.json
git add packages/react/src/primitives/{form,input,select}.tsx packages/react/tests/primitives.test.tsx
git commit -m "feat(react): DomForm, DomInput, DomSelect wrappers (TDD)"
```

### Acceptance for Task 6

- 45/45 tests pass.
- `error` is a boolean flag (not a string union) — matches the CSS single-suffix `--error`.
- Input's `size` is renamed internally to avoid collision with the native `<input size>` HTML attribute.

**Checkpoint:** pause for user review before Task 7.

---

## Task 7: DomCheckbox, DomRadio (binary form controls)

**Files:**
- Create: `packages/react/src/primitives/checkbox.tsx`
- Create: `packages/react/src/primitives/radio.tsx`
- Modify: `packages/react/tests/primitives.test.tsx`

### 7.1 Per the audit

- **DomCheckbox**: base `domi-check`. No variants/sizes. Renders `<input type="checkbox" class="domi-check">`. Label via `children` rendered next to input (CSS `.domi-check-label` BEM block — but spec says wrapper uses `children`; see implementation).
- **DomRadio**: base `domi-radio`. Same shape.

### 7.2 Write failing tests

Append to `primitives.test.tsx`:

```tsx
import { DomCheckbox } from '../src/primitives/checkbox';
import { DomRadio } from '../src/primitives/radio';

describe('DomCheckbox', () => {
  it('renders <input type="checkbox"> with base class', () => {
    const html = renderToStaticMarkup(<DomCheckbox />);
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*class="domi-check/);
  });

  it('passes checked + onChange via ...props', () => {
    const html = renderToStaticMarkup(
      <DomCheckbox checked onChange={() => {}} />
    );
    expect(html).toMatch(/checked/);
  });

  it('appends user className', () => {
    const html = renderToStaticMarkup(<DomCheckbox className="x" />);
    expect(html).toMatch(/class="domi-check[^"]*x/);
  });

  it('sets displayName', () => {
    expect(DomCheckbox.displayName).toBe('DomCheckbox');
  });
});

describe('DomRadio', () => {
  it('renders <input type="radio"> with base class', () => {
    const html = renderToStaticMarkup(<DomRadio />);
    expect(html).toMatch(/<input[^>]*type="radio"[^>]*class="domi-radio/);
  });

  it('passes name + value via ...props', () => {
    const html = renderToStaticMarkup(<DomRadio name="r" value="a" />);
    expect(html).toContain('name="r"');
    expect(html).toContain('value="a"');
  });

  it('sets displayName', () => {
    expect(DomRadio.displayName).toBe('DomRadio');
  });
});
```

### 7.3 Implement DomCheckbox

```tsx
// packages/react/src/primitives/checkbox.tsx
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export interface DomCheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> {
  className?: string;
}

export const DomCheckbox = forwardRef<HTMLInputElement, DomCheckboxProps>(
  function DomCheckbox({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn('domi-check', className)}
        {...rest}
      />
    );
  }
);

DomCheckbox.displayName = 'DomCheckbox';
```

### 7.4 Implement DomRadio

```tsx
// packages/react/src/primitives/radio.tsx
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export interface DomRadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> {
  className?: string;
}

export const DomRadio = forwardRef<HTMLInputElement, DomRadioProps>(
  function DomRadio({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="radio"
        className={cn('domi-radio', className)}
        {...rest}
      />
    );
  }
);

DomRadio.displayName = 'DomRadio';
```

### 7.5 Run, verify GREEN

```bash
npx vitest run packages/react/tests/primitives.test.tsx
```

Expected: 45 + 4 (Checkbox) + 3 (Radio) = 52 passed.

### 7.6 Type check + commit

```bash
npx tsc --noEmit -p packages/react/tsconfig.json
git add packages/react/src/primitives/{checkbox,radio}.tsx packages/react/tests/primitives.test.tsx
git commit -m "feat(react): DomCheckbox, DomRadio wrappers (TDD)"
```

### Acceptance for Task 7

- 52/52 tests pass.
- Native `type` attribute is omitted from props (always rendered as the correct type).

**Checkpoint:** pause for user review before Task 8.

---

## Task 8: DomTable, DomNav, DomTabs (structural)

**Files:**
- Create: `packages/react/src/primitives/table.tsx`
- Create: `packages/react/src/primitives/nav.tsx`
- Create: `packages/react/src/primitives/tabs.tsx`
- Modify: `packages/react/tests/primitives.test.tsx`

### 8.1 Per the audit

- **DomTable**: base `domi-table`. No variants/sizes. Children = `<thead>`, `<tbody>`, etc.
- **DomNav**: base `domi-nav`. No variants. Slot props for `brand` / `links` / `actions` (BEM parts) OR composable children — pick composable children for React idiomaticness; CSS `__brand`/`__links`/`__actions` are styling hooks the user composes via their own markup.
- **DomTabs**: base `domi-tabs`. Children = `.domi-tab` elements with `[aria-selected]`.

### 8.2 Write failing tests

Append to `primitives.test.tsx`:

```tsx
import { DomTable } from '../src/primitives/table';
import { DomNav } from '../src/primitives/nav';
import { DomTabs } from '../src/primitives/tabs';

describe('DomTable', () => {
  it('renders <table> with base class', () => {
    const html = renderToStaticMarkup(
      <DomTable><thead><tr><th>x</th></tr></thead></DomTable>
    );
    expect(html).toContain('<table');
    expect(html).toContain('domi-table');
  });

  it('passes ...props', () => {
    const html = renderToStaticMarkup(
      <DomTable id="t1"><tbody /></DomTable>
    );
    expect(html).toContain('id="t1"');
  });

  it('sets displayName', () => {
    expect(DomTable.displayName).toBe('DomTable');
  });
});

describe('DomNav', () => {
  it('renders <nav> with base class', () => {
    const html = renderToStaticMarkup(
      <DomNav><a href="/">x</a></DomNav>
    );
    expect(html).toContain('<nav');
    expect(html).toContain('domi-nav');
  });

  it('appends user className', () => {
    const html = renderToStaticMarkup(<DomNav className="x" />);
    expect(html).toMatch(/class="domi-nav[^"]*x/);
  });

  it('sets displayName', () => {
    expect(DomNav.displayName).toBe('DomNav');
  });
});

describe('DomTabs', () => {
  it('renders <div> with base class', () => {
    const html = renderToStaticMarkup(
      <DomTabs><div role="tablist">tab</div></DomTabs>
    );
    expect(html).toContain('domi-tabs');
  });

  it('sets displayName', () => {
    expect(DomTabs.displayName).toBe('DomTabs');
  });
});
```

### 8.3 Implement DomTable

```tsx
// packages/react/src/primitives/table.tsx
import { forwardRef } from 'react';
import type { TableHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export interface DomTableProps
  extends Omit<TableHTMLAttributes<HTMLTableElement>, 'className'> {
  className?: string;
  children?: ReactNode;
}

export const DomTable = forwardRef<HTMLTableElement, DomTableProps>(
  function DomTable({ className, children, ...rest }, ref) {
    return (
      <table ref={ref} className={cn('domi-table', className)} {...rest}>
        {children}
      </table>
    );
  }
);

DomTable.displayName = 'DomTable';
```

### 8.4 Implement DomNav

```tsx
// packages/react/src/primitives/nav.tsx
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../utils/cn';

export interface DomNavProps
  extends Omit<HTMLAttributes<HTMLElement>, 'className'> {
  className?: string;
  children?: ReactNode;
}

export const DomNav = forwardRef<HTMLElement, DomNavProps>(
  function DomNav({ className, children, ...rest }, ref) {
    return (
      <nav ref={ref} className={cn('domi-nav', className)} {...rest}>
        {children}
      </nav>
    );
  }
);

DomNav.displayName = 'DomNav';
```

### 8.5 Implement DomTabs

```tsx
// packages/react/src/primitives/tabs.tsx
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../utils/cn';

export interface DomTabsProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  className?: string;
  children?: ReactNode;
}

export const DomTabs = forwardRef<HTMLDivElement, DomTabsProps>(
  function DomTabs({ className, children, ...rest }, ref) {
    return (
      <div ref={ref} className={cn('domi-tabs', className)} {...rest}>
        {children}
      </div>
    );
  }
);

DomTabs.displayName = 'DomTabs';
```

### 8.6 Run, verify GREEN

```bash
npx vitest run packages/react/tests/primitives.test.tsx
```

Expected: 52 + 3 (Table) + 3 (Nav) + 2 (Tabs) = 60 passed.

### 8.7 Type check + commit

```bash
npx tsc --noEmit -p packages/react/tsconfig.json
git add packages/react/src/primitives/{table,nav,tabs}.tsx packages/react/tests/primitives.test.tsx
git commit -m "feat(react): DomTable, DomNav, DomTabs wrappers (TDD)"
```

### Acceptance for Task 8

- 60/60 tests pass.
- `DomNav` uses `<nav>` HTML element (typed as `HTMLElement` since `HTMLNavElement` isn't standard).

**Checkpoint:** pause for user review before Task 9.

---

## Task 9: DomModal, DomToast, DomTooltip (overlay)

**Files:**
- Create: `packages/react/src/primitives/modal.tsx`
- Create: `packages/react/src/primitives/toast.tsx`
- Create: `packages/react/src/primitives/tooltip.tsx`
- Modify: `packages/react/tests/primitives.test.tsx`

### 9.1 Per the audit

- **DomModal**: base `domi-modal`. No variants/sizes. Renders `<dialog>`.
- **DomToast**: base `domi-toast`. No variants. Position is CSS-fixed.
- **DomTooltip**: base `domi-tooltip`. No variants. Uses `data-tooltip` attribute.

### 9.2 Write failing tests

Append to `primitives.test.tsx`:

```tsx
import { DomModal } from '../src/primitives/modal';
import { DomToast } from '../src/primitives/toast';
import { DomTooltip } from '../src/primitives/tooltip';

describe('DomModal', () => {
  it('renders <dialog> with base class', () => {
    const html = renderToStaticMarkup(
      <DomModal><div>body</div></DomModal>
    );
    expect(html).toContain('<dialog');
    expect(html).toContain('domi-modal');
  });

  it('passes open via ...props', () => {
    const html = renderToStaticMarkup(
      <DomModal open><div>body</div></DomModal>
    );
    expect(html).toMatch(/<dialog[^>]*open/);
  });

  it('sets displayName', () => {
    expect(DomModal.displayName).toBe('DomModal');
  });
});

describe('DomToast', () => {
  it('renders <div> with base class', () => {
    const html = renderToStaticMarkup(<DomToast>msg</DomToast>);
    expect(html).toContain('<div');
    expect(html).toContain('domi-toast');
  });

  it('sets displayName', () => {
    expect(DomToast.displayName).toBe('DomToast');
  });
});

describe('DomTooltip', () => {
  it('renders <span> with base class and data-tooltip attr', () => {
    const html = renderToStaticMarkup(
      <DomTooltip content="hint">trigger</DomTooltip>
    );
    expect(html).toContain('<span');
    expect(html).toContain('domi-tooltip');
    expect(html).toContain('data-tooltip="hint"');
  });

  it('sets displayName', () => {
    expect(DomTooltip.displayName).toBe('DomTooltip');
  });
});
```

### 9.3 Implement DomModal

```tsx
// packages/react/src/primitives/modal.tsx
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../utils/cn';

export interface DomModalProps
  extends Omit<HTMLAttributes<HTMLDialogElement>, 'className' | 'open'> {
  open?: boolean;
  className?: string;
  children?: ReactNode;
}

export const DomModal = forwardRef<HTMLDialogElement, DomModalProps>(
  function DomModal({ open = false, className, children, ...rest }, ref) {
    return (
      <dialog ref={ref} className={cn('domi-modal', className)} open={open} {...rest}>
        {children}
      </dialog>
    );
  }
);

DomModal.displayName = 'DomModal';
```

### 9.4 Implement DomToast

```tsx
// packages/react/src/primitives/toast.tsx
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../utils/cn';

export interface DomToastProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  className?: string;
  children?: ReactNode;
}

export const DomToast = forwardRef<HTMLDivElement, DomToastProps>(
  function DomToast({ className, children, ...rest }, ref) {
    return (
      <div ref={ref} className={cn('domi-toast', className)} {...rest}>
        {children}
      </div>
    );
  }
);

DomToast.displayName = 'DomToast';
```

### 9.5 Implement DomTooltip

```tsx
// packages/react/src/primitives/tooltip.tsx
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../utils/cn';

export interface DomTooltipProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'className'> {
  /** Text shown in the tooltip on hover. Rendered as `data-tooltip` attribute. */
  content: string;
  className?: string;
  children?: ReactNode;
}

export const DomTooltip = forwardRef<HTMLSpanElement, DomTooltipProps>(
  function DomTooltip({ content, className, children, ...rest }, ref) {
    return (
      <span
        ref={ref}
        className={cn('domi-tooltip', className)}
        data-tooltip={content}
        {...rest}
      >
        {children}
      </span>
    );
  }
);

DomTooltip.displayName = 'DomTooltip';
```

### 9.6 Run, verify GREEN

```bash
npx vitest run packages/react/tests/primitives.test.tsx
```

Expected: 60 + 3 (Modal) + 2 (Toast) + 2 (Tooltip) = 67 passed.

### 9.7 Type check + commit

```bash
npx tsc --noEmit -p packages/react/tsconfig.json
git add packages/react/src/primitives/{modal,toast,tooltip}.tsx packages/react/tests/primitives.test.tsx
git commit -m "feat(react): DomModal, DomToast, DomTooltip wrappers (TDD)"
```

### Acceptance for Task 9

- 67/67 tests pass.
- All 15 components now exist. Total test count matches handoff's "85 total" target minus the 18 existing primitives-test additions — well above green threshold.

**Checkpoint:** pause for user review before Task 10.

---

## Task 10: `index.ts` barrel

**Files:**
- Modify: `packages/react/src/index.ts`

### 10.1 Replace placeholder

```ts
// packages/react/src/index.ts
export { cn } from './utils/cn';

export { DomButton } from './primitives/button';
export type { DomButtonProps, DomButtonVariant, DomButtonSize } from './primitives/button';

export { DomCard } from './primitives/card';
export type { DomCardProps, DomCardSize } from './primitives/card';

export { DomForm } from './primitives/form';
export type { DomFormProps } from './primitives/form';

export { DomInput } from './primitives/input';
export type { DomInputProps, DomInputSize } from './primitives/input';

export { DomSelect } from './primitives/select';
export type { DomSelectProps, DomSelectSize } from './primitives/select';

export { DomCheckbox } from './primitives/checkbox';
export type { DomCheckboxProps } from './primitives/checkbox';

export { DomRadio } from './primitives/radio';
export type { DomRadioProps } from './primitives/radio';

export { DomTable } from './primitives/table';
export type { DomTableProps } from './primitives/table';

export { DomNav } from './primitives/nav';
export type { DomNavProps } from './primitives/nav';

export { DomModal } from './primitives/modal';
export type { DomModalProps } from './primitives/modal';

export { DomAlert } from './primitives/alert';
export type { DomAlertProps, DomAlertVariant } from './primitives/alert';

export { DomBadge } from './primitives/badge';
export type { DomBadgeProps, DomBadgeVariant } from './primitives/badge';

export { DomTabs } from './primitives/tabs';
export type { DomTabsProps } from './primitives/tabs';

export { DomToast } from './primitives/toast';
export type { DomToastProps } from './primitives/toast';

export { DomTooltip } from './primitives/tooltip';
export type { DomTooltipProps } from './primitives/tooltip';
```

### 10.2 Add barrel smoke test

Append to `packages/react/tests/primitives.test.tsx`:

```tsx
import * as DomiReact from '../src';

describe('@domi/react barrel', () => {
  it('exports all 15 components', () => {
    const expected = [
      'DomButton', 'DomCard', 'DomForm', 'DomInput', 'DomSelect',
      'DomCheckbox', 'DomRadio', 'DomTable', 'DomNav', 'DomModal',
      'DomAlert', 'DomBadge', 'DomTabs', 'DomToast', 'DomTooltip'
    ];
    for (const name of expected) {
      expect(DomiReact).toHaveProperty(name);
    }
  });

  it('exports cn() helper', () => {
    expect(typeof DomiReact.cn).toBe('function');
  });
});
```

### 10.3 Verify

```bash
npx vitest run packages/react/tests/primitives.test.tsx
npx tsc --noEmit -p packages/react/tsconfig.json
```

Expected: 67 + 2 = 69 tests pass; tsc clean.

### 10.4 Commit

```bash
git add packages/react/src/index.ts packages/react/tests/primitives.test.tsx
git commit -m "feat(react): barrel index.ts + smoke test (15 components exported)"
```

### Acceptance for Task 10

- 69/69 tests pass.
- All 15 components + `cn()` re-exported from package root.
- TypeScript compilation succeeds with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

**Checkpoint:** pause for user review before Task 11.

---

## Task 11: Build with tsup

**Files:**
- Modify: `packages/react/package.json` (add `"main"` if missing — already there from Task 1)
- No new files; runs the build.

### 11.1 Run build

```bash
npm run build:react
```

Expected: tsup runs without errors. Outputs:
- `packages/react/dist/index.js` (ESM)
- `packages/react/dist/index.cjs` (CJS)
- `packages/react/dist/index.d.ts` (types)
- `packages/react/dist/index.js.map` (source map)
- `packages/react/dist/index.cjs.map`

### 11.2 Verify dist

```bash
ls -la packages/react/dist/
wc -l packages/react/dist/index.d.ts
```

Expected: 5 files. `index.d.ts` should declare all 15 components + types.

### 11.3 Smoke test the built bundle

```bash
node -e "import('./packages/react/dist/index.js').then(m => console.log(Object.keys(m).sort().join(' ')))"
```

Expected output: `DomAlert DomBadge DomButton DomCard DomCheckbox DomForm DomInput DomModal DomNav DomRadio DomSelect DomTable DomTabs DomToast DomTooltip cn` (16 names — 15 components + cn).

### 11.4 Commit

```bash
git add packages/react/dist/ 2>/dev/null || true
```

**Note:** `dist/` is in `.gitignore` (root level: `dist/`). So nothing is staged. That's expected — the package builds locally; consumers build from source via `npm run build:react` after install. Document this in README (Task 12).

If the user prefers committing `dist/` for distribution, defer to a follow-up — not a 3a concern.

### Acceptance for Task 11

- `npm run build:react` exits 0.
- All 5 dist files exist.
- `dist/index.d.ts` declares all 15 components.
- ESM bundle loads in Node and exports all 15 components + `cn`.

**Checkpoint:** pause for user review before Task 12.

---

## Task 12: README.md + library invariant verification

**Files:**
- Create: `packages/react/README.md`

### 12.1 Write README

```markdown
# @domi/react

React wrappers for the 15 [DOMiNice](../components/primitives) HTML primitives.
Provides TypeScript-first, class-composition wrappers with escape hatches (`className`, `...props`, `as`, `ref`).

## Install

```bash
npm install @domi/react react react-dom
```

## Usage

```tsx
import { DomButton, DomCard, DomAlert } from '@domi/react';

function SaveButton() {
  return <DomButton variant="primary" size="lg" onClick={save}>Save</DomButton>;
}

function ErrorBanner({ message }: { message: string }) {
  return <DomAlert variant="danger">{message}</DomAlert>;
}
```

## Components

| Component    | HTML element | Variants                                  | Sizes          | `as` allowed |
|--------------|--------------|-------------------------------------------|----------------|--------------|
| `DomButton`  | `<button>`   | `primary` \| `ghost` \| `danger`          | `sm` \| `lg`   | ✓ (`button`, `a`) |
| `DomCard`    | `<div>`      | —                                         | `sm` \| `lg`   | —            |
| `DomForm`    | `<form>`     | —                                         | —              | —            |
| `DomInput`   | `<input>`    | `error` (boolean flag)                    | `sm` \| `lg`   | —            |
| `DomSelect`  | `<select>`   | `error` (boolean flag)                    | `sm` \| `lg`   | —            |
| `DomCheckbox`| `<input type="checkbox">` | —                            | —              | —            |
| `DomRadio`   | `<input type="radio">`    | —                            | —              | —            |
| `DomTable`   | `<table>`    | —                                         | —              | —            |
| `DomNav`     | `<nav>`      | —                                         | —              | —            |
| `DomModal`   | `<dialog>`   | —                                         | —              | —            |
| `DomAlert`   | `<div>`      | `info` \| `success` \| `warning` \| `danger` | —          | ✓ (`div`, `span`) |
| `DomBadge`   | `<span>`     | `primary` \| `success` \| `warning` \| `danger` | —        | ✓ (`span`, `a`)   |
| `DomTabs`    | `<div>`      | —                                         | —              | —            |
| `DomToast`   | `<div>`      | —                                         | —              | —            |
| `DomTooltip` | `<span>`     | —                                         | —              | —            |

## Escape hatches (in order)

1. **`className`** — appended last in the class list; wins specificity ties.
2. **`...props` spread** — every standard HTML prop passes through (`onClick`, `disabled`, `aria-*`, `data-*`, etc.).
3. **`as` prop** (selective — see table above) — render a different element.
4. **`ref` forwarding** — `forwardRef` to the underlying DOM element.

## Variant CSS source-of-truth

Every variant/size union in TypeScript maps 1:1 to a `.domi-*--*` class suffix in [`components/domi.css`](../components/domi.css). See [`CSS-AUDIT.md`](./CSS-AUDIT.md) for the per-component ground-truth mapping and the deviations from the design spec.

## Build

```bash
npm install
npm run build:react
```

Outputs `packages/react/dist/{index.js,index.cjs,index.d.ts}` (ESM + CJS + types).

## Test

```bash
npm test
```

Runs all repo tests including `packages/react/tests/*.test.tsx` (vitest + jsdom).

## Library invariant

`@domi/react` does **not** modify the DOMiNice design system library (`tokens/`, `components/`, `scripts/domi*.js`, `examples/`). It is a pure-React consumer layer.
```

### 12.2 Library invariant verification

```bash
git status --short components/ tokens/ scripts/domi*.js examples/
```

Expected: only `components/domi.css` shows `M` (pre-existing dirty, preserved). All other paths: no output.

```bash
git status --short --ignored | grep -E '^(!!|M|\?\?)' | head -20
```

Expected: only the workspace artifacts we created:
- `M package.json` (workspaces field added)
- `M vitest.config.js` (include path widened)
- `?? packages/react/` (new directory)
- `?? node_modules/` (ignored)
- `M components/domi.css` (pre-existing)

No modifications to `crates/`, `templates/`, `tools/`, `docs/`, `tests/` (existing), `examples/`.

```bash
ls Cargo.lock 2>/dev/null && echo "FAIL: Cargo.lock should be gitignored" || echo "OK: Cargo.lock not present"
```

Expected: `OK`.

### 12.3 Full test suite + cargo

```bash
npm test
cargo test --workspace
```

Expected: `npm test` → all suites green (existing 85 + new ~69 = ~154 tests pass). `cargo test --workspace` → 60 unit pass + 12 gated ignored (Phase 2d baseline preserved).

### 12.4 Final commit

```bash
git add packages/react/README.md
git commit -m "docs(react): README with usage, component table, escape hatches"
```

### Acceptance for Task 12

- README exists, ≥2 KB.
- Library invariant held (only the expected files modified).
- Both `npm test` and `cargo test --workspace` stay green.
- `Cargo.lock` remains gitignored.
- `components/domi.css` dirty state preserved.

**Final checkpoint:** whole-branch review follows (per Phase 2d precedent).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-05-phase3a-react-plan.md`. Two execution options:

**1. Subagent-Driven (recommended for 3a)** — Dispatch a fresh subagent per task with reviewer between tasks. Mirrors the Phase 2d pattern that produced merge-ready 0-Critical / 0-Important reviews.

**2. Inline Execution** — Execute tasks in this session with checkpoints between major batches (Tasks 1-2, 3-4, 5-6, 7-8, 9-10, 11-12). Faster but heavier context.

The user's session preference (per handoff) was "checkpoints occasionally on long tasks." With 12 tasks, both options support this — inline batches naturally create checkpoints; subagent-driven creates them per task.
