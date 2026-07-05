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
lines.push('');
lines.push('html, body { background-image: linear-gradient(135deg, #a89cc8, #f4978e, #ffd6b3); }');

mkdirSync(resolve(here, '../components'), { recursive: true });
writeFileSync(resolve(here, '../components/domi.css'), lines.join('\n'));
console.log('✓ wrote components/domi.css');
