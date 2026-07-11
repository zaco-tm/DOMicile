#!/usr/bin/env node
// Loads templates/dashboard/index.html into jsdom, asserts the DOM parses
// and includes the expected DOMicile classes. Does NOT visually verify —
// that's a manual step.

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = process.cwd();
const dashboardPath = resolve(projectRoot, 'templates/dashboard/index.html');
const html = readFileSync(dashboardPath, 'utf8');

const dom = new JSDOM(html);
const doc = dom.window.document;

const checks = [
  ['has DOCTYPE', /<!doctype/i.test(html)],
  ['links domi.css', !!doc.querySelector('link[href*="domi.css"]')],
  ['has domi-card', doc.querySelectorAll('.domi-card').length >= 4],
  ['has domi-display headline', !!doc.querySelector('.domi-display')],
  ['has domi-table or table', !!doc.querySelector('.domi-table, table')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
