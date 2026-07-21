import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('scripts/runtime/domi-audit.js', 'utf8');

function loadInternals() {
  globalThis.eval(SRC);
  return globalThis.DomiAudit._internals;
}

describe('computeIterations', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    delete globalThis.DomiAudit;
  });

  function ev(kind, ts, data = {}) {
    return { kind, ts, src: 'domi-audit.js', doc: 'x', id: 'E_' + ts, target: null, data };
  }
  function railAdd(ts, body) {
    return ev('rail-add', ts, { body, targetId: null });
  }
  function startIter(ts) {
    return ev('agent-iterating', ts, { state: 'start', source: 'watcher' });
  }
  function endIter(ts) {
    return ev('agent-iterating', ts, { state: 'end', source: 'watcher' });
  }

  it('returns empty array for empty input', () => {
    const { computeIterations } = loadInternals();
    expect(computeIterations([])).toEqual([]);
  });

  it('puts rail-adds before any start into "initial" group', () => {
    const { computeIterations } = loadInternals();
    const out = computeIterations([
      railAdd('2026-07-21T10:00:00Z', 'first'),
      railAdd('2026-07-21T10:01:00Z', 'second'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].isInitial).toBe(true);
    expect(out[0].entryIds).toEqual(['E_2026-07-21T10:00:00Z', 'E_2026-07-21T10:01:00Z']);
  });

  it('puts rail-adds after start into the open iteration (sticky rule)', () => {
    const { computeIterations } = loadInternals();
    const out = computeIterations([
      startIter('2026-07-21T10:00:00Z'),
      railAdd('2026-07-21T10:00:30Z', 'mid-iter'),
      endIter('2026-07-21T10:01:00Z'),
      railAdd('2026-07-21T10:02:00Z', 'after-end-still-in-iter-1'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
    expect(out[0].endTs).toBe('2026-07-21T10:01:00Z');
    expect(out[0].entryIds).toEqual([
      'E_2026-07-21T10:00:30Z',
      'E_2026-07-21T10:02:00Z',
    ]);
  });

  it('opens a new iteration when a new start arrives', () => {
    const { computeIterations } = loadInternals();
    const out = computeIterations([
      startIter('2026-07-21T10:00:00Z'),
      endIter('2026-07-21T10:01:00Z'),
      startIter('2026-07-21T10:02:00Z'),
      railAdd('2026-07-21T10:02:30Z', 'in-iter-2'),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe(1);
    expect(out[0].entryIds).toEqual([]);
    expect(out[1].id).toBe(2);
    expect(out[1].entryIds).toEqual(['E_2026-07-21T10:02:30Z']);
  });

  it('auto-closes a prior open iteration when a new start arrives', () => {
    const { computeIterations } = loadInternals();
    const out = computeIterations([
      startIter('2026-07-21T10:00:00Z'),
      // no end before the next start
      startIter('2026-07-21T10:02:00Z'),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].endTs).toBe('2026-07-21T10:02:00Z');
    expect(out[1].endTs).toBe(null);
  });

  it('keeps an iteration open when no end follows', () => {
    const { computeIterations } = loadInternals();
    const out = computeIterations([
      startIter('2026-07-21T10:00:00Z'),
      railAdd('2026-07-21T10:00:30Z', 'still open'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].endTs).toBe(null);
    expect(out[0].entryIds).toEqual(['E_2026-07-21T10:00:30Z']);
  });

  it('ignores end without a preceding start', () => {
    const { computeIterations } = loadInternals();
    const out = computeIterations([
      endIter('2026-07-21T10:00:00Z'),
      railAdd('2026-07-21T10:01:00Z', 'orphan'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].isInitial).toBe(true);
    expect(out[0].entryIds).toEqual(['E_2026-07-21T10:01:00Z']);
  });

  it('ignores agent-iterating with state other than start/end', () => {
    const { computeIterations } = loadInternals();
    const out = computeIterations([
      ev('agent-iterating', '2026-07-21T10:00:00Z', { state: 'weird', source: 'watcher' }),
      railAdd('2026-07-21T10:00:30Z', 'still initial'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].isInitial).toBe(true);
  });

  it('sorts events by ts before computing (defensive)', () => {
    const { computeIterations } = loadInternals();
    // intentionally out of order
    const out = computeIterations([
      railAdd('2026-07-21T10:02:00Z', 'late'),
      startIter('2026-07-21T10:00:00Z'),
      endIter('2026-07-21T10:01:00Z'),
      railAdd('2026-07-21T10:00:30Z', 'early'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].entryIds).toEqual([
      'E_2026-07-21T10:00:30Z',
      'E_2026-07-21T10:02:00Z',
    ]);
  });
});
