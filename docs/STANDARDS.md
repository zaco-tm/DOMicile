# Standards — DOMicile

Code conventions for HTML, CSS, JS in DOMicile artifacts.

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
