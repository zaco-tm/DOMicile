# @domi/astro

Astro wrappers for the 15 [DOMicile](../components/primitives) HTML primitives.
Provides TypeScript-first, class-composition wrappers with **zero JavaScript by default** — components compile to plain HTML; consumers' Astro compiler handles them.

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
2. **`{...Astro.props}` spread** — every standard HTML attribute passes through (`type`, `aria-*`, `data-*`, `disabled`, `name`, `value`, `href` on `as="a"`, etc.).
3. **`as` prop** (selective — see table above) — render a different element.
4. **`<slot />`** — children composition. All components accept slotted content.

## Variant CSS source-of-truth

Every variant/size union in TypeScript maps 1:1 to a `.domi-*--*` class suffix in [`components/domi.css`](../components/domi.css). The TypeScript unions are locked by `packages/astro/tests/audit-consistency.test.ts` against the shared ground truth in [`packages/react/CSS-AUDIT.md`](../react/CSS-AUDIT.md).

## CSS stylesheet

Import the canonical DOMicile stylesheet in your Astro layout:

```astro
---
import 'domi/css/domi.css';
---
```

(Until `@domi/css` ships, copy `components/domi.css` into your project.)

## Library invariant

`@domi/astro` does **not** modify the DOMicile design system library. It is a pure-Astro consumer layer that references existing CSS class suffixes.

## Test

```bash
# From the package root (so vitest picks up vitest.config.mjs):
cd packages/astro && npm test
```

Runs `packages/astro/tests/*.test.ts` (vitest + node env). Tests use static analysis — they read each `.astro` file, parse the frontmatter, and evaluate the class expression against supplied props. We chose static analysis over Astro's `experimental_AstroContainer` because that API fails to initialize in this Astro 5 + vitest 2.x + Node 24 combination (opaque `[object Object]` error during plugin init). When Astro's vitest story stabilizes, `tests/parser.ts` is the one file to swap.
