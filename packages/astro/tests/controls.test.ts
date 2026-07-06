import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseAstro, evaluateClassExpr } from './parser';

const checkPath = resolve(__dirname, '../src/components/Checkbox.astro');
const radioPath = resolve(__dirname, '../src/components/Radio.astro');

describe('Checkbox', () => {
  it('renders <input type="checkbox"> with base class', () => {
    const { body } = parseAstro(checkPath);
    expect(body).toMatch(/<input\b[^>]*type="checkbox"/);
    const { frontmatter } = parseAstro(checkPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toBe('domi-check');
  });

  it('passes checked + name via ...props', () => {
    const { body } = parseAstro(checkPath);
    expect(body).toMatch(/\{\.\.\.rest\}/);
  });

  it('appends user class', () => {
    const { frontmatter, body } = parseAstro(checkPath);
    const cls = evaluateClassExpr(frontmatter, body, { class: 'x' });
    expect(cls).toBe('domi-check x');
  });
});

describe('Radio', () => {
  it('renders <input type="radio"> with base class', () => {
    const { body } = parseAstro(radioPath);
    expect(body).toMatch(/<input\b[^>]*type="radio"/);
    const { frontmatter } = parseAstro(radioPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toBe('domi-radio');
  });

  it('passes name + value via ...props', () => {
    const { body } = parseAstro(radioPath);
    expect(body).toMatch(/\{\.\.\.rest\}/);
  });
});