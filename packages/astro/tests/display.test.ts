import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseAstro, evaluateClassExpr } from './parser';

const cardPath = resolve(__dirname, '../src/components/Card.astro');
const alertPath = resolve(__dirname, '../src/components/Alert.astro');
const badgePath = resolve(__dirname, '../src/components/Badge.astro');

describe('Card', () => {
  it('renders <div> with base class', () => {
    const { body } = parseAstro(cardPath);
    expect(body).toMatch(/<div\b/);
    const { frontmatter } = parseAstro(cardPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toBe('domi-card');
  });

  it('default has no size suffix', () => {
    const { frontmatter, body } = parseAstro(cardPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).not.toMatch(/domi-card--/);
  });

  it.each(['sm', 'lg'] as const)('applies %s size', (size) => {
    const { frontmatter, body } = parseAstro(cardPath);
    const cls = evaluateClassExpr(frontmatter, body, { size });
    expect(cls).toContain(`domi-card--${size}`);
  });

  it('appends user class', () => {
    const { frontmatter, body } = parseAstro(cardPath);
    const cls = evaluateClassExpr(frontmatter, body, { class: 'x' });
    expect(cls).toBe('domi-card x');
  });
});

describe('Alert', () => {
  it('renders <div> with base class', () => {
    const { body } = parseAstro(alertPath);
    expect(body).toMatch(/<div\b/);
    const { frontmatter } = parseAstro(alertPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toContain('domi-alert');
  });

  it('default variant is info', () => {
    const { frontmatter, body } = parseAstro(alertPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toContain('domi-alert--info');
  });

  it.each(['info', 'success', 'warning', 'danger'] as const)('applies %s variant', (variant) => {
    const { frontmatter, body } = parseAstro(alertPath);
    const cls = evaluateClassExpr(frontmatter, body, { variant });
    expect(cls).toContain(`domi-alert--${variant}`);
  });

  it('renders as <span> when as="span"', () => {
    const { frontmatter, body } = parseAstro(alertPath);
    expect(body).toMatch(/<span\b/);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toContain('domi-alert');
  });
});

describe('Badge', () => {
  it('renders <span> with base class', () => {
    const { body } = parseAstro(badgePath);
    expect(body).toMatch(/<span\b/);
    const { frontmatter } = parseAstro(badgePath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toContain('domi-badge');
  });

  it('default variant is primary', () => {
    const { frontmatter, body } = parseAstro(badgePath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toContain('domi-badge--primary');
  });

  it.each(['primary', 'success', 'warning', 'danger'] as const)('applies %s variant', (variant) => {
    const { frontmatter, body } = parseAstro(badgePath);
    const cls = evaluateClassExpr(frontmatter, body, { variant });
    expect(cls).toContain(`domi-badge--${variant}`);
  });

  it('renders as <a> when as="a"', () => {
    const { frontmatter, body } = parseAstro(badgePath);
    expect(body).toMatch(/<a\b/);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toContain('domi-badge');
  });
});