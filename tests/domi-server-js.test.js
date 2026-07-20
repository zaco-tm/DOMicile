import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SHIM = readFileSync(resolve(here, '../scripts/runtime/domi-server.js'), 'utf8');

describe('domi-server.js shim', () => {
  it('sets window.__DOMI_SERVER__ to true', () => {
    expect(SHIM).toMatch(/window\.__DOMI_SERVER__\s*=\s*true/);
  });

  it('constructs the WS URL from location.host (same-origin)', () => {
    expect(SHIM).toContain("location.protocol === 'https:'");
    expect(SHIM).toContain("'wss://'");
    expect(SHIM).toContain("'ws://'");
    expect(SHIM).toMatch(/location\.host\s*\+\s*'\/ws\/events'/);
    expect(SHIM).not.toContain('127.0.0.1');
    expect(SHIM).not.toContain('localhost:');
  });

  it('is under 2 KB', () => {
    // Was 1 KB before the auto-reload feature added subscribe + reload handlers;
    // bumped to 2 KB to reflect that. The shim is still tiny for a runtime
    // embedded by build.rs and loaded by every working doc.
    expect(SHIM.length).toBeLessThanOrEqual(2048);
  });
});