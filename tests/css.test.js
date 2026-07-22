import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(here, '../components/domi.css');
const generatorPath = resolve(here, '../tools/tokens-to-css.mjs');

function runGenerator() {
  execFileSync('node', [generatorPath], { stdio: 'pipe' });
  return readFileSync(cssPath, 'utf8');
}

describe('components/domi.css', () => {
  it('exists', () => {
    expect(existsSync(cssPath)).toBe(true);
  });

  describe('default theme (neo) on :root', () => {
    let css;
    beforeAll(() => { css = runGenerator(); });

    it('declares the joined --domi-color-primary-gradient var (backward compat)', () => {
      expect(css).toMatch(/--domi-color-primary-gradient:\s*#a89cc8,\s*#f4978e,\s*#ffd6b3/);
    });

    it('declares --domi-color-text-default as plum', () => {
      expect(css).toMatch(/--domi-color-text-default:\s*#3d2342/);
    });

    it('declares --domi-radius-md as 8px', () => {
      expect(css).toMatch(/--domi-radius-md:\s*8px/);
    });

    it('declares --domi-glass-blur as 12px', () => {
      expect(css).toMatch(/--domi-glass-blur:\s*12px/);
    });
  });

  describe('bundoro theme on [data-theme="bundoro"]', () => {
    let css;
    beforeAll(() => { css = runGenerator(); });

    it('emits a [data-theme="bundoro"] block', () => {
      expect(css).toMatch(/\[data-theme="bundoro"\]\s*\{/);
    });

    it('declares text color as deep teal under bundoro', () => {
      expect(css).toMatch(/\[data-theme="bundoro"\][^}]*--domi-color-text-default:\s*#1d3a3a/s);
    });

    it('declares accent as coral under bundoro', () => {
      expect(css).toMatch(/\[data-theme="bundoro"\][^}]*--domi-color-accent-primary:\s*#e87a5d/s);
    });

    it('declares glass blur as 0px under bundoro (flat fills, not glass)', () => {
      expect(css).toMatch(/\[data-theme="bundoro"\][^}]*--domi-glass-blur:\s*0px/s);
    });

    it('declares thick border as 3px deep teal under bundoro', () => {
      expect(css).toMatch(/\[data-theme="bundoro"\][^}]*--domi-border-thick:\s*3px solid #1d3a3a/s);
    });
  });

  describe('per-theme gradient flattening', () => {
    let css;
    beforeAll(() => { css = runGenerator(); });

    it('emits --domi-color-primary-gradient-c1, c2, c3 vars for neo', () => {
      expect(css).toMatch(/--domi-color-primary-gradient-c1:\s*#a89cc8/);
      expect(css).toMatch(/--domi-color-primary-gradient-c2:\s*#f4978e/);
      expect(css).toMatch(/--domi-color-primary-gradient-c3:\s*#ffd6b3/);
    });

    it('emits --domi-color-primary-gradient-c1, c2, c3 vars for bundoro (close-by cream values)', () => {
      expect(css).toMatch(/\[data-theme="bundoro"\][^}]*--domi-color-primary-gradient-c1:\s*#f4ead5/s);
      expect(css).toMatch(/\[data-theme="bundoro"\][^}]*--domi-color-primary-gradient-c2:\s*#faf3e7/s);
      expect(css).toMatch(/\[data-theme="bundoro"\][^}]*--domi-color-primary-gradient-c3:\s*#f0e2c4/s);
    });
  });

  describe('theme-agnostic base rules', () => {
    let css;
    beforeAll(() => { css = runGenerator(); });

    it('includes the box-sizing reset', () => {
      expect(css).toMatch(/\*\s*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing:\s*border-box/);
    });

    it('includes the .domi-display utility', () => {
      expect(css).toMatch(/\.domi-display\s*\{/);
    });

    it('includes the .domi-label utility', () => {
      expect(css).toMatch(/\.domi-label\s*\{/);
    });

    it('includes the .domi-glass utility', () => {
      expect(css).toMatch(/\.domi-glass\s*\{/);
    });

    it('declares all primitive classes (regression)', () => {
      const expectedSelectors = [
        'domi-btn', 'domi-card', 'domi-input', 'domi-select',
        'domi-check', 'domi-radio', 'domi-form', 'domi-table',
        'domi-nav', 'domi-modal', 'domi-alert', 'domi-badge',
        'domi-tabs', 'domi-toast', 'domi-tooltip'
      ];
      for (const sel of expectedSelectors) {
        expect(css, `missing .${sel}`).toContain('.' + sel);
      }
    });
  });

  describe('generator preserves the primitive section across runs', () => {
    const marker = '/* DOMicile primitive styles — appended to domi.css by build */';

    it('keeps the primitive-section marker and the primitive CSS below it on regeneration', () => {
      // Run the generator once to get a known state.
      runGenerator();
      // Confirm the marker exists and the primitive section is below it.
      const css = readFileSync(cssPath, 'utf8');
      const idx = css.indexOf(marker);
      expect(idx, 'primitive section marker not found after first generator run').toBeGreaterThan(0);
      expect(css.slice(idx), 'primitive section missing .domi-btn after first run').toMatch(/\.domi-btn\s*\{/);
      // Run the generator again. The primitive section must be preserved.
      runGenerator();
      const css2 = readFileSync(cssPath, 'utf8');
      const idx2 = css2.indexOf(marker);
      expect(idx2, 'primitive section marker not found after second generator run').toBeGreaterThan(0);
      expect(css2.slice(idx2), 'primitive section missing .domi-btn after second run').toMatch(/\.domi-btn\s*\{/);
    });
  });

  describe('primitive section — gradient literal removal', () => {
    let css;
    beforeAll(() => { css = runGenerator(); });

    it('does not contain the old hardcoded 3-color gradient literal anywhere', () => {
      expect(css).not.toMatch(/linear-gradient\(135deg,\s*#a89cc8,\s*#f4978e,\s*#ffd6b3\)/);
    });

    it('uses var(--domi-color-primary-gradient-c1/c2/c3) in .domi-bg-primary', () => {
      const block = css.match(/\.domi-bg-primary\s*\{[^}]*\}/)?.[0] ?? '';
      expect(block).toMatch(/linear-gradient\([\s\S]*?var\(--domi-color-primary-gradient-c1\)/);
      expect(block).toMatch(/var\(--domi-color-primary-gradient-c2\)/);
      expect(block).toMatch(/var\(--domi-color-primary-gradient-c3\)/);
    });

    it('uses var-driven gradient in the body background-image', () => {
      const block = css.match(/html,\s*body\s*\{[^}]*background-image[^}]*\}/)?.[0] ?? '';
      expect(block).toMatch(/var\(--domi-color-primary-gradient-c1\)/);
      expect(block).toMatch(/var\(--domi-color-primary-gradient-c2\)/);
      expect(block).toMatch(/var\(--domi-color-primary-gradient-c3\)/);
    });

    it('uses var-driven gradient in .domi-btn--primary', () => {
      const block = css.match(/\.domi-btn--primary\s*\{[^}]*\}/)?.[0] ?? '';
      expect(block).toMatch(/var\(--domi-color-primary-gradient-c1\)/);
    });

    it('uses var-driven gradient in .domi-check:checked / .domi-radio:checked', () => {
      const block = css.match(/\.domi-check:checked,\s*\.domi-radio:checked\s*\{[^}]*\}/)?.[0] ?? '';
      expect(block).toMatch(/var\(--domi-color-primary-gradient-c1\)/);
    });

    it('uses var-driven gradient in .domi-badge--primary', () => {
      const block = css.match(/\.domi-badge--primary\s*\{[^}]*\}/)?.[0] ?? '';
      expect(block).toMatch(/var\(--domi-color-primary-gradient-c1\)/);
    });
  });

  describe('primitive section — stale accent key removal', () => {
    let css;
    beforeAll(() => { css = runGenerator(); });

    it('does not contain the old --domi-color-accent-plum var name anywhere', () => {
      // The accent-key rename in Task 1 left four stale `var(--domi-color-accent-plum)`
      // references in the preserved primitive section. The auto-gen now emits
      // `--domi-color-accent-primary` only, so the old name is dead CSS.
      expect(css).not.toMatch(/--domi-color-accent-plum\b/);
    });

    it('uses --domi-color-accent-primary in .domi-btn:focus-visible', () => {
      const block = css.match(/\.domi-btn:focus-visible\s*\{[^}]*\}/)?.[0] ?? '';
      expect(block).toMatch(/var\(--domi-color-accent-primary\)/);
    });

    it('uses --domi-color-accent-primary in .domi-input:focus, .domi-select:focus', () => {
      const block = css.match(/\.domi-input:focus,\s*\.domi-select:focus\s*\{[^}]*\}/)?.[0] ?? '';
      expect(block).toMatch(/var\(--domi-color-accent-primary\)/);
    });

    it('uses --domi-color-accent-primary in .domi-check:checked, .domi-radio:checked', () => {
      const block = css.match(/\.domi-check:checked,\s*\.domi-radio:checked\s*\{[^}]*\}/)?.[0] ?? '';
      expect(block).toMatch(/var\(--domi-color-accent-primary\)/);
    });

    it('uses --domi-color-accent-primary in .domi-alert--info', () => {
      const block = css.match(/\.domi-alert--info\s*\{[^}]*\}/)?.[0] ?? '';
      expect(block).toMatch(/border-color:\s*var\(--domi-color-accent-primary\)/);
    });
  });

  describe('primitive section — font-face declarations', () => {
    let css;
    beforeAll(() => { css = runGenerator(); });

    it('declares CourbeSans @font-face with /fonts/CourbeSans.ttf', () => {
      expect(css).toMatch(/@font-face\s*\{[^}]*font-family:\s*['"]?CourbeSans['"]?[^}]*url\(['"]?\/fonts\/CourbeSans\.ttf['"]?\)/s);
    });

    it('declares Pavot @font-face with /fonts/Pavot-Regular.otf', () => {
      expect(css).toMatch(/@font-face\s*\{[^}]*font-family:\s*['"]?Pavot['"]?[^}]*url\(['"]?\/fonts\/Pavot-Regular\.otf['"]?\)/s);
    });

    it('uses font-display: swap on both declarations', () => {
      const faceCount = (css.match(/font-display:\s*swap/g) || []).length;
      expect(faceCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('primitive section — .domi-glass redefinition under bundoro', () => {
    let css;
    beforeAll(() => { css = runGenerator(); });

    it('redefines .domi-glass under [data-theme="bundoro"] with no backdrop-filter', () => {
      const block = css.match(/\[data-theme="bundoro"\]\s*\.domi-glass\s*\{[^}]*\}/)?.[0] ?? '';
      expect(block).toBeTruthy();
      expect(block).toMatch(/backdrop-filter:\s*none/);
      expect(block).toMatch(/-webkit-backdrop-filter:\s*none/);
      expect(block).toMatch(/border:\s*var\(--domi-border-thick\)/);
    });
  });
});
