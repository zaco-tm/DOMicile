import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(resolve(here, '../docs/schemas/event.schema.json'), 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(SCHEMA);

const MINIMAL_EVENT = {
  v: 2,
  id: '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ0',
  ts: '2026-07-05T18:21:00.000Z',
  src: 'domi.js',
  doc: 'onboarding-v2',
  kind: 'click',
  target: { id: 'btn-save', selector: 'main > .domi-card:nth-of-type(1)', rect: { x: 120, y: 480, w: 200, h: 32 } },
  data: { value: 'Save' },
};

describe('event.schema.json', () => {
  it('accepts a minimal valid click event', () => {
    expect(validate(MINIMAL_EVENT)).toBe(true);
  });

  it('accepts each known kind with its data shape', () => {
    const ids = [
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ1',
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ2',
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ3',
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ4',
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ5',
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ6',
    ];
    const entryId = '01H8XZQ5K2J9Z9Q4X5Y6Z7XXZ9';
    let i = 0;
    for (const kind of ['click', 'input', 'submit', 'rail-add', 'rail-resolve', 'custom']) {
      const e = structuredClone(MINIMAL_EVENT);
      e.kind = kind;
      e.id = ids[i++];
      if (kind === 'input') e.data = { name: 'projectName', value: 'Acme Co' };
      else if (kind === 'submit') e.data = { formId: 'signup', fields: { email: 'a@b.co' } };
      else if (kind === 'rail-add') e.data = { body: 'too prominent', targetId: 'btn-save' };
      else if (kind === 'rail-resolve') e.data = { entryId };
      else if (kind === 'custom') e.data = { payload: { whatever: 'goes' } };
      expect(validate(e)).toBe(true);
    }
  });

  it('rejects events with v != 2', () => {
    const bad = structuredClone(MINIMAL_EVENT);
    bad.v = 1;
    expect(validate(bad)).toBe(false);
  });

  it('rejects events missing required fields', () => {
    const { ts, ...missing } = MINIMAL_EVENT;
    expect(validate(missing)).toBe(false);
  });

  it('rejects unknown src values', () => {
    const bad = structuredClone(MINIMAL_EVENT);
    bad.src = 'made-up-runtime';
    expect(validate(bad)).toBe(false);
  });

  it('rejects unknown kind values', () => {
    const bad = structuredClone(MINIMAL_EVENT);
    bad.kind = 'hover';
    expect(validate(bad)).toBe(false);
  });

  it('rejects id that is not a ULID', () => {
    const bad = structuredClone(MINIMAL_EVENT);
    bad.id = 'not-a-ulid';
    expect(validate(bad)).toBe(false);
  });

  it('rejects additional top-level properties', () => {
    const bad = { ...MINIMAL_EVENT, extraField: 'not allowed' };
    expect(validate(bad)).toBe(false);
  });

  it('rejects rail-add with empty body', () => {
    const bad = structuredClone(MINIMAL_EVENT);
    bad.kind = 'rail-add';
    bad.data = { body: '', targetId: 'btn-save' };
    expect(validate(bad)).toBe(false);
  });

  it('accepts an event with id: null (server stamps before append — Phase 2b rule)', () => {
    const ev = structuredClone(MINIMAL_EVENT);
    ev.id = null;
    expect(validate(ev)).toBe(true);
  });
});

describe('WIRE-PROTOCOL.md (drift guard against the spec markdown)', () => {
  const wireDoc = readFileSync(resolve(here, '../docs/WIRE-PROTOCOL.md'), 'utf8');

  it('declares protocol version 2 in prose and in the route table', () => {
    expect(wireDoc).toContain('Protocol version: **2**');
    expect(wireDoc).toMatch(/protocol:\s*2\b/);
  });

  it('names the six kinds consistently', () => {
    for (const kind of ['click', 'input', 'submit', 'rail-add', 'rail-resolve', 'custom']) {
      expect(wireDoc).toContain(kind);
    }
  });
});
// ---------------------------------------------------------------------------
// 2d Task 8 — gated end-to-end smoke tests against the real `domi-server`
// + `domi` binaries.
//
// These tests boot `domi-server` on an ephemeral port, push an event via
// `domi push --json`, GET it back via `domi replay`, and validate the
// round-tripped payload against `event.schema.json`. A second test asserts
// that `domi push --type bogus` exits 2 with a server-side 400.
//
// Gated behind `DOMI_TEST_LIVE=1` so default `npm test` stays hermetic
// (the binaries are not required to be on PATH for the schema-validation
// tests in the upper `describe` blocks). Run with:
//
//   DOMI_TEST_LIVE=1 npm test
//
// Default-skip pattern mirrors the Rust-side gated convention
// (`#[ignore]` on the Rust integration tests in
// `crates/domi-server/tests/`). See Task 3 review notes for the
// cross-language symmetry rationale.
// ---------------------------------------------------------------------------
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

// Capture the gated-runner state at module load. `process.env.DOMI_TEST_LIVE`
// is read exactly once so the skip decision is stable even if a sibling
// test file mutates the env mid-run.
const LIVE = !!process.env.DOMI_TEST_LIVE;

/**
 * Resolve the `domi-server` / `domi` binary path. Prefers the
 * `DOMI_SERVER_BIN` / `DOMI_BIN` env override (CI / sandboxed
 * environments), falls back to `$HOME/.local/bin/{name}` (the
 * `scripts/install.sh` default), and finally to PATH lookup
 * (return bare name; `spawn` will resolve via PATH).
 */
function resolveBin(name) {
  const envKey = name === 'domi-server' ? 'DOMI_SERVER_BIN' : 'DOMI_BIN';
  if (process.env[envKey]) return process.env[envKey];
  const home = process.env.HOME || '';
  if (home) {
    const candidate = `${home}/.local/bin/${name}`;
    if (existsSync(candidate)) return candidate;
  }
  return name;
}

/**
 * Pick a free ephemeral port via `net.createServer().listen(0, ...)`,
 * then close the listener and return the port. There is a TOCTOU window
 * between close and `domi-server` binding it; for a single-test
 * sequential run this is acceptable (matches the convenience pattern
 * in `scripts/verify.sh`).
 */
function pickFreePort() {
  return new Promise((resolveP, rejectP) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close((err) => {
        if (err) rejectP(err);
        else resolveP(addr.port);
      });
    });
    srv.on('error', rejectP);
  });
}

