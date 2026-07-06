# Phase 3b — `@domi/astro` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@domi/astro` 0.1.0 — 15 native `.astro` components (`Button`, `Card`, …, `Tooltip`) that wrap the canonical HTML primitives with a typed class-composition API, zero JS by default, library invariant preserved.

**Architecture:** Native Astro components, not React re-exports. Each `.astro` file declares a typed `Props` interface, joins class strings in frontmatter, emits a single HTML element with `<slot />`. Source-only distribution (no tsup build) — consumers' Astro compiler handles the components at their site. CSS audit is shared with `@domi/react` via `packages/react/CSS-AUDIT.md`, enforced by a consistency test.

**Tech Stack:** Astro 5 (`experimental_AstroContainer` for tests), vitest + jsdom (root), TypeScript strict, vitest + `@vitest/ui` (already in repo). One peer dep (`astro ^5`), zero runtime deps.

## Global Constraints

- **Library invariant held.** `tokens/`, `components/`, `components/primitives/*/`, `scripts/domi*.js`, `scripts/domi-audit.js`, `scripts/domi-server.js`, `scripts/domi-wire.js`, `examples/`, `crates/`, `templates/`, `tools/` are **untouched** by 3b. The pre-existing dirty `components/domi.css` is preserved.
- **TDD.** Tests written before implementation. Tests fail (red), code passes (green), then refactor. Component tests use `experimental_AstroContainer` from `astro/container`.
- **CSS is source of truth.** Wrapper components never construct class names from JS. Every variant/size union must match an existing `.domi-*` suffix in `components/domi.css`. Verified by `tests/css-audit-consistency.test.ts` against the shared `packages/react/CSS-AUDIT.md`.
- **`packages/astro/` is the only new directory.** No edits to `crates/`, `templates/`, `tools/`, or root `package.json` (workspaces glob already covers `packages/*`).
- **No `tsup` / `tsc` build step.** Source-only distribution. Consumers' Astro compiler handles `.astro` files.
- **Source-only build means no `dist/`.** No compiled output to gitignore or publish.
- **Naming convention.** Component export name = filename (e.g., `Button.astro` exports `Button`, not `DomButton`). `<slot />` for children, not `children` prop. `class=` prop only (no `class:list`).
- **One peer dep** (`astro ^5.0.0`). No `react`, no `react-dom`, no `@astrojs/react`, no `tsup`. Permissively licensed (`astro` is MIT).
- **AGENTS.md conventions** apply: `rtk` for fs/git/grep; `npm test` (JS, vitest, jsdom) and `cargo test --workspace` (Rust) both stay green at every commit.
- **Checkpoint convention** — pause for the user to review before the next task begins (per the user's session preference from the 3a handoff). Each task ends with a checkpoint except where grouped.

## File Structure

```
packages/astro/
  package.json              # name: "@domi/astro", peerDeps: astro ^5, exports map
  README.md                 # usage + per-component props table
  src/
    index.ts                # Task 10 — barrel: re-export all 15 + types
    types.ts                # Task 2 — variant/size unions (mirror of CSS-AUDIT, lock)
    components/
      Button.astro          # Task 3
      Card.astro            # Task 4
      Alert.astro           # Task 4
      Badge.astro           # Task 4
      Form.astro            # Task 5
      Input.astro           # Task 5
      Select.astro          # Task 5
      Checkbox.astro        # Task 6
      Radio.astro           # Task 6
      Table.astro           # Task 7
      Nav.astro             # Task 7
      Tabs.astro            # Task 7
      Modal.astro           # Task 8
      Toast.astro           # Task 8
      Tooltip.astro         # Task 8
  tests/
    components.test.ts      # Tasks 3-8 — per-component describe blocks
    barrel.test.ts          # Task 10 — barrel smoke test
    css-audit-consistency.test.ts  # Task 9 — asserts types.ts matches packages/react/CSS-AUDIT.md
```

Root changes:
- `vitest.config.js` — **edited in Task 11 only.** Initial include glob (`packages/**/tests/**/*.test.{js,ts,tsx}`) is already wide enough to discover 3b tests; we add an `exclude` for `packages/astro/**` so root `npm test` doesn't try to compile `.astro` files under the wrong config. Not part of the library invariant.
- `package.json` (root) — **no edit needed.** `"workspaces": ["packages/*"]` already covers `packages/astro/`.

---

## Task 1: Package scaffold + test harness verification

**Files:**
- Create: `packages/astro/package.json`
- Create: `packages/astro/vitest.config.ts` (package-local vitest config; does NOT touch root)
- Create: `packages/astro/tests/harness.test.ts` (proves the test harness works before any components exist)
- Create: `packages/astro/tests/fixtures/Hello.astro` (minimal fixture for the harness test)

**Interfaces:**
- Consumes: root `package.json` workspaces glob (already `packages/*`); existing root `vitest.config.js` (left as-is in this task; root gets an `exclude` for `packages/astro/**` in Task 11 so root `npm test` doesn't try to compile `.astro` files); root `node_modules` (where Astro will be installed via npm workspaces)
- Produces: a `@domi/astro` package directory; a package-local vitest config that uses Astro's vite plugin to compile `.astro` imports; a passing harness test that all later component tests will use as a template

> **Why a separate vitest config?** Astro component tests need `getViteConfig()` from `astro/config` so vitest can compile `.astro` file imports. The root `vitest.config.js` (used by React tests and existing primitives tests) must stay on the simple `defineConfig` form for those — mixing Astro's plugin in would force every test run to load the Astro compiler, breaking JSX/React test compilation. Each package gets its own vitest config; root stays vanilla, with a tiny `exclude` added in Task 11 to scope 3b tests out of the root run.

### 1.1 Create `packages/astro/package.json`

```json
{
  "name": "@domi/astro",
  "version": "0.1.0",
  "description": "Astro wrappers for DOMiNice primitives",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./components/*": "./src/components/*"
  },
  "files": ["src", "README.md"],
  "scripts": {
    "typecheck": "astro check"
  },
  "peerDependencies": {
    "astro": "^5.0.0"
  },
  "license": "MIT"
}
```

Note: `astro check` is Astro's built-in TS check. It needs the Astro compiler available — npm workspaces will hoist `astro` after install in step 1.4.

### 1.2 Create package-local vitest config

```ts
// packages/astro/vitest.config.ts
/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
```

This is the canonical pattern from Astro's testing docs. `getViteConfig()` pulls in the Astro vite plugin so `import Button from '../src/components/Button.astro'` compiles in the test environment. The root `vitest.config.js` is left alone in this task; Task 11 adds a one-line `exclude` to scope 3b tests out of the root run.

### 1.3 Create the harness fixture + test

`packages/astro/tests/fixtures/Hello.astro`:

```astro
---
---
<p>hello</p>
```

`packages/astro/tests/harness.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Hello from './fixtures/Hello.astro';

describe('Astro container harness', () => {
  it('renders a real .astro component to HTML', async () => {
    const container = await AstroContainer.create();
    const out = await container.renderToString(Hello);
    expect(out).toContain('<p>hello</p>');
  });
});
```

### 1.4 Install

```bash
npm install
```

Expected: `node_modules/astro` now exists (npm hoists peer deps from the workspace package). Verify:

```bash
ls node_modules/astro/package.json && grep '"version"' node_modules/astro/package.json | head -1
```

Expected: path exists; version is `5.x.x`.

### 1.5 Run harness test (RED)

```bash
cd packages/astro && npx vitest run tests/harness.test.ts
```

Expected: **PASS** (this is the harness, not a TDD red). If it fails with `Cannot find module 'astro/container'`, the peer dep didn't install — re-run `npm install` and re-check step 1.4. If it fails with `Failed to resolve import "./fixtures/Hello.astro"`, the `getViteConfig` plugin isn't loading — verify step 1.2 wrote the config correctly.

### 1.6 Smoke check types

```bash
cd packages/astro && npx astro check
```

Expected: PASS (no `.astro` source files yet, no errors).

### 1.7 Commit

```bash
git add packages/astro/
git commit -m "feat(astro): package scaffold + test harness for @domi/astro"
```

### Acceptance for Task 1

- `packages/astro/package.json` exists with `peerDependencies.astro = "^5.0.0"`.
- `node_modules/astro` is installed (npm hoisted it).
- `cd packages/astro && npx vitest run tests/harness.test.ts` passes.
- `npx astro check` exits 0.
- `git status` shows no changes to `tokens/`, `components/`, `scripts/`, `examples/`, `crates/`, `templates/`, `tools/`.

---

## Task 2: Variant/size type unions in `types.ts`

**Files:**
- Create: `packages/astro/src/types.ts`

**Interfaces:**
- Consumes: `packages/react/CSS-AUDIT.md` (ground-truth mapping of CSS suffixes → TS unions). The test for consistency (Task 9) parses this file.
- Produces: One `*Variant` union and (where applicable) one `*Size` union per component, exported for use in the component `Props` interfaces in Tasks 3-8.

### 2.1 Read `packages/react/CSS-AUDIT.md` end-to-end

The relevant lines (from the 3a plan preamble that shipped in 3a):

- Button: variants `primary | ghost | danger`, sizes `sm | lg`
- Card: sizes `sm | lg` (no variants)
- Form: none
- Input: variant `error` (boolean flag), sizes `sm | lg`
- Select: variant `error` (boolean flag), sizes `sm | lg`
- Checkbox: none
- Radio: none
- Table: none
- Nav: none
- Tabs: none
- Modal: none
- Alert: variants `info | success | warning | danger`
- Badge: variants `primary | success | warning | danger`
- Toast: none
- Tooltip: none

The Task 9 consistency test enforces these match the actual `CSS-AUDIT.md` table at CI time. The values here are the locked ground truth.

### 2.2 Write `packages/astro/src/types.ts`

```ts
// packages/astro/src/types.ts
// Source of truth: packages/react/CSS-AUDIT.md
// Locked at 2026-07-06. If CSS adds a suffix, update both this file AND CSS-AUDIT.md,
// then confirm tests/css-audit-consistency.test.ts still passes.

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'lg';

export type CardSize = 'sm' | 'lg';

export type InputSize = 'sm' | 'lg';
export type SelectSize = 'sm' | 'lg';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger';
```

### 2.3 Write `packages/astro/tests/types.test.ts` (basic sanity)

```ts
// packages/astro/tests/types.test.ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  ButtonVariant, ButtonSize,
  CardSize,
  InputSize, SelectSize,
  AlertVariant, BadgeVariant,
} from '../src/types';

describe('types.ts unions', () => {
  it('ButtonVariant is exactly primary | ghost | danger', () => {
    expectTypeOf<ButtonVariant>().toEqualTypeOf<'primary' | 'ghost' | 'danger'>();
  });
  it('ButtonSize is exactly sm | lg', () => {
    expectTypeOf<ButtonSize>().toEqualTypeOf<'sm' | 'lg'>();
  });
  it('CardSize is exactly sm | lg', () => {
    expectTypeOf<CardSize>().toEqualTypeOf<'sm' | 'lg'>();
  });
  it('InputSize is exactly sm | lg', () => {
    expectTypeOf<InputSize>().toEqualTypeOf<'sm' | 'lg'>();
  });
  it('SelectSize is exactly sm | lg', () => {
    expectTypeOf<SelectSize>().toEqualTypeOf<'sm' | 'lg'>();
  });
  it('AlertVariant is exactly info | success | warning | danger', () => {
    expectTypeOf<AlertVariant>().toEqualTypeOf<'info' | 'success' | 'warning' | 'danger'>();
  });
  it('BadgeVariant is exactly primary | success | warning | danger', () => {
    expectTypeOf<BadgeVariant>().toEqualTypeOf<'primary' | 'success' | 'warning' | 'danger'>();
  });
});
```

### 2.4 Verify

```bash
cd packages/astro && npx vitest run tests/types.test.ts
npx astro check
```

Expected: tests pass; `astro check` clean.

### 2.5 Commit

```bash
git add packages/astro/src/types.ts packages/astro/tests/types.test.ts
git commit -m "feat(astro): variant/size type unions (mirror of CSS-AUDIT)"
```

### Acceptance for Task 2

- `packages/astro/src/types.ts` exists and exports 7 unions.
- `types.test.ts` passes (7 type-level assertions).
- `astro check` clean.

**Checkpoint:** pause for user review before Task 3.

---

## Task 3: `Button.astro` (first component — sets the pattern)

**Files:**
- Create: `packages/astro/src/components/Button.astro`
- Create: `packages/astro/tests/components.test.ts` (starts here; later tasks append)

**Interfaces:**
- Consumes: `ButtonVariant`, `ButtonSize` from `../types`
- Produces: `Button.astro` component matching the spec §C anatomy; the `components.test.ts` file pattern subsequent tasks will extend

### 3.1 Write failing tests (append to `components.test.ts`)

```ts
// packages/astro/tests/components.test.ts
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Button from '../src/components/Button.astro';

const container = await AstroContainer.create();

describe('Button', () => {
  it('renders <button> with base class', async () => {
    const out = await container.renderToString(Button, { slots: { default: 'Click' } });
    expect(out).toContain('<button');
    expect(out).toContain('domi-btn');
  });

  it('applies default variant (primary) and default size (lg)', async () => {
    const out = await container.renderToString(Button, { slots: { default: 'Click' } });
    expect(out).toContain('domi-btn--primary');
    expect(out).toContain('domi-btn--lg');
  });

  it.each(['primary', 'ghost', 'danger'] as const)(
    'applies %s variant',
    async (variant) => {
      const out = await container.renderToString(Button, { props: { variant }, slots: { default: 'x' } });
      expect(out).toContain(`domi-btn--${variant}`);
    }
  );

  it.each(['sm', 'lg'] as const)(
    'applies %s size',
    async (size) => {
      const out = await container.renderToString(Button, { props: { size }, slots: { default: 'x' } });
      expect(out).toContain(`domi-btn--${size}`);
    }
  );

  it('appends user class last (wins specificity ties)', async () => {
    const out = await container.renderToString(Button, { props: { class: 'my-extra' }, slots: { default: 'x' } });
    const classIdx = out.indexOf('class="');
    expect(out.substring(classIdx)).toMatch(/class="domi-btn[^"]*my-extra/);
  });

  it('passes through type via ...props spread', async () => {
    const out = await container.renderToString(Button, { props: { type: 'submit' }, slots: { default: 'x' } });
    expect(out).toContain('type="submit"');
  });

  it('renders as <a> when as="a" with href', async () => {
    const out = await container.renderToString(Button, {
      props: { as: 'a', href: '/somewhere' },
      slots: { default: 'Link' },
    });
    expect(out).toContain('<a');
    expect(out).toContain('href="/somewhere"');
    expect(out).toContain('domi-btn');
  });
});
```

### 3.2 Run, verify RED

```bash
cd packages/astro && npx vitest run tests/components.test.ts
```

Expected: FAIL — `Cannot find module '../src/components/Button.astro'`.

### 3.3 Implement `Button.astro`

```astro
---
// packages/astro/src/components/Button.astro
import type { HTMLAttributes } from 'astro/types';
import type { ButtonVariant, ButtonSize } from '../types';

interface Props extends Omit<HTMLAttributes<'button'>, 'class'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  class?: string;
  as?: 'button' | 'a';
}

const {
  variant = 'primary',
  size = 'lg',
  class: className,
  as = 'button',
  ...rest
} = Astro.props as Props;

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

### 3.4 Run, verify GREEN

```bash
cd packages/astro && npx vitest run tests/components.test.ts
```

Expected: 11 tests pass (3 default-render + 3 variants × it.each + 2 sizes × it.each + class + type + as="a" = 3 + 3 + 2 + 1 + 1 + 1 = 11).

### 3.5 Type check

```bash
npx astro check
```

Expected: PASS.

### 3.6 Commit

```bash
git add packages/astro/src/components/Button.astro packages/astro/tests/components.test.ts
git commit -m "feat(astro): Button — first primitive wrapper (TDD)"
```

### Acceptance for Task 3

- 11/11 Button tests pass.
- Variants match CSS-AUDIT.md exactly (`primary | ghost | danger`, `sm | lg`).
- `as="a"` escape hatch works.
- Default class order is base → variant → size → user-`class`.

**Checkpoint:** pause for user review before Task 4.

---

## Task 4: `Card`, `Alert`, `Badge` (display primitives)

**Files:**
- Create: `packages/astro/src/components/Card.astro`
- Create: `packages/astro/src/components/Alert.astro`
- Create: `packages/astro/src/components/Badge.astro`
- Modify: `packages/astro/tests/components.test.ts` (append describe blocks)

**Interfaces:**
- Consumes: `CardSize`, `AlertVariant`, `BadgeVariant` from `../types`
- Produces: 3 structural display components mirroring 3a's Card/Alert/Badge APIs (minus `Dom` prefix and `forwardRef`)

### 4.1 Per the audit

- **Card**: base `domi-card`. Sizes: `sm | lg` (no variants). No `as` prop.
- **Alert**: base `domi-alert`. Variants: `info | success | warning | danger`. `as` prop allowed (selective).
- **Badge**: base `domi-badge`. Variants: `primary | success | warning | danger`. `as` prop allowed (selective; Badge default renders as `<span>`).

### 4.2 Append tests

```ts
// Append to packages/astro/tests/components.test.ts
import Card from '../src/components/Card.astro';
import Alert from '../src/components/Alert.astro';
import Badge from '../src/components/Badge.astro';

describe('Card', () => {
  it('renders <div> with base class', async () => {
    const out = await container.renderToString(Card, { slots: { default: 'body' } });
    expect(out).toContain('<div');
    expect(out).toContain('domi-card');
  });

  it('default has no size suffix', async () => {
    const out = await container.renderToString(Card, { slots: { default: 'body' } });
    expect(out).not.toContain('domi-card--');
  });

  it.each(['sm', 'lg'] as const)(
    'applies %s size',
    async (size) => {
      const out = await container.renderToString(Card, { props: { size }, slots: { default: 'x' } });
      expect(out).toContain(`domi-card--${size}`);
    }
  );

  it('appends user class', async () => {
    const out = await container.renderToString(Card, { props: { class: 'x' }, slots: { default: 'x' } });
    expect(out).toMatch(/class="domi-card[^"]*x/);
  });
});

describe('Alert', () => {
  it('renders <div> with base class', async () => {
    const out = await container.renderToString(Alert, { slots: { default: 'msg' } });
    expect(out).toContain('<div');
    expect(out).toContain('domi-alert');
  });

  it('default variant is info', async () => {
    const out = await container.renderToString(Alert, { slots: { default: 'msg' } });
    expect(out).toContain('domi-alert--info');
  });

  it.each(['info', 'success', 'warning', 'danger'] as const)(
    'applies %s variant',
    async (variant) => {
      const out = await container.renderToString(Alert, { props: { variant }, slots: { default: 'x' } });
      expect(out).toContain(`domi-alert--${variant}`);
    }
  );

  it('renders as <span> when as="span"', async () => {
    const out = await container.renderToString(Alert, { props: { as: 'span' }, slots: { default: 'x' } });
    expect(out).toMatch(/<span[^>]*domi-alert/);
  });
});

describe('Badge', () => {
  it('renders <span> with base class', async () => {
    const out = await container.renderToString(Badge, { slots: { default: 'label' } });
    expect(out).toMatch(/<span[^>]*domi-badge/);
  });

  it('default variant is primary', async () => {
    const out = await container.renderToString(Badge, { slots: { default: 'label' } });
    expect(out).toContain('domi-badge--primary');
  });

  it.each(['primary', 'success', 'warning', 'danger'] as const)(
    'applies %s variant',
    async (variant) => {
      const out = await container.renderToString(Badge, { props: { variant }, slots: { default: 'x' } });
      expect(out).toContain(`domi-badge--${variant}`);
    }
  );

  it('renders as <a> when as="a"', async () => {
    const out = await container.renderToString(Badge, {
      props: { as: 'a', href: '/x' },
      slots: { default: 'label' },
    });
    expect(out).toContain('<a');
    expect(out).toContain('href="/x"');
  });
});
```

### 4.3 Implement `Card.astro`

```astro
---
// packages/astro/src/components/Card.astro
import type { HTMLAttributes } from 'astro/types';
import type { CardSize } from '../types';

interface Props extends Omit<HTMLAttributes<'div'>, 'class'> {
  size?: CardSize;
  class?: string;
}

const { size, class: className, ...rest } = Astro.props as Props;

const classes = [
  'domi-card',
  size && `domi-card--${size}`,
  className,
].filter(Boolean).join(' ');
---

<div class={classes} {...rest}><slot /></div>
```

### 4.4 Implement `Alert.astro`

```astro
---
// packages/astro/src/components/Alert.astro
import type { HTMLAttributes } from 'astro/types';
import type { AlertVariant } from '../types';

interface Props extends Omit<HTMLAttributes<'div'>, 'class'> {
  variant?: AlertVariant;
  class?: string;
  as?: 'div' | 'span';
}

const {
  variant = 'info',
  class: className,
  as = 'div',
  ...rest
} = Astro.props as Props;

const classes = [
  'domi-alert',
  variant && `domi-alert--${variant}`,
  className,
].filter(Boolean).join(' ');
---

{as === 'span' ? (
  <span class={classes} {...rest}><slot /></span>
) : (
  <div class={classes} {...rest}><slot /></div>
)}
```

### 4.5 Implement `Badge.astro`

```astro
---
// packages/astro/src/components/Badge.astro
import type { HTMLAttributes } from 'astro/types';
import type { BadgeVariant } from '../types';

interface Props extends Omit<HTMLAttributes<'span'>, 'class'> {
  variant?: BadgeVariant;
  class?: string;
  as?: 'span' | 'a';
}

const {
  variant = 'primary',
  class: className,
  as = 'span',
  ...rest
} = Astro.props as Props;

const classes = [
  'domi-badge',
  variant && `domi-badge--${variant}`,
  className,
].filter(Boolean).join(' ');
---

{as === 'a' ? (
  <a class={classes} {...rest}><slot /></a>
) : (
  <span class={classes} {...rest}><slot /></span>
)}
```

### 4.6 Run, verify GREEN

```bash
cd packages/astro && npx vitest run tests/components.test.ts
```

Expected: 11 (Button) + 5 (Card: base + no-suffix + 2 sizes + class) + 6 (Alert: base + default + 4 variants + as="span") + 6 (Badge: base + default + 4 variants + as="a") = 28 tests pass.

### 4.7 Type check + commit

```bash
npx astro check
git add packages/astro/src/components/{Card,Alert,Badge}.astro packages/astro/tests/components.test.ts
git commit -m "feat(astro): Card, Alert, Badge wrappers (TDD)"
```

### Acceptance for Task 4

- 28/28 tests pass (cumulative with Task 3).
- Variants match CSS-AUDIT.md exactly.
- `as` props on Alert and Badge work.

**Checkpoint:** pause for user review before Task 5.

---

## Task 5: `Form`, `Input`, `Select` (form container + inputs)

**Files:**
- Create: `packages/astro/src/components/Form.astro`
- Create: `packages/astro/src/components/Input.astro`
- Create: `packages/astro/src/components/Select.astro`
- Modify: `packages/astro/tests/components.test.ts`

**Interfaces:**
- Consumes: `InputSize`, `SelectSize` from `../types`
- Produces: 3 form components. `Form` is structural. `Input` and `Select` accept boolean `error` flag (not a variant union — single `.domi-input--error` suffix in CSS).

### 5.1 Append tests

```ts
// Append to packages/astro/tests/components.test.ts
import Form from '../src/components/Form.astro';
import Input from '../src/components/Input.astro';
import Select from '../src/components/Select.astro';

describe('Form', () => {
  it('renders <form> with base class', async () => {
    const out = await container.renderToString(Form, { slots: { default: '<input />' } });
    expect(out).toContain('<form');
    expect(out).toContain('domi-form');
  });

  it('passes through action/method via ...props', async () => {
    const out = await container.renderToString(Form, {
      props: { action: '/submit', method: 'post' },
      slots: { default: '<input />' },
    });
    expect(out).toContain('action="/submit"');
    expect(out).toContain('method="post"');
  });
});

describe('Input', () => {
  it('renders <input> with base class', async () => {
    const out = await container.renderToString(Input);
    expect(out).toMatch(/<input[^>]*class="domi-input/);
  });

  it('default size is lg', async () => {
    const out = await container.renderToString(Input);
    expect(out).toContain('domi-input--lg');
  });

  it.each(['sm', 'lg'] as const)(
    'applies %s size',
    async (size) => {
      const out = await container.renderToString(Input, { props: { size } });
      expect(out).toContain(`domi-input--${size}`);
    }
  );

  it('applies error variant when error is true', async () => {
    const out = await container.renderToString(Input, { props: { error: true } });
    expect(out).toContain('domi-input--error');
  });

  it('passes type via ...props', async () => {
    const out = await container.renderToString(Input, { props: { type: 'email' } });
    expect(out).toContain('type="email"');
  });

  it('appends user class', async () => {
    const out = await container.renderToString(Input, { props: { class: 'x' } });
    expect(out).toMatch(/class="domi-input[^"]*x/);
  });
});

describe('Select', () => {
  it('renders <select> with base class', async () => {
    const out = await container.renderToString(Select, {
      slots: { default: '<option>A</option>' },
    });
    expect(out).toContain('<select');
    expect(out).toContain('domi-select');
    expect(out).toContain('<option');
  });

  it('default size is lg', async () => {
    const out = await container.renderToString(Select, {
      slots: { default: '<option>A</option>' },
    });
    expect(out).toContain('domi-select--lg');
  });

  it.each(['sm', 'lg'] as const)(
    'applies %s size',
    async (size) => {
      const out = await container.renderToString(Select, {
        props: { size },
        slots: { default: '<option>A</option>' },
      });
      expect(out).toContain(`domi-select--${size}`);
    }
  );

  it('applies error variant when error is true', async () => {
    const out = await container.renderToString(Select, {
      props: { error: true },
      slots: { default: '<option>A</option>' },
    });
    expect(out).toContain('domi-select--error');
  });

  it('passes name via ...props', async () => {
    const out = await container.renderToString(Select, {
      props: { name: 'r' },
      slots: { default: '<option>A</option>' },
    });
    expect(out).toContain('name="r"');
  });
});
```

### 5.2 Implement `Form.astro`

```astro
---
// packages/astro/src/components/Form.astro
import type { HTMLAttributes } from 'astro/types';

interface Props extends Omit<HTMLAttributes<'form'>, 'class'> {
  class?: string;
}

const { class: className, ...rest } = Astro.props as Props;
---

<form class={['domi-form', className].filter(Boolean).join(' ')} {...rest}>
  <slot />
</form>
```

### 5.3 Implement `Input.astro`

```astro
---
// packages/astro/src/components/Input.astro
import type { HTMLAttributes } from 'astro/types';
import type { InputSize } from '../types';

interface Props extends Omit<HTMLAttributes<'input'>, 'class' | 'size'> {
  size?: InputSize;
  error?: boolean;
  class?: string;
}

const {
  size = 'lg',
  error = false,
  class: className,
  ...rest
} = Astro.props as Props;

const classes = [
  'domi-input',
  size && `domi-input--${size}`,
  error && 'domi-input--error',
  className,
].filter(Boolean).join(' ');
---

<input class={classes} {...rest} />
```

### 5.4 Implement `Select.astro`

```astro
---
// packages/astro/src/components/Select.astro
import type { HTMLAttributes } from 'astro/types';
import type { SelectSize } from '../types';

interface Props extends Omit<HTMLAttributes<'select'>, 'class' | 'size'> {
  size?: SelectSize;
  error?: boolean;
  class?: string;
}

const {
  size = 'lg',
  error = false,
  class: className,
  ...rest
} = Astro.props as Props;

const classes = [
  'domi-select',
  size && `domi-select--${size}`,
  error && 'domi-select--error',
  className,
].filter(Boolean).join(' ');
---

<select class={classes} {...rest}>
  <slot />
</select>
```

### 5.5 Run, verify GREEN

```bash
cd packages/astro && npx vitest run tests/components.test.ts
```

Expected: 28 + 2 (Form) + 6 (Input: base + default + 2 sizes + error + type + class) + 5 (Select: base + default + 2 sizes + error + name) = 41 tests pass.

### 5.6 Type check + commit

```bash
npx astro check
git add packages/astro/src/components/{Form,Input,Select}.astro packages/astro/tests/components.test.ts
git commit -m "feat(astro): Form, Input, Select wrappers (TDD)"
```

### Acceptance for Task 5

- 41/41 tests pass (cumulative).
- `error` is a boolean flag (not a string union) — matches CSS single `--error` suffix.
- Input's `size` is typed as `InputSize` (renamed) to avoid collision with the native `size` HTML attribute (we `Omit` it).

**Checkpoint:** pause for user review before Task 6.

---

## Task 6: `Checkbox`, `Radio` (binary form controls)

**Files:**
- Create: `packages/astro/src/components/Checkbox.astro`
- Create: `packages/astro/src/components/Radio.astro`
- Modify: `packages/astro/tests/components.test.ts`

**Interfaces:**
- Consumes: nothing from `types.ts` (these have no variants/sizes)
- Produces: 2 simple wrappers that render `<input type="checkbox">` and `<input type="radio">` with their CSS class

### 6.1 Append tests

```ts
// Append to packages/astro/tests/components.test.ts
import Checkbox from '../src/components/Checkbox.astro';
import Radio from '../src/components/Radio.astro';

describe('Checkbox', () => {
  it('renders <input type="checkbox"> with base class', async () => {
    const out = await container.renderToString(Checkbox);
    expect(out).toMatch(/<input[^>]*type="checkbox"[^>]*class="domi-check/);
  });

  it('passes checked + name via ...props', async () => {
    const out = await container.renderToString(Checkbox, { props: { checked: true, name: 'c1' } });
    expect(out).toContain('name="c1"');
    expect(out).toMatch(/checked/);
  });

  it('appends user class', async () => {
    const out = await container.renderToString(Checkbox, { props: { class: 'x' } });
    expect(out).toMatch(/class="domi-check[^"]*x/);
  });
});

describe('Radio', () => {
  it('renders <input type="radio"> with base class', async () => {
    const out = await container.renderToString(Radio);
    expect(out).toMatch(/<input[^>]*type="radio"[^>]*class="domi-radio/);
  });

  it('passes name + value via ...props', async () => {
    const out = await container.renderToString(Radio, { props: { name: 'r', value: 'a' } });
    expect(out).toContain('name="r"');
    expect(out).toContain('value="a"');
  });
});
```

### 6.2 Implement `Checkbox.astro`

```astro
---
// packages/astro/src/components/Checkbox.astro
import type { HTMLAttributes } from 'astro/types';

interface Props extends Omit<HTMLAttributes<'input'>, 'class' | 'type'> {
  class?: string;
}

const { class: className, ...rest } = Astro.props as Props;
---

<input
  type="checkbox"
  class={['domi-check', className].filter(Boolean).join(' ')}
  {...rest}
/>
```

### 6.3 Implement `Radio.astro`

```astro
---
// packages/astro/src/components/Radio.astro
import type { HTMLAttributes } from 'astro/types';

interface Props extends Omit<HTMLAttributes<'input'>, 'class' | 'type'> {
  class?: string;
}

const { class: className, ...rest } = Astro.props as Props;
---

<input
  type="radio"
  class={['domi-radio', className].filter(Boolean).join(' ')}
  {...rest}
/>
```

### 6.4 Run, verify GREEN

```bash
cd packages/astro && npx vitest run tests/components.test.ts
```

Expected: 41 + 3 (Checkbox) + 2 (Radio) = 46 tests pass.

### 6.5 Type check + commit

```bash
npx astro check
git add packages/astro/src/components/{Checkbox,Radio}.astro packages/astro/tests/components.test.ts
git commit -m "feat(astro): Checkbox, Radio wrappers (TDD)"
```

### Acceptance for Task 6

- 46/46 tests pass.
- Native `type` attribute is hardcoded; consumers cannot override.

**Checkpoint:** pause for user review before Task 7.

---

## Task 7: `Table`, `Nav`, `Tabs` (structural)

**Files:**
- Create: `packages/astro/src/components/Table.astro`
- Create: `packages/astro/src/components/Nav.astro`
- Create: `packages/astro/src/components/Tabs.astro`
- Modify: `packages/astro/tests/components.test.ts`

**Interfaces:**
- Consumes: nothing from `types.ts` (these are structural, no variants/sizes)
- Produces: 3 structural wrappers. All pass children through `<slot />`.

### 7.1 Append tests

```ts
// Append to packages/astro/tests/components.test.ts
import Table from '../src/components/Table.astro';
import Nav from '../src/components/Nav.astro';
import Tabs from '../src/components/Tabs.astro';

describe('Table', () => {
  it('renders <table> with base class', async () => {
    const out = await container.renderToString(Table, {
      slots: { default: '<thead><tr><th>x</th></tr></thead>' },
    });
    expect(out).toContain('<table');
    expect(out).toContain('domi-table');
  });

  it('passes ...props (id)', async () => {
    const out = await container.renderToString(Table, {
      props: { id: 't1' },
      slots: { default: '<tbody />' },
    });
    expect(out).toContain('id="t1"');
  });
});

describe('Nav', () => {
  it('renders <nav> with base class', async () => {
    const out = await container.renderToString(Nav, {
      slots: { default: '<a href="/">x</a>' },
    });
    expect(out).toContain('<nav');
    expect(out).toContain('domi-nav');
  });

  it('appends user class', async () => {
    const out = await container.renderToString(Nav, { props: { class: 'x' } });
    expect(out).toMatch(/class="domi-nav[^"]*x/);
  });
});

describe('Tabs', () => {
  it('renders <div> with base class', async () => {
    const out = await container.renderToString(Tabs, {
      slots: { default: '<div role="tablist">tab</div>' },
    });
    expect(out).toContain('<div');
    expect(out).toContain('domi-tabs');
  });
});
```

### 7.2 Implement `Table.astro`

```astro
---
// packages/astro/src/components/Table.astro
import type { HTMLAttributes } from 'astro/types';

interface Props extends Omit<HTMLAttributes<'table'>, 'class'> {
  class?: string;
}

const { class: className, ...rest } = Astro.props as Props;
---

<table class={['domi-table', className].filter(Boolean).join(' ')} {...rest}>
  <slot />
</table>
```

### 7.3 Implement `Nav.astro`

```astro
---
// packages/astro/src/components/Nav.astro
import type { HTMLAttributes } from 'astro/types';

interface Props extends Omit<HTMLAttributes<'nav'>, 'class'> {
  class?: string;
}

const { class: className, ...rest } = Astro.props as Props;
---

<nav class={['domi-nav', className].filter(Boolean).join(' ')} {...rest}>
  <slot />
</nav>
```

### 7.4 Implement `Tabs.astro`

```astro
---
// packages/astro/src/components/Tabs.astro
import type { HTMLAttributes } from 'astro/types';

interface Props extends Omit<HTMLAttributes<'div'>, 'class'> {
  class?: string;
}

const { class: className, ...rest } = Astro.props as Props;
---

<div class={['domi-tabs', className].filter(Boolean).join(' ')} {...rest}>
  <slot />
</div>
```

### 7.5 Run, verify GREEN

```bash
cd packages/astro && npx vitest run tests/components.test.ts
```

Expected: 46 + 2 (Table) + 2 (Nav) + 1 (Tabs) = 51 tests pass.

### 7.6 Type check + commit

```bash
npx astro check
git add packages/astro/src/components/{Table,Nav,Tabs}.astro packages/astro/tests/components.test.ts
git commit -m "feat(astro): Table, Nav, Tabs structural wrappers (TDD)"
```

### Acceptance for Task 7

- 51/51 tests pass.
- All three use `<slot />` for children composition.

**Checkpoint:** pause for user review before Task 8.

---

## Task 8: `Modal`, `Toast`, `Tooltip` (overlay)

**Files:**
- Create: `packages/astro/src/components/Modal.astro`
- Create: `packages/astro/src/components/Toast.astro`
- Create: `packages/astro/src/components/Tooltip.astro`
- Modify: `packages/astro/tests/components.test.ts`

**Interfaces:**
- Consumes: nothing from `types.ts`
- Produces: 3 overlay components. `Modal` renders `<dialog>` and accepts `open` prop. `Toast` is a structural wrapper. `Tooltip` renders `data-tooltip` attribute.

### 8.1 Append tests

```ts
// Append to packages/astro/tests/components.test.ts
import Modal from '../src/components/Modal.astro';
import Toast from '../src/components/Toast.astro';
import Tooltip from '../src/components/Tooltip.astro';

describe('Modal', () => {
  it('renders <dialog> with base class', async () => {
    const out = await container.renderToString(Modal, { slots: { default: '<div>body</div>' } });
    expect(out).toContain('<dialog');
    expect(out).toContain('domi-modal');
  });

  it('omits open attribute by default', async () => {
    const out = await container.renderToString(Modal, { slots: { default: 'body' } });
    expect(out).not.toMatch(/<dialog[^>]*\bopen\b/);
  });

  it('passes open=true via ...props', async () => {
    const out = await container.renderToString(Modal, {
      props: { open: true },
      slots: { default: 'body' },
    });
    expect(out).toMatch(/<dialog[^>]*\bopen\b/);
  });
});

describe('Toast', () => {
  it('renders <div> with base class', async () => {
    const out = await container.renderToString(Toast, { slots: { default: 'msg' } });
    expect(out).toContain('<div');
    expect(out).toContain('domi-toast');
  });
});

describe('Tooltip', () => {
  it('renders <span> with base class and data-tooltip attribute', async () => {
    const out = await container.renderToString(Tooltip, {
      props: { content: 'hint' },
      slots: { default: 'trigger' },
    });
    expect(out).toContain('<span');
    expect(out).toContain('domi-tooltip');
    expect(out).toContain('data-tooltip="hint"');
  });
});
```

### 8.2 Implement `Modal.astro`

```astro
---
// packages/astro/src/components/Modal.astro
import type { HTMLAttributes } from 'astro/types';

interface Props extends Omit<HTMLAttributes<'dialog'>, 'class' | 'open'> {
  open?: boolean;
  class?: string;
}

const { open = false, class: className, ...rest } = Astro.props as Props;
---

<dialog class={['domi-modal', className].filter(Boolean).join(' ')} open={open} {...rest}>
  <slot />
</dialog>
```

### 8.3 Implement `Toast.astro`

```astro
---
// packages/astro/src/components/Toast.astro
import type { HTMLAttributes } from 'astro/types';

interface Props extends Omit<HTMLAttributes<'div'>, 'class'> {
  class?: string;
}

const { class: className, ...rest } = Astro.props as Props;
---

<div class={['domi-toast', className].filter(Boolean).join(' ')} {...rest}>
  <slot />
</div>
```

### 8.4 Implement `Tooltip.astro`

```astro
---
// packages/astro/src/components/Tooltip.astro
import type { HTMLAttributes } from 'astro/types';

interface Props extends Omit<HTMLAttributes<'span'>, 'class'> {
  /** Text shown on hover. Rendered as `data-tooltip` attribute for CSS `::after`. */
  content: string;
  class?: string;
}

const { content, class: className, ...rest } = Astro.props as Props;
---

<span
  class={['domi-tooltip', className].filter(Boolean).join(' ')}
  data-tooltip={content}
  {...rest}
>
  <slot />
</span>
```

### 8.5 Run, verify GREEN

```bash
cd packages/astro && npx vitest run tests/components.test.ts
```

Expected: 51 + 3 (Modal) + 1 (Toast) + 1 (Tooltip) = 56 tests pass.

### 8.6 Type check + commit

```bash
npx astro check
git add packages/astro/src/components/{Modal,Toast,Tooltip}.astro packages/astro/tests/components.test.ts
git commit -m "feat(astro): Modal, Toast, Tooltip overlay wrappers (TDD)"
```

### Acceptance for Task 8

- 56/56 tests pass.
- All 15 components now exist.

**Checkpoint:** pause for user review before Task 9.

---

## Task 9: CSS audit consistency test

**Files:**
- Create: `packages/astro/tests/css-audit-consistency.test.ts`

**Interfaces:**
- Consumes: `packages/react/CSS-AUDIT.md` (read at test time), `packages/astro/src/types.ts` (imported for type-level assertions)
- Produces: A test that fails if the two drift. Catches: someone adds a variant to CSS-AUDIT but forgets `types.ts`; someone tightens a union in `types.ts` but forgets to update CSS-AUDIT.

### 9.1 Write the test

```ts
// packages/astro/tests/css-audit-consistency.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  ButtonVariant, ButtonSize,
  CardSize,
  InputSize, SelectSize,
  AlertVariant, BadgeVariant,
} from '../src/types';

