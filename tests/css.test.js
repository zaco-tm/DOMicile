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

  it('includes base reset, typography utilities, and glass utility', () => {
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/\*\s*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing:\s*border-box/);
    expect(css).toMatch(/\.domi-display\s*\{/);
    expect(css).toMatch(/\.domi-label\s*\{/);
    expect(css).toMatch(/\.domi-glass\s*\{/);
  });
});