/**
 * Poll `GET /healthz` until the server returns a 2xx, or reject after
 * `timeoutMs`. Mirrors `wait_for_healthz` in
 * `crates/domi-server/tests/common/mod.rs`.
 */
async function waitForHealthz(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = 'no attempt yet';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (r.ok) return;
      lastErr = `status ${r.status}`;
    } catch (e) {
      lastErr = e && e.message ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `server did not become healthy within ${timeoutMs}ms (last err: ${lastErr})`,
  );
}

/**
 * Spawn a child process and return `{ stdout, stderr, code }`. Resolves
 * on natural exit (we do not reject on non-zero status — the tests
 * assert exit codes explicitly).
 */
function runChild(bin, args, opts = {}) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', rejectP);
    child.on('close', (code) => resolveP({ stdout, stderr, code: code ?? -1 }));
  });
}

describe.skipIf(!LIVE)('tools push round-trip via CLI matches schema (2d Task 8, gated)', () => {
  let tmpRoot;
  let tmpState;
  let serverProc = null;
  let port = 0;
  const serverBin = resolveBin('domi-server');
  const cliBin = resolveBin('domi');

  beforeAll(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'domi-wp-root-'));
    tmpState = mkdtempSync(join(tmpdir(), 'domi-wp-state-'));
    port = await pickFreePort();
    serverProc = spawn(
      serverBin,
      [
        '--port',
        String(port),
        '--host',
        '127.0.0.1',
        '--root',
        tmpRoot,
        '--state',
        tmpState,
        '--log-level',
        'warn',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], detached: false },
    );
    // Drain server stdout/stderr so the vitest reporter isn't
    // interleaved. The server's stderr is available on `serverProc`
    // if a test fails and needs to surface it.
    serverProc.stdout.on('data', () => {});
    serverProc.stderr.on('data', () => {});
    serverProc.on('error', () => {
      /* surfaced on assertion failure */
    });
    await waitForHealthz(port, 5000);
  }, 10000);

  afterAll(async () => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill('SIGTERM');
      // Give it a moment to exit gracefully, then SIGKILL.
      await new Promise((r) => setTimeout(r, 100));
      try {
        serverProc.kill('SIGKILL');
      } catch {
        /* may already be gone */
      }
    }
    for (const d of [tmpRoot, tmpState]) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  });

  it('tools push round-trip via CLI matches schema', async () => {
    // Unique ULID + doc so this test is independent of others sharing
    // the same server (it doesn't, but defensive against future reuse).
    const id =
      '01H8XZQ5K2J9Z9Q4X5Y6Z7XY' +
      String(Date.now() % 100)
        .padStart(2, '0');
    const doc = `wp-task8-${Date.now()}`;
    // Build a minimal valid event per `event.schema.json`. `ts` is
    // omitted so the server stamps it (server-side rule, see
    // Phase 2b).
    const event = {
      v: 2,
      id,
      src: 'domi.js',
      doc,
      kind: 'click',
      target: {
        id: 'btn-save',
        selector: 'main > .domi-card',
        rect: { x: 120, y: 480, w: 200, h: 32 },
      },
      data: { value: 'Save' },
    };

    // 1. Push via the real `domi` binary. The server stamps `ts`
    //    (we omitted it), so the wire body is accepted.
    const push = await runChild(cliBin, [
      '--server',
      `http://127.0.0.1:${port}`,
      'push',
      '--type',
      'click',
      '--json',
      JSON.stringify(event),
    ]);
    expect(push.code).toBe(0);
    expect(push.stderr).toBe('');

    // 2. Replay via the real `domi` binary, filtered by doc. The
    //    wire response shape is
    //    `{ events: [Event, ...], nextSince: ... }`
    //    (see `docs/WIRE-PROTOCOL.md` and `tools/replay.rs`).
    const replay = await runChild(cliBin, [
      '--server',
      `http://127.0.0.1:${port}`,
      'replay',
      '--doc',
      doc,
      '--limit',
      '5',
    ]);
    expect(replay.code).toBe(0);
    expect(replay.stderr).toBe('');

    let body;
    try {
      body = JSON.parse(replay.stdout);
    } catch (e) {
      throw new Error(
        `replay stdout was not JSON: ${e.message}\nstdout=${replay.stdout}`,
      );
    }
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThanOrEqual(1);

    // 3. Find the event we just pushed (the only one for this doc)
    //    and assert the server-stamped fields.
    const ours = body.events.find((e) => e.id === id);
    expect(ours).toBeDefined();

    // The server stamps `ts`; assert it exists and looks ISO-8601-ish.
    expect(typeof ours.ts).toBe('string');
    expect(ours.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(ours.doc).toBe(doc);
    expect(ours.kind).toBe('click');
    expect(ours.src).toBe('domi.js');

    // 4. The headline assertion: round-tripped event validates
    //    against `event.schema.json` via the same `validate()` Ajv
    //    instance the upper `describe` blocks use. This is the
    //    cross-language drift guard for the wire format.
    const ok = validate(ours);
    if (!ok) {
      throw new Error(
        'round-tripped event failed schema validation: ' +
          JSON.stringify(validate.errors, null, 2) +
          '\nevent=' +
          JSON.stringify(ours, null, 2),
      );
    }
    expect(ok).toBe(true);
  }, 15000);

  it('tools push with bogus type is rejected', async () => {
    // `domi push --type bogus` synthesizes a body with `kind: "bogus"`.
    // The server validates against `event.schema.json` and rejects
    // with 400 (see `handlers::post_event` in the Rust server). The
    // CLI maps any non-2xx to exit 2 (see `tools/push.rs` exit-code
    // table).
    const push = await runChild(cliBin, [
      '--server',
      `http://127.0.0.1:${port}`,
      'push',
      '--type',
      'bogus',
      '--doc',
      'wp-task8-bogus',
      '--target',
      'btn-x',
    ]);

    expect(push.code).toBe(2);
    // `push::run` logs `server returned 400` to stderr on a 4xx
    // response (see `crates/domi-server/src/tools/push.rs`).
    expect(push.stderr).toMatch(/server returned 400/);
  }, 10000);
});
