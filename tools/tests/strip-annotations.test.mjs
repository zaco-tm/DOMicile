import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TOOL = resolve(here, '..', 'strip-annotations.mjs');

// A representative body file. Includes all the chrome we want to strip
// (data-feedback attrs, [data-feedback] CSS rules, domi.js script) plus
// what we want to preserve (data-theme, domi.css link, domi-card classes,
// body styles).
const FIXTURE = `<!doctype html>
<html lang="en" data-theme="neo">
<head>
  <meta charset="utf-8">
  <title>Working Doc — example</title>
  <link rel="stylesheet" href="../../components/domi.css">
  <script src="../../scripts/runtime/domi.js" defer></script>
  <style>
    body { margin: 0; padding: 24px; }
    [data-feedback] { cursor: copy; }
    [data-feedback]:hover { outline: 1px dashed rgba(60, 35, 66, 0.35); outline-offset: 4px; }
  </style>
</head>
<body>
  <main>
    <h1 data-feedback="doc-title">Example working doc</h1>
    <p>This is a reference working doc. Clone it; replace content with the thing you're actually working on.</p>
    <section data-feedback="section-kpis">
      <h2>KPIs</h2>
      <article class="domi-card" data-feedback="kpi-revenue">
        <h3>Revenue</h3>
        <p>$0</p>
      </article>
      <article class="domi-card" data-feedback="kpi-active-users">
        <h3>Active users</h3>
        <p>0</p>
      </article>
    </section>
  </main>
</body>
</html>
`;

let workDir;
let inPath;

function runTool(args) {
  return spawnSync('node', [TOOL, ...args], { encoding: 'utf8' });
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'strip-annotations-'));
  inPath = join(workDir, 'body.html');
  writeFileSync(inPath, FIXTURE, 'utf8');
});

afterEach(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe('strip-annotations: strip rules', () => {
  it('strips every data-feedback="..." attribute', () => {
    const r = runTool([inPath, '--in-place']);
    expect(r.status).toBe(0);
    const out = readFileSync(inPath, 'utf8');
    expect(out).not.toMatch(/data-feedback=/);
  });

  it('strips the [data-feedback] { cursor: copy; } rule', () => {
    const r = runTool([inPath, '--in-place']);
    expect(r.status).toBe(0);
    const out = readFileSync(inPath, 'utf8');
    expect(out).not.toMatch(/\[data-feedback\]\s*\{[^}]*cursor/);
  });

  it('strips the [data-feedback]:hover { outline: ... } rule', () => {
    const r = runTool([inPath, '--in-place']);
    expect(r.status).toBe(0);
    const out = readFileSync(inPath, 'utf8');
    expect(out).not.toMatch(/\[data-feedback\]:hover\s*\{[^}]*outline/);
  });

  it('strips the <script src="...domi.js"> tag', () => {
    const r = runTool([inPath, '--in-place']);
    expect(r.status).toBe(0);
    const out = readFileSync(inPath, 'utf8');
    expect(out).not.toMatch(/<script[^>]*domi\.js/);
  });

  it('preserves data-theme on <html>', () => {
    const r = runTool([inPath, '--in-place']);
    const out = readFileSync(inPath, 'utf8');
    expect(out).toMatch(/<html lang="en" data-theme="neo">/);
  });

  it('preserves the domi.css <link>', () => {
    const r = runTool([inPath, '--in-place']);
    const out = readFileSync(inPath, 'utf8');
    expect(out).toMatch(/<link rel="stylesheet" href="\.\.\/\.\.\/components\/domi\.css">/);
  });

  it('preserves domi-card and other domi-* classes', () => {
    const r = runTool([inPath, '--in-place']);
    const out = readFileSync(inPath, 'utf8');
    expect(out).toMatch(/<article class="domi-card">/);
  });

  it('preserves the body margin/padding style', () => {
    const r = runTool([inPath, '--in-place']);
    const out = readFileSync(inPath, 'utf8');
    expect(out).toMatch(/body\s*\{\s*margin:\s*0;\s*padding:\s*24px;\s*\}/);
  });

  it('preserves the visible content of the page', () => {
    const r = runTool([inPath, '--in-place']);
    const out = readFileSync(inPath, 'utf8');
    expect(out).toMatch(/Example working doc/);
    expect(out).toMatch(/<h3>Revenue<\/h3>/);
    expect(out).toMatch(/<h3>Active users<\/h3>/);
  });
});

describe('strip-annotations: output path handling', () => {
  it('default output is <input>.shipped.html next to the input', () => {
    const r = runTool([inPath]);
    expect(r.status).toBe(0);
    const expected = join(workDir, 'body.shipped.html');
    expect(existsSync(expected)).toBe(true);
    expect(r.stdout).toContain('body.html → ' + expected);
  });

  it('--in-place overwrites the input file', () => {
    const r = runTool([inPath, '--in-place']);
    expect(r.status).toBe(0);
    // The RHS of the arrow in stdout is the absolute path of the input,
    // which proves the destination is the same as the source.
    expect(r.stdout).toContain(inPath);
    const out = readFileSync(inPath, 'utf8');
    expect(out).not.toMatch(/data-feedback=/);
  });

  it('--out <path> writes to the specified path', () => {
    const outPath = join(workDir, 'final.html');
    const r = runTool([inPath, `--out=${outPath}`]);
    expect(r.status).toBe(0);
    expect(existsSync(outPath)).toBe(true);
    const out = readFileSync(outPath, 'utf8');
    expect(out).not.toMatch(/data-feedback=/);
  });

  it('--dry-run writes to stdout and does not touch the filesystem', () => {
    const beforeMtime = statSync(inPath).mtimeMs;
    const r = runTool([inPath, '--dry-run']);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/data-feedback=/);
    // input file is unchanged
    const afterMtime = statSync(inPath).mtimeMs;
    expect(afterMtime).toBe(beforeMtime);
    // dry-run does NOT create a .shipped.html sibling
    expect(existsSync(join(workDir, 'body.shipped.html'))).toBe(false);
    // dry-run reports what WOULD be stripped
    expect(r.stderr).toMatch(/\[dry-run\]/);
    expect(r.stderr).toMatch(/stripped \d+ data-feedback attrs/);
  });
});

describe('strip-annotations: input handling', () => {
  it('exits non-zero with usage when no input is given', () => {
    const r = runTool([]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/usage:/);
  });
});