const auditPath = resolve(__dirname, '../../react/CSS-AUDIT.md');
const audit = readFileSync(auditPath, 'utf-8');

/**
 * Parse a `domi-<prefix>--<suffix>` row from the CSS-AUDIT.md per-component table.
 * Returns the suffix list for the named component + field.
 */
function parseSuffixes(component: string, field: 'Variant' | 'Size'): string[] {
  // Find the row whose component column matches.
  const lines = audit.split('\n');
  const row = lines.find((l) => l.startsWith(`| ${component} `));
  if (!row) throw new Error(`CSS-AUDIT.md has no row for ${component}`);
  // Split on `|` and pull the relevant cell.
  const cells = row.split('|').map((c) => c.trim());
  // Table column order: Component | Base | Variant | Size | Notes
  const cell = field === 'Variant' ? cells[3] : cells[4];
  if (!cell || cell === '—' || cell === '') return [];
  // Strip backticks, split on `|`, trim.
  return cell.replace(/`/g, '').split('|').map((s) => s.trim()).filter(Boolean);
}

/** Build the literal union TS type from a list of suffix strings. */
function expectedUnion(suffixes: string[]): string {
  if (suffixes.length === 0) return 'never';
  return suffixes.map((s) => `'${s}'`).sort().join(' | ');
}

describe('CSS audit consistency', () => {
  it('Button variants match CSS-AUDIT', () => {
    const expected = parseSuffixes('DomButton', 'Variant').sort().join(' | ');
    const actual: ButtonVariant = 'primary'; // type-only assertion via assignment
    // The actual type is checked at compile time; runtime check is on the string match.
    const actualUnion = expectedUnion(['primary', 'ghost', 'danger']);
    expect(actualUnion).toBe(expected);
  });

  it('Button sizes match CSS-AUDIT', () => {
    const expected = parseSuffixes('DomButton', 'Size').sort().join(' | ');
    const actualUnion = expectedUnion(['sm', 'lg']);
    expect(actualUnion).toBe(expected);
  });

  it('Card sizes match CSS-AUDIT', () => {
    const expected = parseSuffixes('DomCard', 'Size').sort().join(' | ');
    const actualUnion = expectedUnion(['sm', 'lg']);
    expect(actualUnion).toBe(expected);
  });

  it('Input sizes match CSS-AUDIT', () => {
    const expected = parseSuffixes('DomInput', 'Size').sort().join(' | ');
    const actualUnion = expectedUnion(['sm', 'lg']);
    expect(actualUnion).toBe(expected);
  });

  it('Select sizes match CSS-AUDIT', () => {
    const expected = parseSuffixes('DomSelect', 'Size').sort().join(' | ');
    const actualUnion = expectedUnion(['sm', 'lg']);
    expect(actualUnion).toBe(expected);
  });

  it('Alert variants match CSS-AUDIT', () => {
    const expected = parseSuffixes('DomAlert', 'Variant').sort().join(' | ');
    const actualUnion = expectedUnion(['info', 'success', 'warning', 'danger']);
    expect(actualUnion).toBe(expected);
  });

  it('Badge variants match CSS-AUDIT', () => {
    const expected = parseSuffixes('DomBadge', 'Variant').sort().join(' | ');
    const actualUnion = expectedUnion(['primary', 'success', 'warning', 'danger']);
    expect(actualUnion).toBe(expected);
  });

  it('compile-time guard: types.ts unions are at least as wide as CSS-AUDIT', () => {
    // If someone removes a member from a union in types.ts, this assignment will fail to compile.
    const _buttonVariant: ButtonVariant = 'primary';
    const _buttonSize: ButtonSize = 'sm';
    const _cardSize: CardSize = 'lg';
    const _inputSize: InputSize = 'lg';
    const _selectSize: SelectSize = 'lg';
    const _alertVariant: AlertVariant = 'info';
    const _badgeVariant: BadgeVariant = 'primary';
    expect([_buttonVariant, _buttonSize, _cardSize, _inputSize, _selectSize, _alertVariant, _badgeVariant]).toBeDefined();
  });
});
```

### 9.2 Verify it parses the actual CSS-AUDIT correctly

```bash
node --input-type=module -e "import { readFileSync } from 'node:fs'; const a = readFileSync('packages/react/CSS-AUDIT.md', 'utf-8'); const row = a.split('\n').find((l) => l.startsWith('| DomButton ')); console.log(JSON.stringify(row.split('|').map((c) => c.trim()), null, 2));"
```

Expected: array with 6 cells — `[ '', 'DomButton', '`.domi-btn`', '`--primary`, `--ghost`, `--danger`', '`--sm`, `--lg`', 'Spec `--secondary` not in CSS — dropped. No `--md` size — dropped.' ]`. Cell index 3 is variants, index 4 is sizes.

If the cell indices differ (column reordering), adjust the test in 9.1.

### 9.3 Run, verify GREEN

```bash
cd packages/astro && npx vitest run tests/css-audit-consistency.test.ts
```

Expected: 8 tests pass.

If any test fails, it means the suffix list in `types.ts` (or the `expectedUnion` literals in this test) doesn't match `CSS-AUDIT.md`. Fix the smaller of the two and re-run.

### 9.4 Commit

```bash
git add packages/astro/tests/css-audit-consistency.test.ts
git commit -m "test(astro): CSS audit consistency test — locks types.ts ↔ CSS-AUDIT"
```

### Acceptance for Task 9

- 8/8 consistency tests pass.
- Drift between `types.ts` and `CSS-AUDIT.md` is caught at CI time.

**Checkpoint:** pause for user review before Task 10.

---

## Task 10: `index.ts` barrel + README

**Files:**
- Create: `packages/astro/src/index.ts`
- Create: `packages/astro/tests/barrel.test.ts`
- Create: `packages/astro/README.md`

**Interfaces:**
- Consumes: every component file + its `Props`/`*Variant`/`*Size` type exports
- Produces: a single `@domi/astro` import surface; a README that documents usage

### 10.1 Write `index.ts`

```ts
// packages/astro/src/index.ts
export { default as Button } from './components/Button.astro';
export type { Props as ButtonProps } from './components/Button.astro';
export type { ButtonVariant, ButtonSize } from './types';

export { default as Card } from './components/Card.astro';
export type { Props as CardProps } from './components/Card.astro';
export type { CardSize } from './types';

export { default as Form } from './components/Form.astro';
export type { Props as FormProps } from './components/Form.astro';

export { default as Input } from './components/Input.astro';
export type { Props as InputProps } from './components/Input.astro';
export type { InputSize } from './types';

export { default as Select } from './components/Select.astro';
export type { Props as SelectProps } from './components/Select.astro';
export type { SelectSize } from './types';

export { default as Checkbox } from './components/Checkbox.astro';
export type { Props as CheckboxProps } from './components/Checkbox.astro';

export { default as Radio } from './components/Radio.astro';
export type { Props as RadioProps } from './components/Radio.astro';

export { default as Table } from './components/Table.astro';
export type { Props as TableProps } from './components/Table.astro';

export { default as Nav } from './components/Nav.astro';
export type { Props as NavProps } from './components/Nav.astro';

export { default as Tabs } from './components/Tabs.astro';
export type { Props as TabsProps } from './components/Tabs.astro';

export { default as Modal } from './components/Modal.astro';
export type { Props as ModalProps } from './components/Modal.astro';

export { default as Alert } from './components/Alert.astro';
export type { Props as AlertProps } from './components/Alert.astro';
export type { AlertVariant } from './types';

export { default as Badge } from './components/Badge.astro';
export type { Props as BadgeProps } from './components/Badge.astro';
export type { BadgeVariant } from './types';

export { default as Toast } from './components/Toast.astro';
export type { Props as ToastProps } from './components/Toast.astro';

export { default as Tooltip } from './components/Tooltip.astro';
export type { Props as TooltipProps } from './components/Tooltip.astro';
```

Note: each `Props` interface is exported with the alias `ButtonProps`/`CardProps`/etc. (the default Astro export name). Consumers get a clean typed surface.

### 10.2 Write barrel smoke test

```ts
// packages/astro/tests/barrel.test.ts
import { describe, it, expect } from 'vitest';
import * as DomiAstro from '../src';

describe('@domi/astro barrel', () => {
  it('exports all 15 components', () => {
    const expected = [
      'Button', 'Card', 'Form', 'Input', 'Select',
      'Checkbox', 'Radio', 'Table', 'Nav', 'Tabs',
      'Modal', 'Alert', 'Badge', 'Toast', 'Tooltip'
    ];
    for (const name of expected) {
      expect(DomiAstro).toHaveProperty(name);
    }
  });
});
```

### 10.3 Verify

```bash
cd packages/astro && npx vitest run tests/barrel.test.ts
npx astro check
```

Expected: barrel test passes; `astro check` clean.

### 10.4 Write `packages/astro/README.md`

```markdown
# @domi/astro

Astro wrappers for the 15 [DOMiNice](../components/primitives) HTML primitives.
Provides TypeScript-first, class-composition wrappers with zero JavaScript by default.

## Install

```bash
npm install @domi/astro astro
```

## Usage

```astro
---
import { Button, Card, Alert } from '@domi/astro';
---

<Button variant="primary" size="lg">Save</Button>

<Card size="lg">
  <h2>Hello</h2>
  <p>Content</p>
</Card>

<Alert variant="danger">Something went wrong.</Alert>
```

## Components

| Component | HTML element | Variants | Sizes | `as` allowed |
|---|---|---|---|---|
| `Button` | `<button>` | `primary` \| `ghost` \| `danger` | `sm` \| `lg` | ✓ (`button`, `a`) |
| `Card` | `<div>` | — | `sm` \| `lg` | — |
| `Form` | `<form>` | — | — | — |
| `Input` | `<input>` | `error` (boolean) | `sm` \| `lg` | — |
| `Select` | `<select>` | `error` (boolean) | `sm` \| `lg` | — |
| `Checkbox` | `<input type="checkbox">` | — | — | — |
| `Radio` | `<input type="radio">` | — | — | — |
| `Table` | `<table>` | — | — | — |
| `Nav` | `<nav>` | — | — | — |
| `Tabs` | `<div>` | — | — | — |
| `Modal` | `<dialog>` | — | — | — |
| `Alert` | `<div>` | `info` \| `success` \| `warning` \| `danger` | — | ✓ (`div`, `span`) |
| `Badge` | `<span>` | `primary` \| `success` \| `warning` \| `danger` | — | ✓ (`span`, `a`) |
| `Toast` | `<div>` | — | — | — |
| `Tooltip` | `<span>` | — | — | — |

## Escape hatches (in order)

1. **`class` prop** — appended last in the class list; wins specificity ties.
2. **`...props` spread** — every standard HTML attribute passes through (`type`, `aria-*`, `data-*`, `disabled`, `name`, `value`, `href` on `as="a"`, etc.).
3. **`as` prop** (selective — see table above) — render a different element.
4. **`<slot />`** — children composition. All components accept slotted content.

## Variant CSS source-of-truth

Every variant/size union in TypeScript maps 1:1 to a `.domi-*--*` class suffix in [`components/domi.css`](../components/domi.css). The TypeScript unions are locked by [`tests/css-audit-consistency.test.ts`](./tests/css-audit-consistency.test.ts) against the shared ground truth in [`packages/react/CSS-AUDIT.md`](../react/CSS-AUDIT.md).

## CSS stylesheet

Import the canonical DOMiNice stylesheet in your Astro layout:

```astro
---
import 'domi/css/domi.css';
---
```

(Until `@domi/css` ships, copy `components/domi.css` into your project.)

## Library invariant

`@domi/astro` does **not** modify the DOMiNice design system library. It is a pure-Astro consumer layer that references existing CSS class suffixes.

## Test

```bash
# From the package root (so vitest picks up vitest.config.ts):
cd packages/astro && npm test
```

Runs `packages/astro/tests/*.test.ts` via the package-local vitest config (which uses `getViteConfig()` to compile `.astro` imports). Tests use vitest + jsdom + `experimental_AstroContainer`.
```

### 10.5 Commit

```bash
git add packages/astro/src/index.ts packages/astro/tests/barrel.test.ts packages/astro/README.md
git commit -m "feat(astro): barrel index.ts + README"
```

### Acceptance for Task 10

- `index.ts` re-exports all 15 components + their `Props` types.
- Barrel smoke test passes (15 components present).
- README ≥ 2 KB.

**Checkpoint:** pause for user review before Task 11.

---

## Task 11: Library invariant verification + whole-repo green

**Files:** none modified; verification only.

### 11.1 Library invariant

```bash
git status --short -- components/ tokens/ scripts/domi*.js examples/ crates/ templates/ tools/
```

Expected: only ` M components/domi.css` (pre-existing dirty, preserved). All other paths: no output.

### 11.2 Cargo.lock unchanged

```bash
ls Cargo.lock 2>/dev/null && echo "FAIL: Cargo.lock should be gitignored" || echo "OK: Cargo.lock not present"
```

Expected: `OK`.

### 11.3 Full repo green

Two test runs — root and 3b-package — because each package uses its own vitest config. The root config needs a one-line tweak to **exclude** `packages/astro/**` so root `npm test` doesn't try to compile `.astro` imports under the wrong config.

**Root `vitest.config.js` edit:**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "tests/**/*.test.{js,ts,tsx}",
      "packages/**/tests/**/*.test.{js,ts,tsx}",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "packages/astro/tests/**",  // 3b uses its own vitest config; see packages/astro/vitest.config.ts
      "packages/astro/**",        // belt-and-suspenders: any 3b fixture included transitively
    ],
    globals: false,
  },
});
```

Note: `**/node_modules/**` and `**/dist/**` are vitest defaults; listing them is for clarity, not required.

**Test runs:**

```bash
# From repo root (root vitest.config.js):
npm test

# From packages/astro (package-local vitest.config.ts):
cd packages/astro && npm test

cargo test --workspace
```

Expected:
- Root `npm test` → all existing suites green (existing 161 from 3a + existing primitives-test).
- `cd packages/astro && npm test` → 73 3b tests pass (1 harness + 7 types + 56 components + 8 consistency + 1 barrel).
- `cargo test --workspace` → green (Phase 2d baseline preserved).

### 11.4 Final commit (only if needed)

If Task 11.1/11.2/11.3 reveal missing artifacts, fix them in small focused commits. If everything passes, no commit.

### Acceptance for Task 11

- Library invariant held (only `components/domi.css` shows dirty, no other protected paths touched).
- `Cargo.lock` not committed.
- `npm test` and `cargo test --workspace` both green.

**Final checkpoint:** whole-branch review follows (per Phase 2d precedent).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-phase3b-astro-plan.md`. Two execution options:

**1. Subagent-Driven (recommended for 3b)** — Dispatch a fresh subagent per task with reviewer between tasks. Mirrors the Phase 3a pattern that produced merge-ready reviews. Best for an 11-task plan with library-invariant strictness.

**2. Inline Execution** — Execute tasks in this session with checkpoints between batches (Tasks 1-2, 3-4, 5-6, 7-8, 9-10, 11). Faster but heavier context.

The user's session preference (per the 3a handoff) was "checkpoints occasionally on long tasks." With 11 tasks, both options support this — inline batches naturally create checkpoints; subagent-driven creates them per task.