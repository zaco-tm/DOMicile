import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SHIM = readFileSync(resolve(here, '../scripts/domi-server.js'), 'utf8');

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

  it('is under 1 KB', () => {
    expect(SHIM.length).toBeLessThanOrEqual(1024);
  });
});