import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseAstro, evaluateClassExpr } from './parser';

const tablePath = resolve(__dirname, '../src/components/Table.astro');
const navPath = resolve(__dirname, '../src/components/Nav.astro');
const tabsPath = resolve(__dirname, '../src/components/Tabs.astro');

describe('Table', () => {
  it('renders <table> with base class', () => {
    const { body } = parseAstro(tablePath);
    expect(body).toMatch(/<table\b/);
    const { frontmatter } = parseAstro(tablePath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toBe('domi-table');
  });

  it('passes ...props (id)', () => {
    const { body } = parseAstro(tablePath);
    expect(body).toMatch(/\{\.\.\.rest\}/);
  });
});

describe('Nav', () => {
  it('renders <nav> with base class', () => {
    const { body } = parseAstro(navPath);
    expect(body).toMatch(/<nav\b/);
    const { frontmatter } = parseAstro(navPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toBe('domi-nav');
  });

  it('appends user class', () => {
    const { frontmatter, body } = parseAstro(navPath);
    const cls = evaluateClassExpr(frontmatter, body, { class: 'x' });
    expect(cls).toBe('domi-nav x');
  });
});

describe('Tabs', () => {
  it('renders <div> with base class', () => {
    const { body } = parseAstro(tabsPath);
    expect(body).toMatch(/<div\b/);
    const { frontmatter } = parseAstro(tabsPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toBe('domi-tabs');
  });
});