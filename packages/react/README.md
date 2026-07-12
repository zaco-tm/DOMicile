# domicile-react

React wrappers for the 15 [DOMicile](../components/primitives) HTML primitives.
Provides TypeScript-first, class-composition wrappers with escape hatches (`className`, `...props`, `as`, `ref`).

## Install

```bash
npm install domicile-react react react-dom
```

## Usage

```tsx
import { DomButton, DomCard, DomAlert } from 'domicile-react';

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

Outputs `packages/react/dist/{index.js,index.cjs,index.d.ts,index.d.cts}` (ESM + CJS + types).

## Test

```bash
npm test
```

Runs all repo tests including `packages/react/tests/*.test.tsx` (vitest + jsdom).

## Library invariant

`domicile-react` does **not** modify the DOMicile design system library (`tokens/`, `components/`, `scripts/domi*.js`, `examples/`). It is a pure-React consumer layer.
