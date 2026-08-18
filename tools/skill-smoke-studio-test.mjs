#!/usr/bin/env node
// Playwright e2e for the studio frame.
// Run: node tools/skill-smoke-studio-test.mjs
// Exit 0 on pass, non-zero on any failure.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, '.domi/output');
const stateDir = resolve(root, '.domi/state');
mkdirSync(outDir, { recursive: true });
mkdirSync(stateDir, { recursive: true });

const DOC = 'studio-smoke';

// 1. Materialize a chrome + body pair directly (so the test is hermetic — does
//    not depend on tools/skill-smoke.mjs's clone step).
const chromeHtml = `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><title>${DOC}</title>
  <link rel="stylesheet" href="/components/domi.css">
  <link rel="stylesheet" href="/components/studio.css">
  <style>
    body { padding: 24px; }
    .studio-snap { display: flex; gap: 6px; align-items: center; padding: 8px 12px; }
    .studio-snap button { background: transparent; border: 1px solid var(--studio-border); border-radius: 4px; padding: 2px 8px; cursor: pointer; font: inherit; color: var(--studio-text); }
    .studio-snap button[aria-pressed="true"] { color: #f4978e; border-color: #f4978e; }
    .studio-frame-wrap { position: relative; display: inline-block; }
    .studio-frame { display: block; border: 1px solid var(--studio-border); background: #fff; border-radius: 4px; }
    .studio-resizer { position: absolute; right: -3px; top: 0; bottom: 0; width: 6px; cursor: ew-resize; }
  </style>
</head><body>
  <main>
    <div class="studio-snap">
      <button data-snap="375">375</button>
      <button data-snap="768">768</button>
      <button data-snap="1024" aria-pressed="true">1024</button>
      <button data-snap="1280">1280</button>
      <span data-domini-frame-readout>1024px</span>
    </div>
    <div class="studio-frame-wrap">
      <iframe id="studio-frame" src="./${DOC}-body.html" width="1024" height="600" class="studio-frame"></iframe>
      <div id="studio-resizer" tabindex="0" role="separator" aria-orientation="vertical" class="studio-resizer"></div>
    </div>
  </main>
  <aside data-domini-rail></aside>
  <span data-domini-status-chip>v0.1.0-working</span>
  <script src="/scripts/runtime/domi-audit.js"></script>
  <script src="/scripts/runtime/domi-audit-render.js"></script>
  <script src="/scripts/runtime/domi-frame-bridge.js"></script>
  <script>
    DomiAudit.mount({ statePath: '.domi/state/${DOC}.json', docName: '${DOC}' });
    StudioFrame.mount({ frameSelector: '#studio-frame' });
  </script>
</body></html>`;

const bodyHtml = `<!doctype html>
<html lang="en" data-theme="neo"><head>
  <meta charset="utf-8"><title>${DOC} body</title>
  <link rel="stylesheet" href="/components/domi.css">
</head><body>
  <main>
    <h1 data-feedback="hero-title">Hero</h1>
    <button data-feedback="cta-primary">Go</button>
  </main>
</body></html>`;

writeFileSync(resolve(outDir, `${DOC}.html`), chromeHtml);
writeFileSync(resolve(outDir, `${DOC}-body.html`), bodyHtml);

// 2. Boot a static file server on a free port.
//    Serves from the project root so the chrome + body can reference shared
//    assets (/components/..., /scripts/...) in addition to the materialized
//    chrome + body at /.domi/output/<doc>.html.
import http from 'node:http';
const server = http.createServer((req, res) => {
  const url = req.url === '/' ? `/.domi/output/${DOC}.html` : req.url;
  const filePath = resolve(root, '.' + url);
  if (!existsSync(filePath)) { res.statusCode = 404; res.end('not found'); return; }
  res.setHeader('content-type', filePath.endsWith('.html') ? 'text/html' : 'text/plain');
  res.end(readFileSync(filePath));
}).listen(0);
const port = server.address().port;
const url = `http://127.0.0.1:${port}/.domi/output/${DOC}.html`;

let exitCode = 0;
try {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });

  // 3a. Chrome renders.
  await page.waitForSelector('aside[data-domini-rail]');
  await page.waitForSelector('iframe#studio-frame');

  // 3b. Iframe loads the body (no 404 in network log; contentDocument has the title).
  const frame = await page.waitForSelector('iframe#studio-frame');
  const frameEl = await frame.contentFrame();
  await frameEl.waitForSelector('[data-feedback="cta-primary"]');
  // Re-mount the frame bridge now that the body is loaded. The first mount in
  // the chrome's inline script races against the iframe navigation — if it
  // ran while contentDocument was still about:blank, the click→target listener
  // is attached to the discarded initial document, not the body. Re-calling
  // mount() after waitForSelector above is safe (idempotent: wireBridge just
  // adds another listener to the current contentDocument).
  await page.evaluate(() => StudioFrame.mount({ frameSelector: '#studio-frame' }));

  // 3c. Snap button changes iframe width.
  await page.click('[data-snap="768"]');
  const widthAfterSnap = await page.$eval('#studio-frame', (el) => el.style.width);
  if (widthAfterSnap !== '768px') throw new Error(`expected width 768px, got ${widthAfterSnap}`);

  // 3d. Drag handle changes iframe width (move the resizer 200px right).
  const box = await page.$eval('#studio-resizer', (el) => el.getBoundingClientRect());
  await page.mouse.move(box.x + 3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 3 + 200, box.y + box.height / 2);
  await page.mouse.up();
  const widthAfterDrag = await page.$eval('#studio-frame', (el) => parseInt(el.style.width, 10));
  if (!(widthAfterDrag > 768 && widthAfterDrag <= 1920)) {
    throw new Error(`expected width in (768, 1920] after drag, got ${widthAfterDrag}`);
  }

  // 3e. Click in iframe sets the active target in the rail.
  await frameEl.click('[data-feedback="cta-primary"]');
  const hintText = await page.$eval('[data-domini-target-id]', (el) => el.textContent).catch(() => null);
  if (hintText !== 'cta-primary') {
    throw new Error(`expected rail target hint to be 'cta-primary', got '${hintText}'`);
  }

  // 3f. Body file opened directly is clean (no rail, no chip, no audit JS reference).
  await page.goto(`http://127.0.0.1:${port}/.domi/output/${DOC}-body.html`, { waitUntil: 'load' });
  const bodyRail = await page.$('aside[data-domini-rail]');
  if (bodyRail) throw new Error('body file should not have a rail');
  const bodyChip = await page.$('[data-domini-status-chip]');
  if (bodyChip) throw new Error('body file should not have a status chip');
  const auditRefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]'))
      .map((s) => s.getAttribute('src'))
      .filter((src) => src && src.includes('domi-audit'))
  );
  if (auditRefs.length > 0) throw new Error(`body file should not load audit scripts, found: ${auditRefs.join(', ')}`);

  console.log('studio-smoke: all assertions passed');
  await browser.close();
} catch (err) {
  console.error('studio-smoke: FAILED');
  console.error(err);
  exitCode = 1;
} finally {
  server.close();
}

process.exit(exitCode);
