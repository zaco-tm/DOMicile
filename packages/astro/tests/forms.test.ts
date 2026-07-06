import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseAstro, evaluateClassExpr } from './parser';

const formPath = resolve(__dirname, '../src/components/Form.astro');
const inputPath = resolve(__dirname, '../src/components/Input.astro');
const selectPath = resolve(__dirname, '../src/components/Select.astro');

describe('Form', () => {
  it('renders <form> with base class', () => {
    const { body } = parseAstro(formPath);
    expect(body).toMatch(/<form\b/);
    const { frontmatter } = parseAstro(formPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toBe('domi-form');
  });

  it('passes through action/method via ...props', () => {
    const { body } = parseAstro(formPath);
    expect(body).toMatch(/\{\.\.\.rest\}/);
  });
});

describe('Input', () => {
  it('renders <input> with base class', () => {
    const { frontmatter, body } = parseAstro(inputPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toContain('domi-input');
    expect(cls).toContain('domi-input--lg');
  });

  it.each(['sm', 'lg'] as const)('applies %s size', (size) => {
    const { frontmatter, body } = parseAstro(inputPath);
    const cls = evaluateClassExpr(frontmatter, body, { size });
    expect(cls).toContain(`domi-input--${size}`);
  });

  it('applies error variant when error is true', () => {
    const { frontmatter, body } = parseAstro(inputPath);
    const cls = evaluateClassExpr(frontmatter, body, { error: true });
    expect(cls).toContain('domi-input--error');
  });

  it('appends user class', () => {
    const { frontmatter, body } = parseAstro(inputPath);
    const cls = evaluateClassExpr(frontmatter, body, { class: 'x' });
    expect(cls).toMatch(/domi-input.*\bx\b/);
  });

  it('passes type via ...props', () => {
    const { body } = parseAstro(inputPath);
    expect(body).toMatch(/<input\b/);
    expect(body).toMatch(/\{\.\.\.rest\}/);
  });
});

describe('Select', () => {
  it('renders <select> with base class', () => {
    const { frontmatter, body } = parseAstro(selectPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toContain('domi-select');
    expect(cls).toContain('domi-select--lg');
  });

  it.each(['sm', 'lg'] as const)('applies %s size', (size) => {
    const { frontmatter, body } = parseAstro(selectPath);
    const cls = evaluateClassExpr(frontmatter, body, { size });
    expect(cls).toContain(`domi-select--${size}`);
  });

  it('applies error variant when error is true', () => {
    const { frontmatter, body } = parseAstro(selectPath);
    const cls = evaluateClassExpr(frontmatter, body, { error: true });
    expect(cls).toContain('domi-select--error');
  });

  it('passes name via ...props', () => {
    const { body } = parseAstro(selectPath);
    expect(body).toMatch(/<select\b/);
    expect(body).toMatch(/\{\.\.\.rest\}/);
  });
});