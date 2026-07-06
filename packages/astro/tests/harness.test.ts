import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAstro, evaluateClassExpr } from './parser';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('@domi/astro test harness (static analysis)', () => {
  it('parser splits frontmatter and body', () => {
    const sample = `---\nconst x = 1;\n---\n<p>{x}</p>\n`;
    const fixture = resolve(__dirname, '_harness.astro');
    writeFileSync(fixture, sample);
    try {
      const { frontmatter, body } = parseAstro(fixture);
      expect(frontmatter).toBe('\nconst x = 1;\n');
      expect(body).toBe('<p>{x}</p>\n');
    } finally {
      unlinkSync(fixture);
    }
  });

  it('evaluateClassExpr resolves inline pattern with props', () => {
    const sample = `---\nconst variant = 'primary';\n---\n<div class={['domi-x', variant && \`domi-x--${'$'}{variant}\`, 'extra'].filter(Boolean).join(' ')}></div>\n`;
    const fixture = resolve(__dirname, '_harness2.astro');
    writeFileSync(fixture, sample);
    try {
      const { body } = parseAstro(fixture);
      const cls = evaluateClassExpr(body, { variant: 'danger' });
      expect(cls).toBe('domi-x domi-x--danger extra');
    } finally {
      unlinkSync(fixture);
    }
  });

  it('components directory exists (empty at Task 1)', () => {
    const componentsDir = resolve(__dirname, '../src/components');
    expect(existsSync(componentsDir)).toBe(true);
  });
});