#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(here, '../tokens/index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));

const flattenTheme = (theme) => {
  const out = [];
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = `${prefix}-${k.replace(/_/g, '-')}`;
      if (Array.isArray(v)) {
        // Preserve joined form (backward compat) and emit c1/c2/c3.
        out.push(`  ${key}: ${v.join(', ')};`);
        v.forEach((c, i) => out.push(`  ${key}-c${i + 1}: ${c};`));
      } else if (v && typeof v === 'object') {
        walk(v, key);
      } else {
        out.push(`  ${key}: ${v};`);
      }
    }
  };
  walk(theme, '--domi');
  return out;
};

const lines = ['/* AUTO-GENERATED from tokens/index.json — do not edit by hand */'];

for (const [name, file] of Object.entries(index.themes)) {
  const theme = JSON.parse(readFileSync(resolve(here, '..', file), 'utf8'));
  const selector = name === index.default ? ':root' : `[data-theme="${name}"]`;
  lines.push(selector + ' {');
  lines.push(...flattenTheme(theme));
  lines.push('}');
  lines.push('');
}

// Theme-agnostic body / typography / utility / reset rules. The gradient
// literal here is intentional — it's the LAST line of the auto-gen portion
// and intentionally mirrors the manifest's default theme. The Task 3
// primitive section will replace hardcoded literals throughout the file
// with var references so the same CSS serves both themes.
const defaultTheme = JSON.parse(readFileSync(resolve(here, '..', index.themes[index.default]), 'utf8'));

lines.push('.domi-bg-primary {');
lines.push('  background-image: linear-gradient(var(--domi-color-primary-angle), var(--domi-color-primary-gradient-c1), var(--domi-color-primary-gradient-c2), var(--domi-color-primary-gradient-c3));');
lines.push('}');
lines.push('');
lines.push('/* Reset */');
lines.push('*, *::before, *::after { box-sizing: border-box; }');
lines.push('html, body { margin: 0; padding: 0; }');
lines.push('body {');
lines.push('  font-family: var(--domi-type-body-family);');
lines.push('  font-weight: var(--domi-type-body-weight);');
lines.push('  color: var(--domi-color-text-default);');
lines.push('  background: var(--domi-color-surface-glass);');
lines.push('  min-height: 100vh;');
lines.push('}');
lines.push('');
lines.push('/* Typography utilities */');
lines.push('.domi-display {');
lines.push('  font-family: var(--domi-type-display-family);');
lines.push('  font-weight: var(--domi-type-display-weight);');
lines.push('  text-transform: var(--domi-type-display-transform);');
lines.push('  letter-spacing: var(--domi-type-display-letterSpacing);');
lines.push('  margin: 0;');
lines.push('}');
lines.push('.domi-label {');
lines.push('  font-family: var(--domi-type-label-family);');
lines.push('  font-weight: var(--domi-type-label-weight);');
lines.push('}');
lines.push('.domi-glass {');
lines.push('  background: var(--domi-color-surface-glass);');
lines.push('  backdrop-filter: blur(var(--domi-glass-blur));');
lines.push('  -webkit-backdrop-filter: blur(var(--domi-glass-blur));');
lines.push('  border: var(--domi-border-thin);');
lines.push('  border-radius: var(--domi-radius-md);');
lines.push('}');
lines.push('');

lines.push('html, body { background-image: linear-gradient(var(--domi-color-primary-angle), var(--domi-color-primary-gradient-c1), var(--domi-color-primary-gradient-c2), var(--domi-color-primary-gradient-c3)); }');
lines.push('');
lines.push('/* @font-face declarations for bundoro display family */');
lines.push('@font-face {');
lines.push("  font-family: 'CourbeSans';");
lines.push("  src: url('/fonts/CourbeSans.ttf') format('truetype');");
lines.push('  font-weight: 400;');
lines.push('  font-style: normal;');
lines.push('  font-display: swap;');
lines.push('}');
lines.push('@font-face {');
lines.push("  font-family: 'Pavot';");
lines.push("  src: url('/fonts/Pavot-Regular.otf') format('opentype');");
lines.push('  font-weight: 400;');
lines.push('  font-style: normal;');
lines.push('  font-display: swap;');
lines.push('}');
lines.push('');
lines.push('/* .domi-glass redefinition under bundoro — flat fills, no blur, thick border */');
lines.push('[data-theme="bundoro"] .domi-glass {');
lines.push('  background: var(--domi-color-surface-glass);');
lines.push('  backdrop-filter: none;');
lines.push('  -webkit-backdrop-filter: none;');
lines.push('  border: var(--domi-border-thick);');
lines.push('  border-radius: var(--domi-radius-md);');
lines.push('}');

mkdirSync(resolve(here, '../components'), { recursive: true });

// Preserve the primitive section across regenerations. The hand-maintained
// primitive section lives below the `/* DOMicile primitive styles — appended
// to domi.css by build */` marker and contains the 15 primitive class
// definitions. We re-emit that section verbatim so hand-edits survive.
const cssPath = resolve(here, '../components/domi.css');
// The primitive marker in components/domi.css spans two lines (the `*/` is
// on the next line, after a "Tokens come from..." comment), so the literal
// string from the brief doesn't match the file. Use the first line only.
const primitiveMarker = '/* DOMicile primitive styles — appended to domi.css by build';
let primitiveSection = '';
if (existsSync(cssPath)) {
  const existing = readFileSync(cssPath, 'utf8');
  const idx = existing.indexOf(primitiveMarker);
  if (idx >= 0) {
    primitiveSection = '\n' + existing.slice(idx);
  }
}

writeFileSync(cssPath, lines.join('\n') + primitiveSection);
console.log('✓ wrote components/domi.css');
