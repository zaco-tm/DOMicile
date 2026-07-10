import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'check-file-size.mjs');

function makeTree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'cfs-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(dir, rel).split('/').slice(0, -1).join('/'), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

describe('check-file-size', () => {
  it('exits 0 with no files', () => {
    const dir = makeTree({});
    try {
      const out = execFileSync('node', [SCRIPT, '--root', dir, '--no-fail'], { encoding: 'utf8' });
      expect(out).toContain('0 issues');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 0 for healthy file', () => {
    const dir = makeTree({ 'a.ts': 'a\nb\nc\n' });
    try {
      execFileSync('node', [SCRIPT, '--root', dir, '--no-fail'], { encoding: 'utf8' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags SPLIT_NOW when a file is 500+ lines', () => {
    const body = Array(600).fill('line').join('\n') + '\n';
    const dir = makeTree({ 'big.ts': body });
    try {
      let code = 0, out = '';
      try {
        out = execFileSync('node', [SCRIPT, '--root', dir], { encoding: 'utf8' });
      } catch (e) {
        code = e.status;
        out = e.stdout + e.stderr;
      }
      expect(code).toBe(1);
      expect(out).toContain('big.ts');
      expect(out).toContain('SPLIT_NOW');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags REFACTOR at 700+ lines', () => {
    const body = Array(800).fill('line').join('\n') + '\n';
    const dir = makeTree({ 'huge.ts': body });
    try {
      let out = '';
      try {
        execFileSync('node', [SCRIPT, '--root', dir], { encoding: 'utf8' });
      } catch (e) {
        out = e.stdout + e.stderr;
      }
      expect(out).toContain('huge.ts');
      expect(out).toContain('REFACTOR');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--no-fail exits 0 even with offenses', () => {
    const body = Array(800).fill('line').join('\n') + '\n';
    const dir = makeTree({ 'huge.ts': body });
    try {
      execFileSync('node', [SCRIPT, '--root', dir, '--no-fail'], { encoding: 'utf8' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips node_modules', () => {
    const dir = makeTree({});
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'pkg', 'big.js'), Array(800).fill('x').join('\n'));
    try {
      execFileSync('node', [SCRIPT, '--root', dir, '--no-fail'], { encoding: 'utf8' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
