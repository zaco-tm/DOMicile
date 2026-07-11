#!/usr/bin/env node
// skill-smoke-test — drive the local DOMicile skill loop end-to-end in a real
// browser. Asserts that:
//   1. The skill-smoke cloning + serving pipeline produces a working doc
//      that renders in a real browser (audit rail mounted, status chip
//      visible, data-feedback hooks present).
//   2. A user comment submitted via the rail is persisted to localStorage.
//   3. The comment survives a page reload.
//
// This is the "playability" gate called out by the Phase 4 skill-loop
// handoff (docs/superpowers/handoffs/2026-07-06-phase4-skill-loop-handoff.md,
// item 3): a static HTML self-check proves the artifact is well-formed,
// but only a real browser proves the audit rail actually binds and
// persists. CI-grade regressions are caught here, not at review time.
//
// Usage:
//   node tools/skill-smoke-test.mjs                 # default smoke doc, 8123
//   PORT=8200 node tools/skill-smoke-test.mjs      # custom port

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefox } from 'playwright';

// Playwright's bundled Firefox (Gecko). Install once with:
//   npx playwright install firefox

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const PORT = Number(process.env.PORT || '8123');
const HOST = process.env.HOST || '127.0.0.1';
const docName = process.env.DOC_NAME || 'smoke';
const url = `http://${HOST}:${PORT}/.domi/output/${docName}.html`;
const commentBody = `e2e: ${new Date().toISOString()}`;

let server;
function startServer() {
  return new Promise((res, rej) => {
    server = spawn(
      process.execPath,
      [join(here, 'skill-smoke.mjs'), '--doc', docName, '--port', String(PORT), '--host', HOST],
      { stdio: ['ignore', 'pipe', 'pipe'], cwd: projectRoot, detached: false }
    );
    let ok = false;
    server.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      process.stdout.write(`[smoke-stdout] ${s}`);
      if (!ok && /open:/.test(s)) {
        ok = true;
        res();
      }
    });
    server.stderr.on('data', (chunk) => process.stderr.write(`[smoke-stderr] ${chunk}`));
    server.on('exit', (code) => {
      if (!ok) rej(new Error(`skill-smoke exited ${code} before serving`));
    });
    // Hard timeout if the server never prints its "open:" line.
    setTimeout(() => {
      if (!ok) rej(new Error('skill-smoke did not print "open:" within 5s'));
    }, 5000);
  });
}

function stopServer() {
  if (!server || server.killed) return;
  try {
    server.kill('SIGTERM');
  } catch { /* best-effort */ }
  setTimeout(() => {
    try { server && !server.killed && server.kill('SIGKILL'); } catch { /* */ }
  }, 500);
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[e2e] ${tag}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function run() {
  // Clean any leftover .domi/output/<docName>.html from a previous run so the
  // clone-then-write path is exercised fresh each time.
  const stale = join(projectRoot, '.domi/output', `${docName}.html`);
  try { rmSync(stale, { force: true }); } catch { /* */ }

  await startServer();
  let browser;
  try {
    browser = await firefox.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    page.on('pageerror', (err) => {
      check('no page errors during load', false, String(err));
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[console-error] ${msg.text()}`);
    });

    // 1. Render sanity: status chip, audit rail, feedback hooks.
    const resp = await page.goto(url, { waitUntil: 'load' });
    check('GET working doc 200', resp && resp.status() === 200, `status=${resp && resp.status()}`);

    await page.waitForSelector('[data-domini-rail] form[data-domini-rail-form]', { timeout: 3000 });
    const chipText = await page.locator('[data-domini-status-chip]').first().textContent();
    check(
      'status chip rendered',
      typeof chipText === 'string' && chipText.trim().length > 0,
      `chip="${chipText && chipText.trim()}"`
    );

    const feedbackCount = await page.locator('[data-feedback]').count();
    check('data-feedback hooks present', feedbackCount >= 1, `count=${feedbackCount}`);

    // 2. Comment submission persists to localStorage.
    await page.fill('form[data-domini-rail-form] textarea[name="body"]', commentBody);
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/.domi/output/' + docName + '.html') || true).catch(() => null),
      page.click('form[data-domini-rail-form] button[type="submit"]'),
    ]);
    // Give localStorage write + re-render a beat.
    await page.waitForFunction(
      () => {
        const raw = localStorage.getItem('domicile:smoke');
        if (!raw) return false;
        try { return JSON.parse(raw).entries.length >= 1; } catch { return false; }
      },
      { timeout: 2000 }
    );

    const stored = await page.evaluate(() => localStorage.getItem('domicile:smoke'));
    let parsed;
    try { parsed = JSON.parse(stored); } catch { parsed = null; }
    check(
      'localStorage carries the comment',
      !!(parsed && parsed.entries && parsed.entries.some((e) => e.body === commentBody)),
      stored ? `entries=${parsed.entries.length}` : 'no entry in localStorage'
    );

    // 3. Comment survives reload (proves the rail re-hydrates from localStorage).
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-domini-rail-list] li', { timeout: 3000 });
    const listText = await page.locator('[data-domini-rail-list]').first().textContent();
    check(
      'comment survives reload',
      typeof listText === 'string' && listText.includes(commentBody),
      listText ? `rail length=${listText.length}` : 'rail empty'
    );

    // 4. Click-to-target wiring: clicking a [data-feedback] element scopes the
    //    next comment to that element. Asserts the persisted targetId is not null.
    const docFeedbackId = await page.locator('[data-feedback]').first().getAttribute('data-feedback');
    if (docFeedbackId) {
      await page.locator(`[data-feedback="${docFeedbackId}"]`).first().click();
      const hintAfterClick = await page.locator('[data-domini-target-id]').textContent();
      check(
        'click sets the targeting hint',
        hintAfterClick === docFeedbackId,
        `hint="${hintAfterClick}"`
      );
      const targetedBody = `targeted: ${commentBody}`;
      await page.fill('form[data-domini-rail-form] textarea[name="body"]', targetedBody);
      await page.click('form[data-domini-rail-form] button[type="submit"]');
      await page.waitForFunction(
        (body) => {
          const raw = localStorage.getItem('domicile:smoke');
          if (!raw) return false;
          try {
            const parsed = JSON.parse(raw);
            return parsed.entries.some((e) => e.body === body);
          } catch { return false; }
        },
        targetedBody,
        { timeout: 2000 }
      );
      const stored2 = await page.evaluate(() => localStorage.getItem('domicile:smoke'));
      const parsed2 = stored2 ? JSON.parse(stored2) : null;
      const targetEntry = parsed2 && parsed2.entries.find((e) => e.body === targetedBody);
      check(
        'clicked-element comment persists with matching targetId',
        !!(targetEntry && targetEntry.targetId === docFeedbackId),
        targetEntry ? `targetId=${targetEntry.targetId}` : 'no entry'
      );
    } else {
      check('doc has at least one [data-feedback] element for click test', false, 'archetype missing hooks');
    }
  } catch (err) {
    check('uncaught test error', false, String(err && err.stack || err));
  } finally {
    if (browser) await browser.close().catch(() => null);
    stopServer();
  }

  const fails = checks.filter((c) => !c.ok);
  if (fails.length) {
    console.error(`\n[e2e] FAILED: ${fails.length} of ${checks.length} checks`);
    process.exit(1);
  }
  console.log(`\n[e2e] OK: ${checks.length}/${checks.length} checks passed`);
  process.exit(0);
}

run();
