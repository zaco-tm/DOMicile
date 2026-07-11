import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'where-is.mjs');

function stageGraph(dir, graph) {
  mkdirSync(join(dir, 'graphify-out'), { recursive: true });
  writeFileSync(join(dir, 'graphify-out', 'graph.json'), JSON.stringify(graph));
}

const SAMPLE_GRAPH = {
  directed: false,
  multigraph: false,
  graph: { hyperedges: [] },
  nodes: [
    { id: 'foo', label: 'Foo', community: 17, source_file: 'a/foo.js',
      file_type: 'code', source_location: 'L1' },
    { id: 'bar', label: 'Bar', community: 17, source_file: 'a/bar.js',
      file_type: 'code', source_location: 'L1' },
    { id: 'baz', label: 'Baz', community: 42, source_file: 'b/baz.js',
      file_type: 'document', source_location: 'L1' },
  ],
  links: [
    { source: 'foo', target: 'bar', relation: 'calls', confidence: 'EXTRACTED',
      confidence_score: 1.0, source_file: 'a/foo.js', weight: 1.0 },
    { source: 'bar', target: 'baz', relation: 'references', confidence: 'EXTRACTED',
      confidence_score: 1.0, source_file: 'a/bar.js', weight: 1.0 },
  ],
  hyperedges: [],
};

describe('where-is', () => {
  it('exits 2 when query empty', () => {
    let code = 0;
    try {
      execFileSync('node', [SCRIPT], { stdio: 'pipe' });
    } catch (e) {
      code = e.status;
    }
    expect(code).toBe(2);
  });

  it('exits 1 when graph.json missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wi-'));
    try {
      let code = 0, out = '';
      try {
        execFileSync('node', [SCRIPT, 'foo'], { cwd: dir, encoding: 'utf8' });
      } catch (e) {
        code = e.status; out = e.stderr + e.stdout;
      }
      expect(code).toBe(1);
      expect(out).toContain('No graph at');
      expect(out).toContain('npm run graph');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints matched nodes grouped by community', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wi-'));
    stageGraph(dir, SAMPLE_GRAPH);
    try {
      const out = execFileSync('node', [SCRIPT, 'foo'], { cwd: dir, encoding: 'utf8' });
      expect(out).toContain('Found 1 node');
      expect(out).toContain('Community 17');
      expect(out).toContain('Foo');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints blast-radius edges from links[] when present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wi-'));
    stageGraph(dir, SAMPLE_GRAPH);
    try {
      // Query 'a/' matches both `foo` and `bar` (both in a/), so the
      // foo<->bar link has both endpoints in the match set; only then
      // does blast-radius print.
      const out = execFileSync('node', [SCRIPT, 'a/'], { cwd: dir, encoding: 'utf8' });
      expect(out).toContain('Blast-radius');
      expect(out).toContain('--[calls, conf=EXTRACTED]-->');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints a suggested next query', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wi-'));
    stageGraph(dir, SAMPLE_GRAPH);
    try {
      const out = execFileSync('node', [SCRIPT, 'foo'], { cwd: dir, encoding: 'utf8' });
      expect(out).toContain('Suggested next');
      expect(out).toContain('where-is.mjs "');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('handles zero matches gracefully', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wi-'));
    stageGraph(dir, SAMPLE_GRAPH);
    try {
      const out = execFileSync('node', [SCRIPT, 'nonsense-zzz'], { cwd: dir, encoding: 'utf8' });
      expect(out).toContain('No nodes match');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
