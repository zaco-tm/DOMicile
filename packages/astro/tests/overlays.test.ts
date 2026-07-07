import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseAstro, evaluateClassExpr } from './parser';

const modalPath = resolve(__dirname, '../src/components/Modal.astro');
const toastPath = resolve(__dirname, '../src/components/Toast.astro');
const tooltipPath = resolve(__dirname, '../src/components/Tooltip.astro');

describe('Modal', () => {
  it('renders <dialog> with base class', () => {
    const { body } = parseAstro(modalPath);
    expect(body).toMatch(/<dialog\b/);
    const { frontmatter } = parseAstro(modalPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toBe('domi-modal');
  });

  it('has open attribute bound to prop', () => {
    const { body } = parseAstro(modalPath);
    expect(body).toMatch(/open=\{open\}/);
  });
});

describe('Toast', () => {
  it('renders <div> with base class', () => {
    const { body } = parseAstro(toastPath);
    expect(body).toMatch(/<div\b/);
    const { frontmatter } = parseAstro(toastPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toBe('domi-toast');
  });
});

describe('Tooltip', () => {
  it('renders <span> with base class and data-tooltip attribute', () => {
    const { body } = parseAstro(tooltipPath);
    expect(body).toMatch(/<span\b/);
    expect(body).toMatch(/data-tooltip=\{content\}/);
    const { frontmatter } = parseAstro(tooltipPath);
    const cls = evaluateClassExpr(frontmatter, body, {});
    expect(cls).toBe('domi-tooltip');
  });
});