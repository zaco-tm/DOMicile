import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// vitest may set process.cwd() differently than import.meta.url path.
// Anchor on process.cwd() which is the project root when `npm test` is run from there.
const root = process.cwd();
const archetypes = ['dashboard', 'webapp-shell', 'mobile-app-shell', 'admin-tool', 'pos-kiosk'];

describe('archetypes', () => {
  for (const name of archetypes) {
    const dir = resolve(root, 'templates', name);
    it(`${name}/ has index.html and README.md`, () => {
      expect(existsSync(resolve(dir, 'index.html'))).toBe(true);
      expect(existsSync(resolve(dir, 'README.md'))).toBe(true);
    });

    it(`${name}/ index.html links domi.css`, () => {
      const html = readFileSync(resolve(dir, 'index.html'), 'utf8');
      expect(html).toMatch(/<link[^>]+domi\.css/);
    });
  }

  it('dashboard has 4 KPI cards', () => {
    const html = readFileSync(resolve(root, 'templates/dashboard/index.html'), 'utf8');
    expect((html.match(/domi-card/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('pos-kiosk has 56px+ buttons', () => {
    const html = readFileSync(resolve(root, 'templates/pos-kiosk/index.html'), 'utf8');
    expect(html).toMatch(/min-height:\s*56px/);
  });

  it('mobile-app-shell is phone-framed', () => {
    const html = readFileSync(resolve(root, 'templates/mobile-app-shell/index.html'), 'utf8');
    expect(html).toMatch(/phone/);
    expect(html).toMatch(/tabbar/i);
  });
});
