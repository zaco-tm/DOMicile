import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('scripts/domi-audit.js', 'utf8');

describe('domi-audit.js runtime', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    delete globalThis.DomiAudit;
    // Eval the runtime fresh in this test world. vitest's vm context would be cleaner;
    // for a small runtime, dynamic import from the file works.
    globalThis.eval(SRC);
  });

  it('exposes DomiAudit with mount, addComment, export', () => {
    expect(typeof globalThis.DomiAudit.mount).toBe('function');
    expect(typeof globalThis.DomiAudit.addComment).toBe('function');
    expect(typeof globalThis.DomiAudit.export).toBe('function');
  });

  it('mount renders a feedback rail element', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const rail = document.querySelector('[data-domini-rail]');
    expect(rail.querySelector('[data-domini-rail-form]')).toBeTruthy();
  });

  it('addComment appends an entry to the in-memory thread and localStorage', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    globalThis.DomiAudit.addComment({ targetId: 'btn-save', body: 'too prominent' });
    const exported = JSON.parse(globalThis.DomiAudit.export());
    expect(exported.entries.length).toBe(1);
    expect(exported.entries[0].targetId).toBe('btn-save');
    expect(exported.entries[0].body).toBe('too prominent');
    expect(exported.entries[0].resolved).toBe(false);
  });

  it('hydrates entries from localStorage on mount', () => {
    const seed = {
      version: 1, name: 'x',
      entries: [{ id: 'a', targetId: 't', author: 'user', timestamp: '2026-07-05T00:00:00Z', body: 'pre', resolved: false }]
    };
    localStorage.setItem('dominice:x', JSON.stringify(seed));
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const exported = JSON.parse(globalThis.DomiAudit.export());
    expect(exported.entries.length).toBe(1);
    expect(exported.entries[0].body).toBe('pre');
  });
});