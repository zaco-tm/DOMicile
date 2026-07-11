# DOMiNice Phase 1 — Skill Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the smallest opensourceable DOMiNice artifact — an HTML-first design system with 15 primitives, 5 archetypes, a `domi.js` standalone runtime, full docs, and the SKILL.md that teaches an AI agent to author DOMiNice HTML files. No live server yet (Phase 2).

**Architecture:** Tokens (JSON) → CSS custom properties → primitive CSS classes → HTML snippets → archetypes that compose primitives → `domi.js` for interactivity → SKILL.md teaches the agent the pattern.

**Tech Stack:**
- **Tokens:** JSON, validated with `ajv`
- **CSS:** hand-written, linted with `stylelint`
- **JS:** vanilla (no build), tested with `vitest` + `jsdom`
- **Tests:** vitest + jsdom (HTML primitives), vitest (domi.js), ajv (tokens.json), stylelint (CSS)
- **No bundler, no framework, no Tailwind, no React.** HTML + CSS + vanilla JS only for Phase 1.
- **Lint:** stylelint (CSS), eslint (JS), markdownlint (md)

## Global Constraints

These apply to every task. Copied verbatim from the spec.

- **License:** MIT (decided for Phase 1 — matches permissive opensource goal)
- **Repo root:** `/Users/zaco/Projects/Personal/DOMicile/`
- **Palette (locked tokens):** primary gradient `#a89cc8 → #f4978e → #ffd6b3` at 135° · sage `#9caf88` · plum `#a89cc8` · dark plum `#3d2342` · glass `rgba(255,255,255,0.4–0.8)` with `backdrop-filter: blur(12px)`
- **Type system:** display = `'Helvetica Neue', 'Arial Black', sans-serif` weight 900 uppercase · body/label = `'SF Mono', 'JetBrains Mono', monospace`
- **Radius scale:** `4px` (badge), `8px` (button/input), `16px` (card), `9999px` (pill, opt-in)
- **15 primitives for Phase 1:** `button`, `card`, `input`, `select`, `checkbox`, `radio`, `form`, `table`, `nav`, `modal`, `alert`, `badge`, `tabs`, `toast`, `tooltip`
- **5 archetypes:** `dashboard`, `webapp-shell`, `mobile-app-shell`, `admin-tool`, `pos-kiosk`
- **Doc formats:** MD for `docs/DESIGN.md`, `docs/USAGE.md`, `docs/STANDARDS.md` (human-editable). HTML for `status/STATUS.html`, `status/UX-MEMORY.html` (agent-maintained, human-reads).
- **Standalone-first:** every artifact must open via `file://` with zero infra. No CDN, no build step.
- **5 archetypes explicitly include `pos-kiosk`** (touch-target + high-contrast considerations baked into that template).
- **Sponsorship:** sponsored by stoopery (stoopery.app), icon at `branding/sponsor-stoopery.svg`, surfaces in README + release notes.
- **No blogs, no CMS, no hosted server, no auth, no multi-user, no React/Rust in Phase 1.**
- **Commit style:** Conventional Commits (`feat:`, `chore:`, `docs:`, `test:`), one commit per task minimum.

---

## File Structure (locked from spec, plus Phase 1 adds)

```
DOMiNice/
├── README.md
├── LICENSE                              # MIT
├── SKILL.md
├── package.json                         # vitest, eslint, stylelint, ajv, jsdom
├── .eslintrc.json
├── .stylelintrc.json
├── .markdownlint.json
├── tsconfig.json                        # for vitest typing
├── vitest.config.js
│
├── docs/
│   ├── DESIGN.md
│   ├── USAGE.md
│   └── STANDARDS.md
│
├── status/
│   ├── STATUS.html
│   └── UX-MEMORY.html
│
├── tokens/
│   ├── tokens.json                      # source of truth
│   └── tokens.schema.json               # ajv schema for validation
│
├── components/
│   ├── domi.css                         # compiled bundle of all primitive CSS
│   └── primitives/
│       ├── button/{button.html,button.css,README.md,demo.html}
│       ├── card/...
│       └── ... (15 primitives)
│
├── scripts/
│   └── domi.js                          # standalone-mode runtime
│
├── templates/
│   ├── dashboard/{index.html,README.md}
│   ├── webapp-shell/
│   ├── mobile-app-shell/
│   ├── admin-tool/
│   └── pos-kiosk/
│
├── tools/
│   ├── tokens-to-css.mjs                # generates domi.css from tokens.json
│   └── smoke.mjs                        # opens a primitive in jsdom, asserts no errors
│
├── tests/
│   ├── primitives/<name>.test.js        # per-primitive structural test
│   ├── domi.test.js                     # domi.js unit tests
│   ├── tokens.test.js                   # tokens.json schema validation
│   └── css.test.js                      # stylelint passes
│
├── scripts/
│   ├── install.sh                       # Phase 1 stub — clones repo / prints next steps
│   └── verify.sh                        # runs all tests + smoke check
│
├── branding/
│   └── sponsor-stoopery.svg             # already created
│
└── .domi/, .superpowers/, target/, node_modules/   # all gitignored
```

---

## Task 1: Repo foundations — README, LICENSE, package.json, lint configs

**Files:**
- Create: `LICENSE`
- Create: `package.json`
- Create: `.eslintrc.json`
- Create: `.stylelintrc.json`
- Create: `.markdownlint.json`
- Create: `vitest.config.js`
- Modify: `README.md` (replace placeholder)

- [ ] **Step 1: Create LICENSE (MIT)**

```text
MIT License

Copyright (c) 2026 DOMiNice contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "dominice",
  "version": "0.1.0",
  "description": "Cross-platform UI design system with AI-agent authoring layer",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . && stylelint \"components/**/*.css\" && markdownlint \"**/*.md\"",
    "tokens:build": "node tools/tokens-to-css.mjs",
    "smoke": "node tools/smoke.mjs"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "jsdom": "^25.0.0",
    "eslint": "^9.0.0",
    "stylelint": "^16.0.0",
    "stylelint-config-standard": "^36.0.0",
    "markdownlint-cli": "^0.42.0",
    "ajv": "^8.17.0",
    "ajv-formats": "^3.0.1"
  },
  "license": "MIT"
}
```

- [ ] **Step 3: Create `.eslintrc.json`**

```json
{
  "root": true,
  "env": { "browser": true, "node": true, "es2024": true },
  "rules": {
    "no-unused-vars": "warn",
    "no-undef": "error",
    "semi": ["error", "always"],
    "quotes": ["error", "single", { "avoidEscape": true }]
  }
}
```

- [ ] **Step 4: Create `.stylelintrc.json`**

```json
{
  "extends": "stylelint-config-standard",
  "rules": {
    "selector-class-pattern": null,
    "custom-property-pattern": null,
    "no-descending-specificity": null
  }
}
```

- [ ] **Step 5: Create `.markdownlint.json`**

