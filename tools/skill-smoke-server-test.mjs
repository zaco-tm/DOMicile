#!/usr/bin/env node
// skill-smoke-server-test — drive the skill loop against the real Rust
// domi-server binary. Sister test to tools/skill-smoke-test.mjs, which
// covers the standalone localStorage path.
//
// What this exercises:
//   1. domi-server serves .domi/output/ correctly.
//   2. The HTML shim is auto-injected on every HTML page that has a
//      <script> tag (Phase 4 item 4 wiring).
//   3. domi-audit.js detects window.__DOMI_SERVER__ and routes comments
//      to /api/events instead of localStorage.
//   4. GET /api/events?doc=<name> returns the comment body.
//
// This is the "events are written to the server" lane called out by the
// Phase 4 skill-loop handoff item 4.
//
// Usage: node tools/skill-smoke-server-test.mjs

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefox } from 'playwright';

// Playwright's bundled Firefox (Gecko). Install once with:
//   npx playwright install firefox

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const docName = process.env.DOC_NAME || 'smoke';
const port = Number(process.env.PORT || '4173');
const commentBody = `server-e2e: ${new Date().toISOString()}`;

const targetBinary = resolve(projectRoot, 'target/release/domi-server');
if (!existsSync(targetBinary)) {
  console.error(`Missing binary ${targetBinary}. Build with: cargo build --release -p domi-server`);
  process.exit(2);
}

// Temp root + state so the test is hermetic and never touches the real
// repo's .domi/ directory.
const scratch = mkdtempSync(join(tmpdir(), 'domi-server-e2e-'));
const rootDir = join(scratch, 'output');
const stateDir = join(scratch, 'state');
mkdirSync(rootDir, { recursive: true });
mkdirSync(stateDir, { recursive: true });

let server;
function startServer() {
  return new Promise((res, rej) => {
    server = spawn(
      targetBinary,
      [
        '--port', String(port),
        '--host', '127.0.0.1',
        '--root', rootDir,
        '--state', stateDir,
        '--library-root', projectRoot,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let ready = false;
    server.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      process.stdout.write(`[server-stdout] ${s}`);
      if (!ready && /serving|listening/i.test(s)) ready = true;
    });
    server.stderr.on('data', (chunk) => process.stderr.write(`[server-stderr] ${chunk}`));
    const start = Date.now();
    const tick = setInterval(() => {
      if (ready) { clearInterval(tick); res(); return; }
      if (Date.now() - start > 4000) {
        clearInterval(tick);
        // Fallback: probe /healthz
        import('node:http').then((http) => {
          const req = http.get(`http://127.0.0.1:${port}/healthz`, (r) => {
            if (r.statusCode === 200) res();
            else rej(new Error(`healthz ${r.statusCode}`));
          });
          req.on('error', rej);
        });
      }
    }, 100);
    setTimeout(() => {
      if (!ready) rej(new Error('server did not start within 5s'));
    }, 5000);
  });
}

