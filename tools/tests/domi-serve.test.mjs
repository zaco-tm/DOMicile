// @vitest-environment node
//
// We don't need a DOM, and the daemonised domi-server holds the parent
// script's stdout pipe open longer than vitest 2.x's default 5s test
// timeout. The lifecycle tests below opt into a 15s timeout for that reason.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs';

const execFileP = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = resolve(REPO_ROOT, 'tools', 'domi-serve.sh');

const RELEASE_BIN = resolve(REPO_ROOT, 'target', 'release', 'domi-server');
const DEBUG_BIN = resolve(REPO_ROOT, 'target', 'debug', 'domi-server');
const HAS_BINARY = existsSync(RELEASE_BIN) || existsSync(DEBUG_BIN);

const DOMI_DIR = resolve(REPO_ROOT, '.domi');
const URL_FILE = join(DOMI_DIR, 'server.url');
const PID_FILE = join(DOMI_DIR, 'server.pid');

async function run(subcommand) {
  try {
    const { stdout, stderr } = await execFileP(SCRIPT, [subcommand]);
    return { code: 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return {
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: (err.stdout ?? '').toString().trim(),
      stderr: (err.stderr ?? '').toString().trim(),
    };
  }
}

describe('domi-serve.sh', () => {
  beforeAll(() => {
    mkdirSync(DOMI_DIR, { recursive: true });
    mkdirSync(join(DOMI_DIR, 'output'), { recursive: true });
    mkdirSync(join(DOMI_DIR, 'state'), { recursive: true });
  });

  afterEach(async () => {
    // Best-effort cleanup so a failed test doesn't bleed into the next.
    if (existsSync(PID_FILE)) {
      await run('stop');
    }
    rmSync(URL_FILE, { force: true });
    rmSync(PID_FILE, { force: true });
  });

  afterAll(() => {
    // Final safety net.
    rmSync(URL_FILE, { force: true });
    rmSync(PID_FILE, { force: true });
  });

  it('status reports not-running before any start', async () => {
    rmSync(PID_FILE, { force: true });
    rmSync(URL_FILE, { force: true });
    const r = await run('status');
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('not running');
  });

  it('unknown subcommand exits 64', async () => {
    const r = await run('frobnicate');
    expect(r.code).toBe(64);
  });

  it('start fails cleanly if the binary is missing', async () => {
    // Move the binary aside, run, restore. Skip if no binary exists at all.
    if (!HAS_BINARY) {
      // Nothing to move; start should still report "binary not found".
      const r = await run('start');
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/binary not found/);
      return;
    }
    // Move BOTH binaries aside so the fallback can't pick one up.
    const bakRel = `${RELEASE_BIN}.bak-test`;
    const bakDbg = `${DEBUG_BIN}.bak-test`;
    const { renameSync, existsSync: exists } = await import('node:fs');
    try {
      if (exists(RELEASE_BIN)) renameSync(RELEASE_BIN, bakRel);
      if (exists(DEBUG_BIN)) renameSync(DEBUG_BIN, bakDbg);
      const r = await run('start');
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/binary not found/);
      expect(r.stderr).toMatch(/cargo build --release -p domi-server/);
    } finally {
      if (exists(bakRel)) renameSync(bakRel, RELEASE_BIN);
      if (exists(bakDbg)) renameSync(bakDbg, DEBUG_BIN);
    }
  });

  it('full lifecycle: start → status → curl → stop', async () => {
    if (!HAS_BINARY) {
      // Without a binary we can still exercise start's "missing" path,
      // already covered above. Skip the live lifecycle in CI without a binary.
      return;
    }
    const start = await run('start');
    expect(start.code).toBe(0);
    expect(start.stdout).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(existsSync(URL_FILE)).toBe(true);
    expect(existsSync(PID_FILE)).toBe(true);

    const status = await run('status');
    expect(status.code).toBe(0);
    expect(status.stdout).toMatch(/^running at http:\/\/127\.0\.0\.1:\d+\/$/);

    const url = readFileSync(URL_FILE, 'utf8').trim();
    // Curl the URL. Don't fail the test on non-200 (empty .domi/output may 404);
    // we just want to prove the server responds.
    const { execFile: ef } = await import('node:child_process');
    const code = await new Promise((resolveP) => {
      ef('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', url], (err, out) => {
        resolveP(out ? parseInt(out, 10) : 0);
      });
    });
    expect([200, 404]).toContain(code);

    const stop = await run('stop');
    expect(stop.code).toBe(0);
    expect(stop.stdout).toBe('stopped');
    expect(existsSync(PID_FILE)).toBe(false);
    expect(existsSync(URL_FILE)).toBe(false);
  }, 15000);

  it('second start while running exits 2', async () => {
    if (!HAS_BINARY) return;
    const first = await run('start');
    expect(first.code).toBe(0);
    const second = await run('start');
    expect(second.code).toBe(2);
    expect(second.stderr).toMatch(/already running/);
  }, 15000);
});