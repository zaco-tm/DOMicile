import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseAstro, evaluateClassExpr } from './parser';

const buttonPath = resolve(__dirname, '../src/components/Button.astro');

describe('Button', () => {
  it('renders <button> with class={classes}', () => {
    const { body } = parseAstro(buttonPath);
    expect(body).toMatch(/<button\b/);
    expect(body).toMatch(/class=\{classes\}/);
    // The base class comes from the evaluated expression; verify via evaluateClassExpr.
    const { frontmatter, body: fb } = parseAstro(buttonPath);
    const cls = evaluateClassExpr(frontmatter, fb, {});
    expect(cls).toContain('domi-btn');
  });

  it('applies default variant (primary) and default size (lg)', () => {
    const { frontmatter, body } = parseAstro(buttonPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toContain('domi-btn--primary');
    expect(cls).toContain('domi-btn--lg');
  });

  it.each(['primary', 'ghost', 'danger'] as const)('applies %s variant', (variant) => {
    const { frontmatter, body } = parseAstro(buttonPath);
    const cls = evaluateClassExpr(frontmatter, body, { variant });
    expect(cls).toContain(`domi-btn--${variant}`);
  });

  it.each(['sm', 'lg'] as const)('applies %s size', (size) => {
    const { frontmatter, body } = parseAstro(buttonPath);
    const cls = evaluateClassExpr(frontmatter, body, { size });
    expect(cls).toContain(`domi-btn--${size}`);
  });

  it('appends user class last (wins specificity ties)', () => {
    const { frontmatter, body } = parseAstro(buttonPath);
    const cls = evaluateClassExpr(frontmatter, body, { class: 'my-extra' });
    expect(cls).toBe('domi-btn domi-btn--primary domi-btn--lg my-extra');
  });

  it('renders as <a> when as="a" (spreads ...rest for href)', () => {
    const { body } = parseAstro(buttonPath);
    expect(body).toMatch(/<a\b/);
    expect(body).toMatch(/\{...rest\}/);
  });
});