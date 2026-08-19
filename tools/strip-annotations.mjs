#!/usr/bin/env node
// tools/strip-annotations.mjs
//
// Strip the annotation/highlight/outline chrome from a DOMicile working-doc
// body file, producing a ship-ready HTML deliverable.
//
// What gets stripped:
//   1. All `data-feedback="..."` attributes (the per-element comment targets).
//   2. CSS rules in <style> blocks that target `[data-feedback]` or
//      `[data-feedback]:hover` (the dashed outline + copy cursor).
//   3. <script src="...domi.js" ...> tags (the click-feedback runtime).
//
// What stays:
//   - The <link rel="stylesheet" href="...domi.css"> (the design system).
//   - The data-theme attribute on <html> (the body theme).
//   - All domi-card, domi-btn, etc. classes (the design system primitives).
//   - Any other CSS the body file owns (body margin/padding, etc.).
//
// Usage:
//   node tools/strip-annotations.mjs <input-body.html>             # writes <input>.shipped.html
//   node tools/strip-annotations.mjs <input> --out <output>       # writes to <output>
//   node tools/strip-annotations.mjs <input> --in-place           # overwrites <input>
//   node tools/strip-annotations.mjs <input> --dry-run            # writes to stdout, no file

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename, extname, join } from 'node:path';

const args = process.argv.slice(2);
function hasFlag(name) { return args.includes(name); }
function argValue(name, fallback) {
  // Accept both `--name value` and `--name=value` forms.
  const eq = args.find((a) => a === name || a.startsWith(name + '='));
  if (eq && eq.includes('=')) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return fallback;
}

const inPlace = hasFlag('--in-place');
const dryRun = hasFlag('--dry-run');
const outPath = argValue('--out', null);
// Positional input: the first non-flag arg that isn't the value of --out.
const inputPath = args.find((a, i) => {
  if (a.startsWith('--')) return false;
  if (outPath && a === outPath) return false;
  // Also skip the value of any other --<flag> taking a value.
  const prev = args[i - 1];
  if (prev && prev.startsWith('--') && prev === '--out') return false;
  return true;
});

if (!inputPath) {
  console.error('usage: node tools/strip-annotations.mjs <input> [--out <path>] [--in-place] [--dry-run]');
  process.exit(1);
}

const absIn = resolve(inputPath);
const html = readFileSync(absIn, 'utf8');

function countMatches(s, re) {
  return (s.match(re) || []).length;
}

const RE_FEEDBACK_ATTR = /\s+data-feedback="[^"]*"/g;
const RE_DATA_FEEDBACK_RULE = /\s*\[\s*data-feedback\s*\](?::[a-zA-Z-]+)?\s*\{[^}]*\}/g;
const RE_DOMI_SCRIPT = /<script[^>]*src="[^"]*domi\.js"[^>]*>\s*<\/script>/g;

const before = {
  attrs: countMatches(html, RE_FEEDBACK_ATTR),
  rules: countMatches(html, RE_DATA_FEEDBACK_RULE),
  scripts: countMatches(html, RE_DOMI_SCRIPT),
};

let out = html;
out = out.replace(RE_FEEDBACK_ATTR, '');
out = out.replace(RE_DATA_FEEDBACK_RULE, '');
out = out.replace(RE_DOMI_SCRIPT, '');

const after = {
  attrs: countMatches(out, RE_FEEDBACK_ATTR),
  rules: countMatches(out, RE_DATA_FEEDBACK_RULE),
  scripts: countMatches(out, RE_DOMI_SCRIPT),
};

let dest;
if (outPath) {
  dest = resolve(outPath);
} else if (inPlace) {
  dest = absIn;
} else {
  const ext = extname(absIn);
  const stem = basename(absIn, ext);
  dest = join(dirname(absIn), `${stem}.shipped${ext}`);
}

const summary = `stripped ${before.attrs - after.attrs} data-feedback attrs, ${before.rules - after.rules} CSS rules, ${before.scripts - after.scripts} domi script${before.scripts - after.scripts === 1 ? '' : 's'}`;

if (dryRun) {
  process.stdout.write(out);
  console.error(`\n[dry-run] ${inputPath} → ${dest}`);
  console.error(`[dry-run] ${summary}`);
} else {
  writeFileSync(dest, out, 'utf8');
  console.log(`[strip-annotations] ${inputPath} → ${dest}`);
  console.log(`[strip-annotations] ${summary}`);
}
