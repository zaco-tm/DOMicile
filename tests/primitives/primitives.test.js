import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const primitivesDir = resolve(here, '../../components/primitives');
const domiCssPath = resolve(here, '../../components/domi.css');

const allPrimitives = [
  'button', 'card', 'input', 'select', 'checkbox', 'radio',
  'form', 'table', 'nav', 'modal', 'alert', 'badge',
  'tabs', 'toast', 'tooltip'
];

describe('primitives/button', () => {
  const dir = resolve(primitivesDir, 'button');
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

describe('all 15 primitives', () => {
  for (const name of allPrimitives) {
    it(`${name}/ has html, demo, README`, () => {
      const d = resolve(primitivesDir, name);
      expect(existsSync(resolve(d, 'demo.html'))).toBe(true);
      expect(existsSync(resolve(d, 'README.md'))).toBe(true);
    });
  }

  it('domi.css bundles all primitive classes', () => {
    const css = readFileSync(domiCssPath, 'utf8');
    const expectedSelectors = [
      'domi-btn', 'domi-card', 'domi-input', 'domi-select',
      'domi-check', 'domi-radio', 'domi-form', 'domi-table',
      'domi-nav', 'domi-modal', 'domi-alert', 'domi-badge',
      'domi-tabs', 'domi-toast', 'domi-tooltip'
    ];
    for (const sel of expectedSelectors) {
      expect(css).toContain('.' + sel);
    }
  });
});
