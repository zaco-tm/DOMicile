import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('scripts/runtime/domi-audit.js', 'utf8');

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

  function fireClick(el) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }

  it('click on [data-feedback] sets data-domini-target and updates the hint', () => {
    document.body.innerHTML = `
      <div data-domini-rail></div>
      <main>
        <h1 data-feedback="hero-title">Hero</h1>
        <button data-feedback="cta-primary">Go</button>
      </main>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const btn = document.querySelector('[data-feedback="cta-primary"]');
    fireClick(btn);
    expect(btn.getAttribute('data-domini-target')).toBe('');
    expect(document.querySelector('[data-domini-target-id]').textContent).toBe('cta-primary');
  });

  it('submitting while a target is active uses that targetId', () => {
    document.body.innerHTML = `
      <div data-domini-rail></div>
      <button data-feedback="cta-primary">Go</button>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    fireClick(document.querySelector('[data-feedback="cta-primary"]'));
    const form = document.querySelector('[data-domini-rail-form]');
    form.elements['body'].value = 'make this more prominent';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const exported = JSON.parse(globalThis.DomiAudit.export());
    expect(exported.entries.length).toBe(1);
    expect(exported.entries[0].targetId).toBe('cta-primary');
    expect(exported.entries[0].body).toBe('make this more prominent');
    expect(document.querySelector('[data-domini-target-id]').textContent).toBe('(doc — click an element)');
  });

  it('click outside any [data-feedback] clears the active target', () => {
    document.body.innerHTML = `
      <div data-domini-rail></div>
      <main>
        <button data-feedback="cta-primary">Go</button>
        <p data-feedback="para-blurb">blurb</p>
      </main>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    fireClick(document.querySelector('[data-feedback="cta-primary"]'));
    expect(document.querySelector('[data-domini-target]')).toBeTruthy();
    fireClick(document.querySelector('main'));
    expect(document.querySelector('[data-domini-target]')).toBeNull();
    expect(document.querySelector('[data-domini-target-id]').textContent).toBe('(doc — click an element)');
  });

  it('click inside the rail does not change the active target', () => {
    document.body.innerHTML = `
      <div data-domini-rail></div>
      <button data-feedback="cta-primary">Go</button>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const btn = document.querySelector('[data-feedback="cta-primary"]');
    fireClick(btn);
    fireClick(document.querySelector('[data-domini-rail-form] textarea'));
    expect(document.querySelector('[data-domini-target]')).toBe(btn);
  });
});

describe('domi-audit.js server mode', () => {
  let src;
  beforeEach(() => {
    src = readFileSync('scripts/runtime/domi-audit.js', 'utf8');
    document.body.innerHTML = '';
    localStorage.clear();
    delete globalThis.DomiAudit;
    delete window.__DOMI_SERVER__;
  });

  // helper: eval the source with SERVER already set, so the IIFE captures the flag.
  function loadAsServerMode() {
    window.__DOMI_SERVER__ = true;
    window.location = { origin: 'http://x', pathname: '/' };
    (0, eval)(src);
  }
  function loadAsStandaloneMode() {
    window.__DOMI_SERVER__ = false;
    window.location = { origin: 'http://x', pathname: '/' };
    (0, eval)(src);
  }

  it('addComment POSTs a rail-add event in server mode', async () => {
    loadAsServerMode();
    document.body.innerHTML = `<aside data-domini-rail></aside>`;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    globalThis.fetch = fetchMock;
    DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    // Let the boot-mirror GET rehydrate settle so the POST is unambiguous.
    await new Promise((r) => setTimeout(r, 0));
    fetchMock.mockClear();
    DomiAudit.addComment({ targetId: 'btn-save', body: 'too prominent' });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://x/api/events');
    const body = JSON.parse(init.body);
    expect(body.v).toBe(2);
    expect(body.kind).toBe('rail-add');
    expect(body.src).toBe('domi-audit.js');
    expect(body.doc).toBe('x');
    expect(body.data.body).toBe('too prominent');
    expect(body.data.targetId).toBe('btn-save');
  });

  it('mount rehydrates from GET /api/events?doc=<doc>', async () => {
    loadAsServerMode();
    document.body.innerHTML = `<aside data-domini-rail></aside>`;
    const seedEvents = [
      { id: '01Z', ts: '2026-07-05T00:00:00Z', src: 'domi-audit.js', doc: 'x', kind: 'rail-add',
        target: null, data: { body: 'first', targetId: null } },
      { id: '02Z', ts: '2026-07-05T00:01:00Z', src: 'domi-audit.js', doc: 'x', kind: 'rail-add',
        target: null, data: { body: 'second', targetId: 'btn' } },
      { id: '03Z', ts: '2026-07-05T00:02:00Z', src: 'domi.js', doc: 'x', kind: 'click',
        target: { id: 'btn-save', selector: null, rect: null }, data: { value: 'x' } },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ events: seedEvents, nextSince: '03Z' }),
    });
    globalThis.fetch = fetchMock;
    DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    // Settle async rehydration
    await new Promise((r) => setTimeout(r, 10));
    const exported = JSON.parse(DomiAudit.export());
    // Only our rail-add events should be in the exported view (no click events)
    expect(exported.entries.length).toBe(2);
    expect(exported.entries[0].body).toBe('first');
    expect(exported.entries[1].body).toBe('second');
  });

  it('resolveEntry POSTs a rail-resolve event in server mode', async () => {
    loadAsServerMode();
    document.body.innerHTML = `<aside data-domini-rail></aside>`;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    globalThis.fetch = fetchMock;
    DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    fetchMock.mockClear();
    DomiAudit.resolveEntry('01ZENTRY');
    await new Promise((r) => setTimeout(r, 0));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.kind).toBe('rail-resolve');
    expect(body.data.entryId).toBe('01ZENTRY');
  });

  it('DOMiAudit WS-bridge listener renders incoming rail-add from server', async () => {
    loadAsServerMode();
    document.body.innerHTML = `<aside data-domini-rail></aside>`;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ events: [], nextSince: null }) });
    DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    await new Promise((r) => setTimeout(r, 10));
    // Simulate the shim firing a domi-event
    window.dispatchEvent(new CustomEvent('domi-event', { detail: {
      id: '77Z', ts: 't', src: 'domi-audit.js', doc: 'x', kind: 'rail-add',
      target: null, data: { body: 'remote', targetId: null }
    }}));
    // Wait for the listener to re-render
    await new Promise((r) => setTimeout(r, 0));
    const exported = JSON.parse(DomiAudit.export());
    expect(exported.entries.some((e) => e.id === '77Z')).toBe(true);
  });

  it('does NOT POST in standalone mode (regression — Phase 1 path)', () => {
    loadAsStandaloneMode();
    document.body.innerHTML = `<aside data-domini-rail></aside>`;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    DomiAudit.addComment({ targetId: null, body: 'hi' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});