function stopServer() {
  if (!server || server.killed) return;
  try { server.kill('SIGTERM'); } catch { /* */ }
  setTimeout(() => {
    try { server && !server.killed && server.kill('SIGKILL'); } catch { /* */ }
  }, 500);
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`[e2e-server] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function run() {
  await startServer();

  // The working doc carries ../../components/... and ../../scripts/runtime/...
  // asset references. The Rust server, now configured with --library-root,
  // exposes /components/* and /scripts/* directly — no path rewrite or
  // symlink dance needed (this test previously hand-rolled both, masking
  // the underlying library-routing gap).
  const archetypePath = join(projectRoot, 'templates/working-doc/index.html');
  const archetype = readFileSync(archetypePath, 'utf8');
  const cloned = archetype
    .replace(/docName:\s*'[^']*'/g, `docName: '${docName}'`)
    .replace(/statePath:\s*'[^']*'/g, `statePath: '.domi/state/${docName}.json'`)
    .replace(/<title>[^<]*<\/title>/, `<title>Working Doc — ${docName}</title>`)
    .replace(/data-domini-status-chip(?:="[^"]*")?>([^<]*)/, `data-domini-status-chip>${docName} v0`);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(rootDir, `${docName}.html`), cloned, 'utf8');

  const url = `http://127.0.0.1:${port}/${docName}.html`;
  let browser;
  try {
    browser = await firefox.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    let pageErr = null;
    page.on('pageerror', (e) => { pageErr = e; });
    page.on('console', (msg) => {
      const t = msg.type();
      if (t === 'error' || t === 'warning' || t === 'log') {
        console.log(`[browser-${t}] ${msg.text()}`);
      }
    });
    page.on('requestfailed', (req) => {
      console.log(`[req-failed] ${req.url()} -> ${req.failure() && req.failure().errorText}`);
    });
    page.on('response', (resp) => {
      if (resp.status() >= 400) console.log(`[bad-resp] ${resp.url()} -> ${resp.status()}`);
    });

    const resp = await page.goto(url, { waitUntil: 'load' });
    check('GET served HTML 200', resp && resp.status() === 200, `status=${resp && resp.status()}`);

    await page.waitForSelector('form[data-domini-rail-form] textarea[name="body"]', { timeout: 4000 });
    const html = await page.content();
    check('server shim injected (window.__DOMI_SERVER__)', /window\.__DOMI_SERVER__/.test(html));

    await page.fill('form[data-domini-rail-form] textarea[name="body"]', commentBody);
    await page.click('form[data-domini-rail-form] button[type="submit"]');

    // Wait for the rail list to show the new entry (server echo arrived).
    await page.waitForFunction(
      (body) => document.querySelector('[data-domini-rail-list] li')?.textContent?.includes(body) || false,
      commentBody,
      { timeout: 4000 }
    ).catch(() => null);
    const listText = await page.locator('[data-domini-rail-list]').first().textContent();
    check(
      'comment appears in rail (server echo)',
      typeof listText === 'string' && listText.includes(commentBody),
      listText ? `length=${listText.length}` : 'rail empty'
    );

    check('no page errors', pageErr === null, pageErr && String(pageErr));

    // Server-side: GET /api/events?doc=<docName> should now carry the entry.
    const events = await fetch(`http://127.0.0.1:${port}/api/events?doc=${encodeURIComponent(docName)}&limit=100`).then((r) => r.json());
    const match = (events.events || []).find((e) => e && e.data && e.data.body === commentBody);
    check(
      'comment visible via GET /api/events?doc=<doc>',
      !!match,
      match ? `id=${match.id} src=${match.src}` : `events=${JSON.stringify(events.events)}`
    );

    // Iter-modal: trigger an HTML write to wake the IterWatcher, assert the
    // modal appears, dismiss it, confirm chip persists, then wait past
    // quiescence for the chip to clear.
    const iterWritePath = join(rootDir, `${docName}.html`);
    const beforeWrite = readFileSync(iterWritePath, 'utf8');
    const { utimesSync, writeFile: writeFileAsync } = await import('node:fs/promises');
    await writeFileAsync(iterWritePath, beforeWrite + '\n<!-- iter-write ' + Date.now() + ' -->');
    // Bump mtime in case the FS deduped the write — watcher needs a new event.
    const future = new Date(Date.now() + 2000);
    utimesSync(iterWritePath, future, future);

    let iterModalAppeared = false;
    try {
      await page.waitForSelector('[data-domini-iter-modal]', { timeout: 4000 });
      iterModalAppeared = true;
    } catch { /* fall through */ }
    check('iter modal appears after file write', iterModalAppeared);

    if (iterModalAppeared) {
      const chipIterating = await page.locator('[data-domini-status-chip][data-iterating]').count();
      check('chip shows iterating state', chipIterating === 1, `count=${chipIterating}`);

      const hide = page.locator('[data-domini-iter-hide]').first();
      if (await hide.count()) {
        await hide.click().catch(() => null);
        try {
          await page.waitForSelector('[data-domini-iter-modal]', { state: 'detached', timeout: 2000 });
        } catch { /* */ }
      }
      const chipAfterDismiss = await page.locator('[data-domini-status-chip][data-iterating]').count();
      check('chip persists after dismiss', chipAfterDismiss === 1, `count=${chipAfterDismiss}`);
    }
  } catch (err) {
    check('uncaught test error', false, String(err && err.stack || err));
  } finally {
    if (browser) await browser.close().catch(() => null);
    stopServer();
    try { rmSync(scratch, { recursive: true, force: true }); } catch { /* */ }
  }

  const fails = checks.filter((c) => !c.ok);
  if (fails.length) {
    console.error(`\n[e2e-server] FAILED: ${fails.length} of ${checks.length} checks`);
    process.exit(1);
  }
  console.log(`\n[e2e-server] OK: ${checks.length}/${checks.length} checks passed`);
  process.exit(0);
}

run();
