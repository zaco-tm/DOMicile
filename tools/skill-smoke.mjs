#!/usr/bin/env node
// skill-smoke — wire the local DOMiNice skill loop end-to-end.
//
//   1. Clone templates/working-doc/index.html into .domi/output/<name>.html
//      (rewriting ../../components and ../../scripts paths to root-relative
//      so they resolve under the served URL).
//   2. Serve the project root on http://127.0.0.1:<port>/ so the cloned
//      doc, the library's components/domi.css, and scripts/domi-audit.js
//      all resolve.
//   3. Print the URL a human reviewer can open. Ctrl-C to stop.
//
// This is the "playability first" step from the Phase 4 skill-loop
// handoff (docs/superpowers/handoffs/2026-07-06-phase4-skill-loop-handoff.md).
// A working doc that a human can open, click comments on, and see persist
// in localStorage is what tells us the skill works — distribution is a
// later step.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from 'node:fs';
import { createServer, get as httpGet } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const archetypePath = join(projectRoot, 'templates/working-doc/index.html');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  const eq = args.find((a) => a.startsWith(name + '='));
  if (eq) return eq.slice(name.length + 1);
  return fallback;
}

const docName = arg('--doc', args[0] && !args[0].startsWith('--') ? args[0] : 'smoke');
const port = Number(arg('--port', process.env.PORT || '8123'));
const host = arg('--host', '127.0.0.1');

// --- 1. Clone the archetype ---------------------------------------------------

const outputDir = join(projectRoot, '.domi/output');
const stateDir = join(projectRoot, '.domi/state');
mkdirSync(outputDir, { recursive: true });
mkdirSync(stateDir, { recursive: true });

const outputPath = join(outputDir, `${docName}.html`);
const archetype = readFileSync(archetypePath, 'utf8');

// Rewrite relative library paths so they resolve when served from project root
// (e.g. /output/<name>.html -> /components/domi.css instead of the broken
// ../../components/domi.css). Also pin docName and title so the audit rail's
// localStorage namespace matches the file, and a reviewer opening the URL
// immediately knows which doc they are looking at.
const cloned = archetype
  .replaceAll('../../components/', '/components/')
  .replaceAll('../../scripts/', '/scripts/')
  .replace(/docName:\s*'[^']*'/g, `docName: '${docName}'`)
  .replace(/statePath:\s*'[^']*'/g, `statePath: '.domi/state/${docName}.json'`)
  .replace(/<title>[^<]*<\/title>/, `<title>Working Doc — ${docName}</title>`)
  .replace(/data-domini-status-chip">[^<]*/, `data-domini-status-chip">${docName} v0`);

writeFileSync(outputPath, cloned, 'utf8');
console.log(`[skill-smoke] cloned ${archetypePath}`);
console.log(`[skill-smoke] wrote ${outputPath}`);

// --- 2. Serve the project root ------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

function safeJoin(root, requested) {
  // Project-rooted; blocks path traversal. Decoded before join.
  const clean = decodeURIComponent(requested.split('?')[0]).replace(/^\/+/, '');
  const target = resolve(root, clean);
  if (target !== root && !target.startsWith(root + '/')) return null;
  return target;
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('Method Not Allowed');
    return;
  }
  const url = req.url || '/';
  let target = safeJoin(projectRoot, url);
  if (target === null) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let servePath = target;
  try {
    const st = statSync(target);
    if (st.isDirectory()) {
      const guess = join(target, `${docName}.html`);
      if (existsSync(guess)) {
        servePath = guess;
      } else {
        res.writeHead(403).end('No index for directory');
        return;
      }
    }
  } catch {
    res.writeHead(404).end('Not Found: ' + url);
    return;
  }
  const ext = extname(servePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const body = readFileSync(servePath);
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': body.length });
  res.end(body);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`[skill-smoke] port ${port} is already in use; pass --port <n> to use another.`);
    process.exit(2);
  }
  throw err;
});

server.listen(port, host, () => {
  console.log(`[skill-smoke] serving ${projectRoot}`);
  console.log(`[skill-smoke] open: http://${host}:${port}/.domi/output/${docName}.html`);
  console.log('[skill-smoke] Ctrl-C to stop.');
});

// --- 3. Self-check the served HTML well-formedness ----------------------------

setTimeout(() => {
  const req = httpGet(`http://127.0.0.1:${port}/.domi/output/${docName}.html`, (r) => {
    if (r.statusCode !== 200) {
      console.error(`[skill-smoke] self-check: served status ${r.statusCode}`);
      process.exitCode = 3;
      return;
    }
    let buf = '';
    r.setEncoding('utf8');
    r.on('data', (c) => { buf += c; });
    r.on('end', () => {
      const checks = [
        ['data-feedback hooks present', /data-feedback="[^"]+"/.test(buf)],
        ['scripts/domi-audit.js loaded', /\/scripts\/domi-audit\.js/.test(buf)],
        ['DomiAudit.mount invoked', /DomiAudit\.mount/.test(buf)],
      ];
      let bad = 0;
      for (const [name, ok] of checks) {
        console.log(`[skill-smoke] self-check ${ok ? 'OK' : 'FAIL'}: ${name}`);
        if (!ok) bad++;
      }
      if (bad) process.exitCode = 4;
      else console.log('[skill-smoke] all checks passed — open the URL above to review.');
    });
  });
  req.on('error', (e) => {
    console.error('[skill-smoke] self-check request failed:', e.message);
  });
}, 200);
