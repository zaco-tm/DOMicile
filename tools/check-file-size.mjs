#!/usr/bin/env node
// tools/check-file-size.mjs
//
// Enforce the per-file size thresholds defined by the agent-friendly
// refactor (Part 1).
//
// Usage: node tools/check-file-size.mjs [--root <dir>] [--no-fail]
//   --no-fail    warn instead of exit 1
//   --root       scan root (default: cwd)
//
// Thresholds (lines):
//   0-300     healthy
//   300-500   watchful  (no added logic unless fits single responsibility)
//   500-700   split-now (must extract a coherent responsibility before adding more)
//   700+      refactor target
//
// CI: run `node tools/check-file-size.mjs` with no flags. Exit 1
// fails the build. Local: `npm test` uses --no-fail so dev loops
// stay green even if a pre-existing big file hasn't been split yet.

import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const DEV_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.rs', '.html', '.css', '.scss',
]);

const SKIP_DIRS = new Set([
  'node_modules', 'target', 'dist', 'build', '.astro',
  '.domi', '.superpowers', '.git', 'graphify-out',
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function linesFor(path) {
  const buf = readFileSync(path);
  let count = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) count++;
  if (buf.length && buf[buf.length - 1] !== 0x0a) count++;
  return count;
}

const argv = process.argv.slice(2);
const noFail = argv.includes('--no-fail');
const rootIdx = argv.indexOf('--root');
const root = rootIdx >= 0 ? resolve(argv[rootIdx + 1]) : process.cwd();

const files = walk(root).filter(f => DEV_EXTS.has(extname(f)));

const WATCHFUL = 300;
const SPLIT_NOW = 500;
const REFACTOR = 700;

const offenses = [];
const watches = [];

for (const file of files) {
  const lines = linesFor(file);
  const rel = relative(root, file);
  if (lines >= REFACTOR) {
    offenses.push({ rel, lines, level: 'REFACTOR' });
  } else if (lines >= SPLIT_NOW) {
    offenses.push({ rel, lines, level: 'SPLIT_NOW' });
  } else if (lines >= WATCHFUL) {
    watches.push({ rel, lines });
  }
}

if (offenses.length === 0 && watches.length === 0) {
  console.log(`check-file-size: 0 issues across ${files.length} dev files under ${root}`);
  process.exit(0);
}

if (watches.length) {
  console.log(`# watchful (${watches.length} files between ${WATCHFUL}-${SPLIT_NOW} lines)`);
  for (const w of watches) console.log(`  ${w.rel}: ${w.lines}`);
}

if (offenses.length) {
  console.error(`# offenses (${offenses.length} files >= ${SPLIT_NOW} lines)`);
  for (const o of offenses) console.error(`  ${o.rel}: ${o.lines} [${o.level}]`);
  if (!noFail) process.exit(1);
}
process.exit(noFail ? 0 : 0);