```json
{
  "default": true,
  "MD013": false,
  "MD033": false
}
```

- [ ] **Step 6: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    globals: false
  }
});
```

- [ ] **Step 7: Write `README.md`**

```markdown
# DOMiNice

A cross-platform UI design system with an AI-agent authoring layer. **The driving documents in any agent↔human loop are interactive HTML, not markdown.**

> Sponsored by [stoopery](https://stoopery.app)

## What's in v0.1 (Phase 1)

- 🎨 Design tokens (`tokens.json`) — single source of truth
- 🧱 15 HTML primitives — buttons, cards, forms, tables, navs, modals, alerts, badges, tabs, toasts, tooltips, inputs, selects, checkboxes, radios
- 📐 5 archetype templates — dashboard, webapp-shell, mobile-app-shell, admin-tool, pos-kiosk
- ⚡ `domi.js` standalone runtime — click-to-feedback, form capture, version chips
- 📚 Full docs — DESIGN, USAGE, STANDARDS (md) + STATUS, UX-MEMORY (html)

## What's coming

- 🔴 **Phase 2:** Live server (`domi serve`) — Rust binary, folder-watch, real-time feedback loop
- 🟡 **Phase 3:** `@domi/react`, `@domi/astro`, `domi-dvui` (Rust crate) — multi-target wrappers
- 🟢 **Phase 4:** v1.0 — distribution, examples, CI

## Quickstart (Phase 1)

```bash
git clone https://github.com/your-org/dominice.git
cd dominice
npm install
npm test
```

Open any `templates/*/index.html` in a browser — no server needed.

## License

MIT
```

- [ ] **Step 8: Install + verify**

Run:
```bash
npm install
npm test
```
Expected: vitest runs, 0 tests pass (no tests yet), exit 0.

- [ ] **Step 9: Commit**

```bash
git add LICENSE package.json .eslintrc.json .stylelintrc.json .markdownlint.json vitest.config.js README.md package-lock.json
git commit -m "chore: repo foundations (license, configs, readme)"
```

---

## Task 2: tokens.json + JSON Schema validation

**Files:**
- Create: `tokens/tokens.json`
- Create: `tokens/tokens.schema.json`
- Create: `tests/tokens.test.js`

- [ ] **Step 1: Write `tokens/tokens.json`** — locked palette from spec section 4.1

```json
{
  "color": {
    "primary": {
      "gradient": ["#a89cc8", "#f4978e", "#ffd6b3"],
      "angle": "135deg"
    },
    "secondary": { "sage": "#9caf88", "sage_light": "#c8d6b8" },
    "accent":    { "plum": "#a89cc8", "plum_light": "#d8d0e8" },
    "text":      { "default": "#3d2342", "muted": "#3d2342aa", "inverse": "#fff1e6" },
    "surface":   { "glass": "#ffffff60", "glass_strong": "#ffffff80", "tint": "#3d234208" }
  },
  "type": {
    "display": { "family": "'Helvetica Neue', 'Arial Black', sans-serif", "weight": 900, "transform": "uppercase", "letterSpacing": "-0.02em" },
    "body":    { "family": "'SF Mono', 'JetBrains Mono', monospace", "weight": 400 },
    "label":   { "family": "'SF Mono', 'JetBrains Mono', monospace", "weight": 700 }
  },
  "radius":   { "sm": "4px", "md": "8px", "lg": "16px", "pill": "9999px" },
  "glass":    { "blur": "12px", "bgOpacity": 0.4, "borderOpacity": 0.4 },
  "border":   { "thin": "1px solid rgba(61,35,66,0.4)", "thick": "2px solid #3d2342" },
  "space":    { "xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "40px" },
  "shadow":   { "soft": "0 2px 12px rgba(61,35,66,0.12)", "offset": "0 3px 0 #3d2342" },
  "breakpoint": { "sm": "640px", "md": "768px", "lg": "1024px", "xl": "1280px" }
}
```

- [ ] **Step 2: Write `tokens/tokens.schema.json`** — ajv schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["color", "type", "radius", "glass", "border", "space", "shadow", "breakpoint"],
  "properties": {
    "color": {
      "type": "object",
      "required": ["primary", "secondary", "accent", "text", "surface"],
      "properties": {
        "primary": {
          "type": "object",
          "required": ["gradient", "angle"],
          "properties": {
            "gradient": { "type": "array", "items": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" }, "minItems": 3, "maxItems": 3 },
            "angle": { "type": "string" }
          }
        },
        "secondary": { "type": "object", "required": ["sage", "sage_light"], "properties": { "sage": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" }, "sage_light": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" } } },
        "accent":    { "type": "object", "required": ["plum", "plum_light"], "properties": { "plum": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" }, "plum_light": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" } } },
        "text":      { "type": "object", "required": ["default", "muted", "inverse"], "properties": { "default": { "type": "string" }, "muted": { "type": "string" }, "inverse": { "type": "string" } } },
        "surface":   { "type": "object", "required": ["glass", "glass_strong", "tint"], "properties": { "glass": { "type": "string" }, "glass_strong": { "type": "string" }, "tint": { "type": "string" } } }
      }
    },
    "type": {
      "type": "object",
      "required": ["display", "body", "label"],
      "properties": {
        "display": { "type": "object", "required": ["family", "weight", "transform", "letterSpacing"] },
        "body":    { "type": "object", "required": ["family", "weight"] },
        "label":   { "type": "object", "required": ["family", "weight"] }
      }
    },
    "radius":     { "type": "object", "required": ["sm", "md", "lg", "pill"], "additionalProperties": { "type": "string" } },
    "glass":      { "type": "object", "required": ["blur", "bgOpacity", "borderOpacity"], "properties": { "blur": { "type": "string" }, "bgOpacity": { "type": "number" }, "borderOpacity": { "type": "number" } } },
    "border":     { "type": "object", "required": ["thin", "thick"], "additionalProperties": { "type": "string" } },
    "space":      { "type": "object", "required": ["xs", "sm", "md", "lg", "xl"], "additionalProperties": { "type": "string" } },
    "shadow":     { "type": "object", "required": ["soft", "offset"], "additionalProperties": { "type": "string" } },
    "breakpoint": { "type": "object", "required": ["sm", "md", "lg", "xl"], "additionalProperties": { "type": "string" } }
  },
  "additionalProperties": false
}
```

- [ ] **Step 3: Write failing test `tests/tokens.test.js`**

```js
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(resolve(here, '../tokens/tokens.json'), 'utf8'));
const schema = JSON.parse(readFileSync(resolve(here, '../tokens/tokens.schema.json'), 'utf8'));

describe('tokens.json', () => {
  it('matches the schema', () => {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const ok = validate(tokens);
    expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('locks the primary gradient to plum → coral → peach', () => {
    expect(tokens.color.primary.gradient).toEqual(['#a89cc8', '#f4978e', '#ffd6b3']);
  });

  it('locks text color to dark plum', () => {
    expect(tokens.color.text.default).toBe('#3d2342');
  });
});
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: `tests/tokens.test.js` passes (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tokens/ tests/tokens.test.js
git commit -m "feat(tokens): locked palette + ajv schema validation"
```

---

## Task 3: tokens → CSS custom properties generator

**Files:**
- Create: `tools/tokens-to-css.mjs`
- Create: `tests/css.test.js`
- Create: `components/domi.css` (generated; checked in for standalone-first promise)

- [ ] **Step 1: Write failing test `tests/css.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(here, '../components/domi.css');

describe('components/domi.css', () => {
  it('exists', () => {
    expect(existsSync(cssPath)).toBe(true);
  });

  it('declares all token CSS custom properties on :root', () => {
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/--domi-color-primary-gradient/);
    expect(css).toMatch(/--domi-color-text-default:\s*#3d2342/);
    expect(css).toMatch(/--domi-radius-md:\s*8px/);
    expect(css).toMatch(/--domi-glass-blur:\s*12px/);
  });

  it('applies primary gradient as a background-image', () => {
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/linear-gradient\(135deg,\s*#a89cc8,\s*#f4978e,\s*#ffd6b3\)/);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- tests/css.test.js`
Expected: FAIL — `components/domi.css` doesn't exist.

- [ ] **Step 3: Write `tools/tokens-to-css.mjs`**

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(resolve(here, '../tokens/tokens.json'), 'utf8'));

const lines = ['/* AUTO-GENERATED from tokens/tokens.json — do not edit by hand */', ':root {'];

const flatten = (obj, prefix = '--domi') => {
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}-${k.replace(/_/g, '-')}`;
    if (typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key);
    } else if (Array.isArray(v)) {
      lines.push(`  ${key}: ${v.join(', ')};`);
    } else {
      lines.push(`  ${key}: ${v};`);
    }
  }
};
flatten(tokens);
lines.push('}');
lines.push('');
lines.push('.domi-bg-primary {');
lines.push(`  background-image: linear-gradient(${tokens.color.primary.angle}, ${tokens.color.primary.gradient.join(', ')});`);
lines.push('}');

mkdirSync(resolve(here, '../components'), { recursive: true });
writeFileSync(resolve(here, '../components/domi.css'), lines.join('\n'));
console.log('✓ wrote components/domi.css');
```

- [ ] **Step 4: Run generator + test**

Run:
```bash
npm run tokens:build
npm test -- tests/css.test.js
```
Expected: `domi.css` created, all 3 css tests pass.

- [ ] **Step 5: Commit**

```bash
git add tools/tokens-to-css.mjs tests/css.test.js components/domi.css
git commit -m "feat(css): tokens-to-css generator + generated domi.css"
```

---

## Task 4: Base CSS layer (reset + typography utilities)

**Files:**
- Modify: `components/domi.css` (append base layer; or split — for Phase 1 we keep one file)

- [ ] **Step 1: Extend `tools/tokens-to-css.mjs` to also append the base layer**

Append after the existing generator output:

```js
lines.push('');
lines.push('/* Reset */');
lines.push('*, *::before, *::after { box-sizing: border-box; }');
lines.push('html, body { margin: 0; padding: 0; }');
lines.push('body {');
lines.push(`  font-family: ${tokens.type.body.family};`);
lines.push(`  font-weight: ${tokens.type.body.weight};`);
lines.push(`  color: var(--domi-color-text-default);`);
lines.push('  background: var(--domi-color-surface-glass);');
lines.push('  min-height: 100vh;');
lines.push('}');
lines.push('');
lines.push('/* Typography utilities */');
lines.push('.domi-display {');
lines.push(`  font-family: ${tokens.type.display.family};`);
lines.push(`  font-weight: ${tokens.type.display.weight};`);
lines.push(`  text-transform: ${tokens.type.display.transform};`);
lines.push(`  letter-spacing: ${tokens.type.display.letterSpacing};`);
lines.push('  margin: 0;');
lines.push('}');
lines.push('.domi-label {');
lines.push(`  font-family: ${tokens.type.label.family};`);
lines.push(`  font-weight: ${tokens.type.label.weight};`);
lines.push('}');
lines.push('.domi-glass {');
lines.push('  background: var(--domi-color-surface-glass);');
lines.push('  backdrop-filter: blur(var(--domi-glass-blur));');
lines.push('  -webkit-backdrop-filter: blur(var(--domi-glass-blur));');
lines.push('  border: var(--domi-border-thin);');
lines.push('  border-radius: var(--domi-radius-md);');
lines.push('}');
```

- [ ] **Step 2: Regenerate + verify**

Run:
```bash
npm run tokens:build
npm test
```
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tools/tokens-to-css.mjs components/domi.css
git commit -m "feat(css): base reset + typography + glass utilities"
```

---

## Task 5: Primitive — `button`

**Files:**
- Create: `components/primitives/button/button.html`
- Create: `components/primitives/button/button.css`
- Create: `components/primitives/button/demo.html`
- Create: `components/primitives/button/README.md`
- Create: `tests/primitives/button.test.js`
- Modify: `components/domi.css` (add button rules; either regenerate via extended tool or append)

- [ ] **Step 1: Write `components/primitives/button/button.css`**

```css
.domi-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--domi-space-sm);
  font-family: var(--domi-type-body-family, 'SF Mono', 'JetBrains Mono', monospace);
  font-weight: 700;
  font-size: 13px;
  padding: 9px 16px;
  border-radius: var(--domi-radius-md);
  border: 1px solid rgba(61, 35, 66, 0.4);
  background: var(--domi-color-surface-glass);
  backdrop-filter: blur(var(--domi-glass-blur));
  -webkit-backdrop-filter: blur(var(--domi-glass-blur));
  color: var(--domi-color-text-default);
  cursor: pointer;
  transition: transform 80ms ease, box-shadow 120ms ease;
  text-decoration: none;
}
.domi-btn:hover { box-shadow: var(--domi-shadow-soft); }
.domi-btn:active { transform: translateY(1px); }
.domi-btn:focus-visible { outline: 2px solid var(--domi-color-accent-plum); outline-offset: 2px; }
.domi-btn--primary { background-image: var(--domi-color-primary-gradient, linear-gradient(135deg, #a89cc8, #f4978e, #ffd6b3)); color: var(--domi-color-text-default); }
.domi-btn--ghost { background: transparent; border-color: transparent; }
.domi-btn--danger { border-color: #c2410c; color: #c2410c; }
.domi-btn--sm { padding: 5px 10px; font-size: 11px; }
.domi-btn--lg { padding: 12px 22px; font-size: 15px; }
```

- [ ] **Step 2: Write `components/primitives/button/button.html`**

```html
<!-- Canonical button snippet — copy this into any DOMiNice artifact -->
<button class="domi-btn" type="button">Label</button>

<!-- Variants:
     .domi-btn--primary   gradient bg
     .domi-btn--ghost     transparent
     .domi-btn--danger    error state
     .domi-btn--sm / --lg size scale -->
```

- [ ] **Step 3: Write `components/primitives/button/demo.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>button — domi</title>
  <link rel="stylesheet" href="../../domi.css">
</head>
<body style="padding:40px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
  <button class="domi-btn" type="button">Default</button>
  <button class="domi-btn domi-btn--primary" type="button">Primary</button>
  <button class="domi-btn domi-btn--ghost" type="button">Ghost</button>
  <button class="domi-btn domi-btn--danger" type="button">Danger</button>
  <button class="domi-btn domi-btn--sm" type="button">Small</button>
  <button class="domi-btn domi-btn--lg" type="button">Large</button>
</body>
</html>
```

- [ ] **Step 4: Write `components/primitives/button/README.md`**

```markdown
# button

The atomic interaction primitive.

## Usage

```html
<button class="domi-btn" type="button">Save</button>
<button class="domi-btn domi-btn--primary" type="button">Continue</button>
```

## Variants

- `domi-btn` — default glass
- `domi-btn--primary` — primary gradient bg
- `domi-btn--ghost` — transparent
- `domi-btn--danger` — destructive action
- `domi-btn--sm` / `--lg` — size scale
```

- [ ] **Step 5: Write failing test `tests/primitives/button.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '../../components/primitives/button');

describe('primitives/button', () => {
  it('has all required files', () => {
    for (const f of ['button.html', 'button.css', 'demo.html', 'README.md']) {
      expect(existsSync(resolve(dir, f)), `missing ${f}`).toBe(true);
    }
  });

  it('demo.html contains all six variants', () => {
    const html = readFileSync(resolve(dir, 'demo.html'), 'utf8');
    for (const v of ['Default', 'Primary', 'Ghost', 'Danger', 'Small', 'Large']) {
      expect(html).toContain(v);
    }
  });

  it('domi.css contains button rules', () => {
    const css = readFileSync(resolve(dir, '../../domi.css'), 'utf8');
    expect(css).toMatch(/\.domi-btn\s*\{/);
    expect(css).toMatch(/\.domi-btn--primary/);
  });
});
```

- [ ] **Step 6: Append button CSS to `components/domi.css`** (manually, or extend the generator — for Phase 1 keep it manual and rebuild via the generator in Phase 2)

Append the contents of `components/primitives/button/button.css` to `components/domi.css`.

- [ ] **Step 7: Run test, verify pass**

Run: `npm test -- tests/primitives/button.test.js`
Expected: all 3 button tests pass.

- [ ] **Step 8: Commit**

```bash
git add components/primitives/button/ tests/primitives/button.test.js components/domi.css
git commit -m "feat(primitives): button"
```

---

## Tasks 6–18: Remaining 14 primitives

Each follows the same 8-step pattern as Task 5. Per task: create the primitive folder with `.html` + `.css` + `demo.html` + `README.md`, write a vitest test, append CSS to `domi.css`, commit.

**Task 6: card** — `.domi-card` glass surface with optional header/body/footer slots; size variants `--sm/--lg`
**Task 7: input** — `<input class="domi-input">`, states `default/focus/error/disabled`, sizes `--sm/--lg`
**Task 8: select** — `<select class="domi-select">` styled to match input
**Task 9: checkbox** — `<input type="checkbox" class="domi-check">` + label pattern
**Task 10: radio** — `<input type="radio" class="domi-radio">` + label pattern
**Task 11: form** — `.domi-form` layout primitives (row, col, label, help, error text)
**Task 12: table** — `.domi-table` with glass header, zebra rows, hover
**Task 13: nav** — `.domi-nav` horizontal top bar with logo slot + links + actions
**Task 14: modal** — `.domi-modal` overlay + dialog (works standalone via `<details>` element or pure CSS)
**Task 15: alert** — `.domi-alert` info/success/warning/danger variants
**Task 16: badge** — `.domi-badge` pill with color variants
**Task 17: tabs** — `.domi-tabs` with `.domi-tab` items, pure CSS via `:target` or radio inputs
**Task 18: tooltip** — `.domi-tooltip` hover-revealed via CSS only

(Plus **toast** and **drawer** may slip to Phase 2 if scope tightens — they're nice-to-haves. Final list ships the 15 spec'd primitives; if toast/drawer conflict with `<details>`-based modal complexity, defer one and document in STATUS.html.)

For each primitive, the CSS classes follow the `.domi-<name>` convention. The vitest test pattern is identical to Task 5.

---

## Task 19: `domi.js` standalone runtime

**Files:**
- Create: `scripts/runtime/domi.js`
- Create: `tests/domi.test.js`

- [ ] **Step 1: Write failing test `tests/domi.test.js`**

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const domiSrc = readFileSync(resolve(here, '../scripts/runtime/domi.js'), 'utf8');

describe('domi.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.clear();
    delete window.__DOMI_SERVER__;
    // Re-eval the script after each reset so init() runs fresh
    const s = document.createElement('script');
    s.textContent = domiSrc;
    document.head.appendChild(s);
  });

  it('exposes a DOMi global', () => {
    expect(window.DOMi).toBeTruthy();
    expect(typeof window.DOMi.exportFeedback).toBe('function');
  });

  it('logs click events on [data-feedback] to localStorage', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-feedback', 'apply');
    btn.textContent = 'Apply';
    document.getElementById('root').appendChild(btn);
    btn.click();

    const events = JSON.parse(localStorage.getItem('domi:events:test') || '[]');
    expect(events.some(e => e.type === 'click' && e.value === 'apply')).toBe(true);
  });

  it('captures input changes debounced to localStorage', () => {
    vi.useFakeTimers();
    const input = document.createElement('input');
    input.name = 'projectName';
    document.getElementById('root').appendChild(input);
    input.value = 'Acme Co';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(500);

    const inputs = JSON.parse(localStorage.getItem('domi:inputs:test') || '{}');
    expect(inputs.projectName).toBe('Acme Co');
    vi.useRealTimers();
  });

  it('exportFeedback() returns a Blob URL of the events.jsonl', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-feedback', 'a');
    document.getElementById('root').appendChild(btn);
    btn.click();
    const blob = window.DOMi.exportFeedback();
    expect(blob).toBeTruthy();
    expect(typeof blob).toBe('string'); // URL.createObjectURL returns string
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- tests/domi.test.js`
Expected: FAIL — `scripts/runtime/domi.js` missing.

- [ ] **Step 3: Write `scripts/runtime/domi.js`**

```js
/* DOMiNice standalone runtime — Phase 1
   Captures clicks/inputs to localStorage; exports as JSONL.
   Server-attached mode (window.__DOMI_SERVER__) is Phase 2. */
(function () {
  'use strict';

  var page = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/, '') || 'index';
  var eventsKey = 'domi:events:' + page;
  var inputsKey = 'domi:inputs:' + page;

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (_) { return fallback; }
  }
  function writeJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function logEvent(ev) {
    var events = readJSON(eventsKey, []);
    events.push(Object.assign({ ts: new Date().toISOString(), page: page }, ev));
    writeJSON(eventsKey, events);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function init() {
    document.querySelectorAll('[data-feedback]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        logEvent({
          type: 'click',
          selector: el.getAttribute('data-feedback'),
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 80)
        });
      });
    });

    var saveInputs = debounce(function () {
      var inputs = {};
      document.querySelectorAll('input[name], textarea[name], select[name]').forEach(function (el) {
        inputs[el.name] = el.value;
      });
      writeJSON(inputsKey, inputs);
    }, 300);

    document.addEventListener('input', saveInputs);

    document.querySelectorAll('[data-export-feedback]').forEach(function (el) {
      el.addEventListener('click', function () {
        var url = window.DOMi.exportFeedback();
        var a = document.createElement('a');
        a.href = url;
        a.download = page + '-feedback.jsonl';
        a.click();
      });
    });
  }

  function exportFeedback() {
    var events = readJSON(eventsKey, []);
    var inputs = readJSON(inputsKey, {});
    var lines = events.map(function (e) { return JSON.stringify(e); });
    Object.keys(inputs).forEach(function (name) {
      lines.push(JSON.stringify({ type: 'input', name: name, value: inputs[name], ts: new Date().toISOString(), page: page }));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'application/jsonl' });
    return URL.createObjectURL(blob);
  }

  window.DOMi = { exportFeedback: exportFeedback, eventsKey: eventsKey, inputsKey: inputsKey };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test -- tests/domi.test.js`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/runtime/domi.js tests/domi.test.js
git commit -m "feat(domi.js): standalone runtime (localStorage feedback + export)"
```

---

## Task 20: Archetype — `dashboard`

**Files:**
- Create: `templates/dashboard/index.html`
- Create: `templates/dashboard/README.md`
- Create: `tests/templates/dashboard.test.js`

- [ ] **Step 1: Write `templates/dashboard/index.html`** — KPI cards row + chart placeholder + recent activity table

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Dashboard — DOMiNice</title>
  <link rel="stylesheet" href="../../components/domi.css">
</head>
<body style="padding:40px;max-width:1200px;margin:0 auto;">
  <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:32px;">
    <h1 class="domi-display" style="font-size:32px;">DASHBOARD.</h1>
    <nav class="domi-label" style="display:flex;gap:16px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">
      <span>overview</span><span>reports</span><span>settings</span>
    </nav>
  </header>

  <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:32px;">
    <div class="domi-card" style="padding:20px;"><div class="domi-label" style="font-size:11px;opacity:.6;margin-bottom:8px;">REVENUE</div><div class="domi-display" style="font-size:28px;">$48.2K</div><div class="domi-label" style="font-size:11px;color:#9caf88;margin-top:6px;">↑ 12.4%</div></div>
    <div class="domi-card" style="padding:20px;"><div class="domi-label" style="font-size:11px;opacity:.6;margin-bottom:8px;">USERS</div><div class="domi-display" style="font-size:28px;">2,847</div><div class="domi-label" style="font-size:11px;color:#9caf88;margin-top:6px;">↑ 4.1%</div></div>
    <div class="domi-card" style="padding:20px;"><div class="domi-label" style="font-size:11px;opacity:.6;margin-bottom:8px;">ORDERS</div><div class="domi-display" style="font-size:28px;">312</div><div class="domi-label" style="font-size:11px;color:#c2410c;margin-top:6px;">↓ 2.0%</div></div>
    <div class="domi-card" style="padding:20px;"><div class="domi-label" style="font-size:11px;opacity:.6;margin-bottom:8px;">CHURN</div><div class="domi-display" style="font-size:28px;">1.8%</div><div class="domi-label" style="font-size:11px;color:#9caf88;margin-top:6px;">↓ 0.3%</div></div>
  </section>

  <section class="domi-card" style="padding:20px;margin-bottom:32px;">
    <div class="domi-label" style="font-size:11px;opacity:.6;margin-bottom:12px;">REVENUE — LAST 30 DAYS</div>
    <div style="height:200px;display:flex;align-items:flex-end;gap:6px;">
      <!-- placeholder bars; replace with real chart in your artifact -->
      <div style="flex:1;background:linear-gradient(180deg,#f4978e,#a89cc8);border-radius:4px 4px 0 0;height:60%;"></div>
      <!-- ... 29 more bars ... -->
    </div>
  </section>

  <section class="domi-card" style="padding:20px;">
    <div class="domi-label" style="font-size:11px;opacity:.6;margin-bottom:12px;">RECENT ACTIVITY</div>
    <table class="domi-table" style="width:100%;border-collapse:collapse;font-family:'SF Mono',monospace;font-size:12px;">
      <thead><tr style="text-align:left;opacity:.6;"><th>TIME</th><th>USER</th><th>ACTION</th></tr></thead>
      <tbody>
        <tr><td>14:02</td><td>alice@</td><td>created invoice #1042</td></tr>
        <tr><td>13:51</td><td>bob@</td><td>updated settings</td></tr>
        <tr><td>13:30</td><td>carol@</td><td>deleted record #871</td></tr>
      </tbody>
    </table>
  </section>
</body>
</html>
```

- [ ] **Step 2: Write `templates/dashboard/README.md`**

```markdown
# dashboard

Standard admin/analytics dashboard archetype. KPI cards row, chart panel, recent activity table.

## Customization

Replace placeholder content with real data. Inject real charts via inline SVG or external library — DOMiNice is library-agnostic.
```

- [ ] **Step 3: Write test `tests/templates/dashboard.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(here, '../../templates/dashboard/index.html');

describe('templates/dashboard', () => {
  it('index.html exists', () => {
    expect(existsSync(file)).toBe(true);
  });

  it('links domi.css', () => {
    const html = readFileSync(file, 'utf8');
    expect(html).toMatch(/<link[^>]+domi\.css/);
  });

  it('has a KPI section with 4 cards', () => {
    const html = readFileSync(file, 'utf8');
    expect((html.match(/domi-card/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- tests/templates/dashboard.test.js`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add templates/dashboard/ tests/templates/dashboard.test.js
git commit -m "feat(templates): dashboard archetype"
```

---

## Tasks 21–24: Remaining archetypes

Each follows the same pattern as Task 20.

**Task 21: webapp-shell** — top nav, left sidebar, main content area, right-side panel (e.g., notifications)
**Task 22: mobile-app-shell** — full-bleed mobile frame with bottom tab bar, top header with back/menu/title
**Task 23: admin-tool** — dense data-grid table with filters, bulk action bar, side detail pane
**Task 24: pos-kiosk** — large tap targets (min 56px), high-contrast, simplified item grid + cart panel + checkout button

---

## Task 25: SKILL.md

**Files:**
- Create: `SKILL.md`

- [ ] **Step 1: Write `SKILL.md`**

```markdown
---
name: dominice
description: Cross-platform UI design system. Use when authoring interactive HTML artifacts for human-agent communication. Generates standalone HTML files using locked Neo-Glass-Vintage "Sunset Pastel" tokens, 15 primitives, and 5 archetypes. Triggers on "make me a [dashboard|pricing|...]", "open this in a tab", or any request for an interactive HTML deliverable.
---

# DOMiNice

You are an agent that produces interactive HTML artifacts using the DOMiNice design system. The driving documents in any agent↔human loop are HTML, not markdown.

## When to use this skill

Load this skill when the user asks for:
- An interactive HTML page, dashboard, report, or app prototype
- A UI mockup, wireframe, or visual comparison
- Any artifact where the user will view it in a browser and may want to give feedback

Do NOT use this skill for: pure text/markdown reports, code generation, server-side logic, or anything the user won't open in a browser.

## The pattern

1. **Identify the archetype.** Pick the closest fit from: `dashboard`, `webapp-shell`, `mobile-app-shell`, `admin-tool`, `pos-kiosk`. Copy from `templates/<archetype>/index.html`.
2. **Compose primitives.** Use only DOMiNice primitives (button, card, input, table, nav, modal, alert, badge, tabs, toast, tooltip, select, checkbox, radio, form). Reference: `components/primitives/<name>/README.md`.
3. **Apply tokens, not raw colors.** Use CSS classes (`.domi-btn`, `.domi-card`, etc.) instead of inline styles for color/typography/radius. Inline styles are OK for layout-only properties (display, padding, margin, grid).
4. **Single CSS link.** Include `<link rel="stylesheet" href="../../components/domi.css">` (relative path from `templates/`) or copy the contents inline for fully self-contained files.
5. **Optional interactivity.** Add `<script src="../../scripts/runtime/domi.js"></script>` for click feedback and form capture. Add `data-feedback="<name>"` to elements you want the user to be able to click on.
6. **Standalone-first.** Every artifact must open via `file://` with zero infra. No CDN, no build step, no fetch.

## Output location

Write to `.domi/output/<artifact>.html` in the user's project. If `.domi/state/server-info.json` exists (Phase 2 live server is running), the user will see it hot-reload in their browser.

## Aesthetic — Neo-Glass-Vintage Sunset Pastel

- **Background:** primary gradient `plum → coral → peach` (`#a89cc8 → #f4978e → #ffd6b3`) at 135°
- **Surfaces:** glass (`rgba(255,255,255,0.4–0.8)` with `backdrop-filter: blur(12px)`)
- **Display:** Helvetica Neue Black, uppercase, tight tracking
- **Body/labels:** JetBrains Mono / SF Mono
- **Text:** dark plum `#3d2342`
- **Accents:** sage `#9caf88` for success, terracotta `#c2410c` for danger

## Examples

### "Make me a sales dashboard"

1. Copy `templates/dashboard/index.html`
2. Replace KPI numbers with real data
3. Replace chart bars with real data (or inject inline SVG)
4. Add `data-feedback="metric-revenue"` etc. to KPI cards
5. Write to `.domi/output/dashboard.html`

### "Show me three pricing options side by side"

1. Compose three `.domi-card` elements in a `.split` layout
2. Use `.domi-btn--primary` for the recommended tier
3. Use `.domi-badge` for "POPULAR" / "BEST VALUE"
4. Write to `.domi/output/pricing.html`

## Reference

- Design tokens: `tokens/tokens.json`
- Primitives: `components/primitives/<name>/README.md`
- Archetypes: `templates/<name>/README.md`
- Full docs: `docs/DESIGN.md`, `docs/USAGE.md`, `docs/STANDARDS.md`
- Status: `status/STATUS.html`
```

- [ ] **Step 2: Verify markdown lint passes**

Run: `npm run lint -- SKILL.md`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add SKILL.md
git commit -m "feat(skill): SKILL.md entrypoint for AI agents"
```

---

## Task 26: `docs/DESIGN.md`

**Files:**
- Create: `docs/DESIGN.md`

- [ ] **Step 1: Write `docs/DESIGN.md`**

```markdown
# Design — DOMiNice

## Aesthetic: Neo-Glass-Vintage "Sunset Pastel"

A warm, slightly terminal/technical vibe built on three layers:
1. **Primary gradient:** plum → coral → peach at 135°
2. **Glass surfaces:** frosted panels with backdrop blur
3. **Mono body type:** JetBrains Mono / SF Mono throughout

## Tokens (source of truth: `tokens/tokens.json`)

### Colors

| Token | Value | Use |
|---|---|---|
| `--domi-color-primary-gradient` | `#a89cc8, #f4978e, #ffd6b3` | Page bg, primary buttons, hero blocks |
| `--domi-color-secondary-sage` | `#9caf88` | Success states, positive deltas |
| `--domi-color-accent-plum` | `#a89cc8` | Focus rings, tertiary surfaces |
| `--domi-color-text-default` | `#3d2342` | All body text, icons |
| `--domi-color-text-muted` | `#3d2342aa` | Captions, helper text |
| `--domi-color-surface-glass` | `#ffffff60` | Card bg, modal bg, button bg |

### Type

- **Display:** `'Helvetica Neue', 'Arial Black', sans-serif`, weight 900, uppercase, letter-spacing -0.02em
- **Body / labels:** `'SF Mono', 'JetBrains Mono', monospace`

### Radius

`4px` (badges) · `8px` (buttons, inputs) · `16px` (cards) · `9999px` (pill, opt-in)

### Glass

`backdrop-filter: blur(12px)` over `rgba(255,255,255,0.4–0.8)` background + `1px solid rgba(61,35,66,0.4)` border.

## Accessibility

- All interactive elements have `:focus-visible` outline (2px solid plum, 2px offset).
- Color contrast: dark plum `#3d2342` on glass surfaces meets WCAG AA for body text.
- Touch targets: minimum 44×44px (POS archetype bumps to 56px).

## Don't

- ❌ Don't use pure black `#000` or pure white `#fff` for text or surfaces
- ❌ Don't use sans-serif body type — it breaks the mono backbone
- ❌ Don't add box-shadows other than `--domi-shadow-soft` and `--domi-shadow-offset`
- ❌ Don't use Tailwind or external CSS frameworks
```

- [ ] **Step 2: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs(design): design principles + token reference"
```

---

## Task 27: `docs/USAGE.md`

**Files:**
- Create: `docs/USAGE.md`

- [ ] **Step 1: Write `docs/USAGE.md`**

```markdown
# Usage — DOMiNice

For humans and AI agents who want to author DOMiNice HTML artifacts.

## Quickstart

```bash
git clone https://github.com/your-org/dominice.git
cd dominice
npm install
```

Open any `templates/<archetype>/index.html` in a browser. No server needed.

## Authoring a new artifact

1. Pick the closest archetype (`templates/<name>/`).
2. Copy its `index.html` to your working location.
3. Replace placeholder content with real data.
4. Use only DOMiNice primitives (`components/primitives/<name>/README.md`).
5. For feedback capture: add `data-feedback="<id>"` to interactive elements, include `<script src="../../scripts/runtime/domi.js"></script>`, and add `<button data-export-feedback>Export feedback</button>` so the user can download `events.jsonl`.

## Adding a new primitive

1. Create `components/primitives/<name>/` with `<name>.html` (canonical snippet), `<name>.css`, `demo.html`, `README.md`.
2. Append `<name>.css` contents to `components/domi.css`.
3. Add a test at `tests/primitives/<name>.test.js`.
4. Update `tokens.json` if the primitive introduces new tokens.

## Reading feedback events

In standalone mode (Phase 1): user clicks "Export feedback" → downloads `events.jsonl` → paste back to the agent.

In live mode (Phase 2): `domi-server` writes to `.domi/state/events.jsonl` and pushes via WebSocket. The agent subscribes.

Event schema:
```json
{"type":"click","selector":"apply","ts":"2026-07-05T16:43:22Z","page":"dashboard","tag":"button","text":"Apply"}
{"type":"input","name":"projectName","value":"Acme Co","ts":"2026-07-05T16:43:25Z","page":"dashboard"}
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/USAGE.md
git commit -m "docs(usage): quickstart + authoring guide"
```

---

## Task 28: `docs/STANDARDS.md`

**Files:**
- Create: `docs/STANDARDS.md`

- [ ] **Step 1: Write `docs/STANDARDS.md`**

```markdown
# Standards — DOMiNice

Code conventions for HTML, CSS, JS in DOMiNice artifacts.

## HTML

- Always `<!doctype html>` + `lang` attribute
- 2-space indent
- Lowercase tags, double-quoted attributes
- Semantic HTML first (`<button>` for actions, `<a>` for navigation, `<table>` for tabular data)
- ARIA only when semantic HTML can't express the role

## CSS

- Class names: `domi-<block>` or `domi-<block>--<variant>` (BEM-ish)
- Never inline `style="color:..."` or `style="background:..."` — use a class
- Inline styles OK for layout-only: `display`, `grid`, `flex`, `padding`, `margin`, `gap`
- All colors / typography / radius come from `var(--domi-...)` tokens
- No `!important`
- No external CSS frameworks

## JS

- Vanilla JS only (no React, no Vue, no jQuery)
- IIFE wrapping; no globals except `window.DOMi`
- ES2024 syntax OK
- Strict mode (`'use strict'`)
- No transpilation — assume modern browsers
- No CDN dependencies

## Naming

- Files: `kebab-case.html`, `kebab-case.css`, `kebab-case.js`
- Folders: `kebab-case/`
- CSS classes: `domi-<name>` (always `domi-` prefix to avoid collision with host pages)

## Accessibility

- Every interactive element must be keyboard-reachable
- `:focus-visible` outline is non-negotiable
- Color is never the only signal (use icon + text for status)
- Form inputs have `<label for>` or wrapping `<label>`

## Git

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`)
- One logical change per commit
- Branch names: `feat/<thing>`, `fix/<thing>`
```

- [ ] **Step 2: Commit**

```bash
git add docs/STANDARDS.md
git commit -m "docs(standards): HTML/CSS/JS conventions"
```

---

## Task 29: `status/STATUS.html`

**Files:**
- Create: `status/STATUS.html`

- [ ] **Step 1: Write `status/STATUS.html`** — uses DOMiNice primitives

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>STATUS — DOMiNice</title>
  <link rel="stylesheet" href="../components/domi.css">
</head>
<body style="padding:40px;max-width:900px;margin:0 auto;">
  <h1 class="domi-display" style="font-size:32px;margin-bottom:8px;">STATUS.</h1>
  <p class="domi-label" style="font-size:12px;opacity:.6;margin-bottom:32px;">v0.1.0 — Phase 1 complete</p>

  <section class="domi-card" style="padding:24px;margin-bottom:24px;">
    <h2 class="domi-display" style="font-size:18px;margin-bottom:12px;">SHIPPED IN v0.1</h2>
    <ul style="list-style:none;padding:0;font-family:'SF Mono',monospace;font-size:13px;line-height:1.8;">
      <li>✅ Design tokens (`tokens.json`) — locked palette</li>
      <li>✅ 15 HTML primitives</li>
      <li>✅ 5 archetype templates</li>
      <li>✅ `domi.js` standalone runtime</li>
      <li>✅ Full docs (DESIGN, USAGE, STANDARDS, STATUS, UX-MEMORY)</li>
      <li>✅ `SKILL.md` for AI agents</li>
    </ul>
  </section>

  <section class="domi-card" style="padding:24px;margin-bottom:24px;">
    <h2 class="domi-display" style="font-size:18px;margin-bottom:12px;">PHASE 2 — UPCOMING</h2>
    <ul style="list-style:none;padding:0;font-family:'SF Mono',monospace;font-size:13px;line-height:1.8;">
      <li>🔴 `domi-server` (Rust binary, axum + notify + tokio)</li>
      <li>🔴 Folder-watch mode for `.domi/output/`</li>
      <li>🔴 WebSocket push to agent</li>
      <li>🔴 Server-attached `domi.js` mode</li>
    </ul>
  </section>

  <section class="domi-card" style="padding:24px;">
    <h2 class="domi-display" style="font-size:18px;margin-bottom:12px;">KNOWN ISSUES</h2>
    <p style="font-family:'SF Mono',monospace;font-size:13px;opacity:.7;">None at v0.1.0. File issues at github.com/your-org/dominice/issues</p>
  </section>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add status/STATUS.html
git commit -m "feat(status): initial STATUS page"
```

---

## Task 30: `status/UX-MEMORY.html`

**Files:**
- Create: `status/UX-MEMORY.html`

- [ ] **Step 1: Write `status/UX-MEMORY.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>UX-MEMORY — DOMiNice</title>
  <link rel="stylesheet" href="../components/domi.css">
</head>
<body style="padding:40px;max-width:900px;margin:0 auto;">
  <h1 class="domi-display" style="font-size:32px;margin-bottom:8px;">UX-MEMORY.</h1>
  <p class="domi-label" style="font-size:12px;opacity:.6;margin-bottom:32px;">User feedback themes, pain points, decisions</p>

  <section class="domi-card" style="padding:24px;margin-bottom:24px;">
    <h2 class="domi-display" style="font-size:18px;margin-bottom:12px;">DECISIONS LOG</h2>
    <ul style="list-style:none;padding:0;font-family:'SF Mono',monospace;font-size:13px;line-height:1.8;">
      <li>📌 2026-07-05 — Locked Neo-Glass-Vintage "Sunset Pastel" aesthetic (gradient + sage/plum/dark-plum accents, mono body, glass surfaces)</li>
      <li>📌 2026-07-05 — Standalone-first principle (every artifact opens via `file://` with zero infra)</li>
      <li>📌 2026-07-05 — Doc format rule: human-edits-frequently → Markdown, agent-maintained-display → HTML</li>
      <li>📌 2026-07-05 — 5 archetypes: dashboard, webapp-shell, mobile-app-shell, admin-tool, pos-kiosk (no blog/web publishing)</li>
    </ul>
  </section>

  <section class="domi-card" style="padding:24px;margin-bottom:24px;">
    <h2 class="domi-display" style="font-size:18px;margin-bottom:12px;">USER FEEDBACK THEMES</h2>
    <p style="font-family:'SF Mono',monospace;font-size:13px;opacity:.7;">No user feedback collected yet (v0.1.0 is the first public release).</p>
  </section>

  <section class="domi-card" style="padding:24px;">
    <h2 class="domi-display" style="font-size:18px;margin-bottom:12px;">OPEN QUESTIONS</h2>
    <ul style="list-style:none;padding:0;font-family:'SF Mono',monospace;font-size:13px;line-height:1.8;">
      <li>❓ Will agents other than Claude/Kilo adopt the skill?</li>
      <li>❓ Will the multi-target Phase 3 packages get real adoption?</li>
      <li>❓ Is the v0.1 primitive set sufficient, or do users want data-grid / pagination / date-picker in Phase 2?</li>
    </ul>
  </section>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add status/UX-MEMORY.html
git commit -m "feat(status): initial UX-MEMORY page"
```

---

## Task 31: `scripts/shell/install.sh` + `scripts/shell/verify.sh`

**Files:**
- Create: `scripts/shell/install.sh`
- Create: `scripts/shell/verify.sh`

- [ ] **Step 1: Write `scripts/shell/install.sh`** — Phase 1 stub (real install ships in Phase 2)

```bash
#!/usr/bin/env bash
# DOMiNice installer — Phase 1 stub.
# Phase 2 will add: cargo install dominice, or curl GitHub release binary.

set -euo pipefail

echo "DOMiNice v0.1.0 installer (Phase 1)"
echo ""
echo "Phase 1 ships a static HTML+CSS+JS design system."
echo "There is no binary to install yet — Phase 2 will add 'domi serve'."
echo ""
echo "Quickstart:"
echo "  git clone https://github.com/your-org/dominice.git"
echo "  cd dominice"
echo "  npm install"
echo "  npm test"
echo ""
echo "Open templates/dashboard/index.html in your browser to see it work."
```

- [ ] **Step 2: Write `scripts/shell/verify.sh`** — runs the test suite

```bash
#!/usr/bin/env bash
# DOMiNice verifier — runs all tests + smoke check.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ lint"
npm run lint

echo "→ test"
npm test

echo "→ smoke (dashboard.html renders in jsdom)"
npm run smoke

echo ""
echo "✓ DOMiNice v0.1.0 verified"
```

- [ ] **Step 3: Make scripts executable + commit**

Run:
```bash
chmod +x scripts/shell/install.sh scripts/shell/verify.sh
git add scripts/shell/install.sh scripts/shell/verify.sh
git commit -m "chore(scripts): install + verify scripts"
```

---

## Task 32: `tools/smoke.mjs` + final end-to-end check

**Files:**
- Create: `tools/smoke.mjs`

- [ ] **Step 1: Write `tools/smoke.mjs`**

```js
#!/usr/bin/env node
// Loads templates/dashboard/index.html into jsdom, asserts the DOM parses
// and includes the expected DOMiNice classes. Does NOT visually verify —
// that's a manual step.

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dashboardPath = resolve(here, '../templates/dashboard/index.html');
const html = readFileSync(dashboardPath, 'utf8');

const dom = new JSDOM(html);
const doc = dom.window.document;

const checks = [
  ['has DOCTYPE', /<!doctype/i.test(html)],
  ['links domi.css', !!doc.querySelector('link[href*="domi.css"]')],
  ['has domi-card', doc.querySelectorAll('.domi-card').length >= 4],
  ['has domi-display headline', !!doc.querySelector('.domi-display')],
  ['has domi-table', !!doc.querySelector('.domi-table, table')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run smoke + verify**

Run:
```bash
npm run smoke
```
Expected: 5 ✓ lines, exit 0.

- [ ] **Step 3: Run full verify**

Run:
```bash
bash scripts/shell/verify.sh
```
Expected: lint passes, all tests pass, smoke passes, "DOMiNice v0.1.0 verified".

- [ ] **Step 4: Manual visual check**

Open `templates/dashboard/index.html` in a browser. Confirm:
- Plum→coral→peach gradient background renders
- 4 KPI cards display with glass effect
- Recent activity table renders
- Buttons have glass effect
- Mono font throughout

- [ ] **Step 5: Commit**

```bash
git add tools/smoke.mjs
git commit -m "feat(tools): smoke check for dashboard archetype"
```

---

## Task 33: v0.1.0 tag + release notes

**Files:**
- Create: `RELEASE-NOTES-v0.1.0.md`

- [ ] **Step 1: Write `RELEASE-NOTES-v0.1.0.md`**

```markdown
# DOMiNice v0.1.0 — Phase 1 Complete

> Sponsored by [stoopery](https://stoopery.app)

First public release of the DOMiNice HTML-first design system.

## What's included

- 15 HTML primitives (button, card, form, input, select, checkbox, radio, table, nav, modal, alert, badge, tabs, toast, tooltip)
- 5 archetypes (dashboard, webapp-shell, mobile-app-shell, admin-tool, pos-kiosk)
- `domi.js` standalone runtime (click-to-feedback, form capture, JSONL export)
- `SKILL.md` for AI agents (Claude/Kilo/etc.)
- Full docs: DESIGN, USAGE, STANDARDS, STATUS, UX-MEMORY
- Locked Neo-Glass-Vintage "Sunset Pastel" aesthetic

## What's NOT included (later phases)

- Phase 2: `domi-server` Rust binary (live feedback loop)
- Phase 3: `@domi/react`, `@domi/astro`, `domi-dvui` (Rust crate)
- Phase 4: distribution polish + examples

## Install

```bash
git clone https://github.com/your-org/dominice.git
cd dominice
npm install
```

Open `templates/dashboard/index.html` in a browser.

## License

MIT
```

- [ ] **Step 2: Commit + tag**

```bash
git add RELEASE-NOTES-v0.1.0.md
git commit -m "docs: v0.1.0 release notes"
git tag -a v0.1.0 -m "v0.1.0 — Phase 1 complete"
```

---

## Done

Phase 1 is shippable. The user can:
1. Open any archetype HTML in a browser
2. Use the SKILL.md to teach their agent to author DOMiNice HTML
3. Get interactive feedback via `data-feedback` + `domi.js` + Export button
4. Read docs, contribute new primitives

Next: review the result with the user, capture any feedback into `status/UX-MEMORY.html`, then write Phase 2 plan (live server in Rust).
