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
    localStorage.setItem('domicile:x', JSON.stringify(seed));
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

  it('removeEntry appends to _state.removed and re-renders in standalone mode', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    globalThis.DomiAudit.addComment({ targetId: null, body: 'first' });
    globalThis.DomiAudit.addComment({ targetId: null, body: 'second' });
    const before = JSON.parse(globalThis.DomiAudit.export());
    const secondId = before.entries[1].id;
    globalThis.DomiAudit.removeEntry(secondId);
    const after = JSON.parse(globalThis.DomiAudit.export());
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0].body).toBe('first');
    expect(after.removed).toContain(secondId);
  });

  it('removeEntry is idempotent (no error on second call)', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    globalThis.DomiAudit.addComment({ targetId: null, body: 'first' });
    const before = JSON.parse(globalThis.DomiAudit.export());
    const firstId = before.entries[0].id;
    globalThis.DomiAudit.removeEntry(firstId);
    globalThis.DomiAudit.removeEntry(firstId); // should not throw
    const after = JSON.parse(globalThis.DomiAudit.export());
    expect(after.entries).toHaveLength(0);
    expect(after.removed).toEqual([firstId]);
  });

  it('hydrates removed[] from localStorage on mount', () => {
    const seed = {
      version: 1, name: 'x',
      entries: [
        { id: 'a', targetId: null, author: 'user', timestamp: '2026-07-05T00:00:00Z', body: 'kept', resolved: false },
        { id: 'b', targetId: null, author: 'user', timestamp: '2026-07-05T00:00:01Z', body: 'gone', resolved: false },
      ],
      removed: ['b'],
    };
    localStorage.setItem('domicile:x', JSON.stringify(seed));
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const exported = JSON.parse(globalThis.DomiAudit.export());
    expect(exported.entries).toHaveLength(1);
    expect(exported.entries[0].body).toBe('kept');
    expect(exported.removed).toEqual(['b']);
  });

  it('removeEntry is a no-op for an unknown entryId', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    globalThis.DomiAudit.addComment({ targetId: null, body: 'first' });
    expect(() => globalThis.DomiAudit.removeEntry('does-not-exist')).not.toThrow();
    const after = JSON.parse(globalThis.DomiAudit.export());
    expect(after.entries).toHaveLength(1);
    expect(after.removed ?? []).toEqual([]);
  });

  it('render groups entries by iteration (initial group last)', () => {
    // seed: one entry before any iteration + one entry in iteration 1
    const seed = {
      version: 1, name: 'x',
      entries: [
        { id: 'PRE', targetId: null, author: 'user', timestamp: '2026-07-05T10:00:00Z', body: 'before iter', resolved: false },
        { id: 'IN1', targetId: null, author: 'user', timestamp: '2026-07-05T10:00:30Z', body: 'in iter 1', resolved: false },
      ],
      removed: [],
    };
    localStorage.setItem('domicile:x', JSON.stringify(seed));
    // Also need agent-iterating events in the localStorage mirror so
    // computeIterations has the iteration signal. The audit runtime currently
    // doesn't store agent-iterating events in standalone mode — for now, the
    // runtime derives iterations from the events it has in memory. Since
    // standalone mode has no agent-iterating events, IN1 ends up in the
    // "initial" group alongside PRE. This is a known limitation; covered
    // by the server-mode test below.
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const groups = document.querySelectorAll('[data-iter]');
    expect(groups.length).toBe(1);
    expect(groups[0].getAttribute('data-iter')).toBe('initial');
  });

  it('render emits short ID chips with click-to-copy and remove buttons', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    globalThis.DomiAudit.addComment({ targetId: 'btn-save', body: 'too prominent' });
    const entry = document.querySelector('[data-entry-id]');
    expect(entry).toBeTruthy();
    const idChip = entry.querySelector('.entry-id');
    expect(idChip).toBeTruthy();
    expect(idChip.textContent).toMatch(/^#[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(idChip.getAttribute('data-copy')).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    const removeBtn = entry.querySelector('.entry-remove');
    expect(removeBtn).toBeTruthy();
    expect(removeBtn.getAttribute('data-remove-id')).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('clicking the remove button calls removeEntry', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    globalThis.DomiAudit.addComment({ targetId: null, body: 'first' });
    const before = JSON.parse(globalThis.DomiAudit.export());
    const id = before.entries[0].id;
    const removeBtn = document.querySelector('.entry-remove');
    fireClick(removeBtn);
    const after = JSON.parse(globalThis.DomiAudit.export());
    expect(after.entries).toHaveLength(0);
    expect(after.removed).toContain(id);
  });

  it('render does not include removed entries', () => {
    const seed = {
      version: 1, name: 'x',
      entries: [
        { id: 'KEEP', targetId: null, author: 'user', timestamp: '2026-07-05T10:00:00Z', body: 'kept', resolved: false },
        { id: 'GONE', targetId: null, author: 'user', timestamp: '2026-07-05T10:00:01Z', body: 'gone', resolved: false },
      ],
      removed: ['GONE'],
    };
    localStorage.setItem('domicile:x', JSON.stringify(seed));
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const visible = document.querySelectorAll('[data-entry-id]');
    expect(visible.length).toBe(1);
    expect(visible[0].getAttribute('data-entry-id')).toBe('KEEP');
  });

  it('render parses @<id> cross-references into ref chips', () => {
    const seed = {
      version: 1, name: 'x',
      entries: [
        { id: 'AAAAAAAAAAAA00000000000000', targetId: null, author: 'user', timestamp: '2026-07-05T10:00:00Z', body: 'first', resolved: false },
        { id: 'BBBBBBBBBBBB00000000000000', targetId: null, author: 'user', timestamp: '2026-07-05T10:00:01Z', body: 'see @AAAAAA', resolved: false },
      ],
      removed: [],
    };
    localStorage.setItem('domicile:x', JSON.stringify(seed));
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const ref = document.querySelector('.entry-ref');
    expect(ref).toBeTruthy();
    expect(ref.getAttribute('data-ref-id')).toBe('AAAAAAAAAAAA00000000000000');
    expect(ref.textContent).toBe('#AAAAAA');
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

  it('removeEntry POSTs a rail-remove event in server mode', async () => {
    loadAsServerMode();
    document.body.innerHTML = `<aside data-domini-rail></aside>`;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    globalThis.fetch = fetchMock;
    DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    await new Promise((r) => setTimeout(r, 10));
    fetchMock.mockClear();
    DomiAudit.removeEntry('01ZENTRY');
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://x/api/events');
    const body = JSON.parse(init.body);
    expect(body.v).toBe(2);
    expect(body.kind).toBe('rail-remove');
    expect(body.src).toBe('domi-audit.js');
    expect(body.doc).toBe('x');
    expect(body.data.entryId).toBe('01ZENTRY');
  });

  it('WS-bridge listener applies a rail-remove from the server', async () => {
    loadAsServerMode();
    document.body.innerHTML = `<aside data-domini-rail></aside>`;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ events: [
      { id: '01AB', ts: '2026-07-05T00:00:00Z', src: 'domi-audit.js', doc: 'x', kind: 'rail-add',
        target: null, data: { body: 'will be removed', targetId: null } },
    ], nextSince: '01AB' }) });
    DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    await new Promise((r) => setTimeout(r, 10));
    window.dispatchEvent(new CustomEvent('domi-event', { detail: {
      id: '02AB', ts: '2026-07-05T00:00:01Z', src: 'domi-audit.js', doc: 'x', kind: 'rail-remove',
      target: null, data: { entryId: '01AB' }
    }}));
    await new Promise((r) => setTimeout(r, 0));
    const exported = JSON.parse(DomiAudit.export());
    expect(exported.entries).toHaveLength(0);
    expect(exported.removed).toContain('01AB');
  });

  it('WS-bridge listener re-renders on agent-iterating (no entry change)', async () => {
    loadAsServerMode();
    document.body.innerHTML = `<aside data-domini-rail></aside>`;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ events: [
      { id: '01AB', ts: '2026-07-05T00:00:00Z', src: 'domi-audit.js', doc: 'x', kind: 'rail-add',
        target: null, data: { body: 'comment', targetId: null } },
    ], nextSince: '01AB' }) });
    DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    await new Promise((r) => setTimeout(r, 10));
    window.dispatchEvent(new CustomEvent('domi-event', { detail: {
      id: '03AB', ts: '2026-07-05T00:00:02Z', src: 'domi-server', doc: 'x', kind: 'agent-iterating',
      target: null, data: { state: 'start', source: 'watcher' }
    }}));
    await new Promise((r) => setTimeout(r, 0));
    // The entry list doesn't change; only the iteration derivation would
    // (verified in Task 5 by the render test). For now, confirm the entry is
    // still present and no error was thrown.
    const exported = JSON.parse(DomiAudit.export());
    expect(exported.entries).toHaveLength(1);
  });

  it('render in server mode groups entries by agent-iterating windows', async () => {
    loadAsServerMode();
    document.body.innerHTML = `<aside data-domini-rail></aside>`;
    const events = [
      { id: 'INIT', ts: '2026-07-05T10:00:00Z', src: 'domi-audit.js', doc: 'x', kind: 'rail-add',
        target: null, data: { body: 'first', targetId: null } },
      { id: 'S1', ts: '2026-07-05T10:01:00Z', src: 'domi-server', doc: 'x', kind: 'agent-iterating',
        target: null, data: { state: 'start', source: 'watcher' } },
      { id: 'IN1', ts: '2026-07-05T10:01:30Z', src: 'domi-audit.js', doc: 'x', kind: 'rail-add',
        target: null, data: { body: 'in iter 1', targetId: null } },
      { id: 'E1', ts: '2026-07-05T10:02:00Z', src: 'domi-server', doc: 'x', kind: 'agent-iterating',
        target: null, data: { state: 'end', source: 'watcher' } },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ events, nextSince: 'E1' }) });
    DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    await new Promise((r) => setTimeout(r, 10));
    const groups = document.querySelectorAll('[data-iter]');
    expect(groups.length).toBe(2);
    // Latest first: iteration 1, then initial.
    expect(groups[0].getAttribute('data-iter')).toBe('1');
    expect(groups[0].getAttribute('data-open')).toBe('true');
    expect(groups[1].getAttribute('data-iter')).toBe('initial');
    expect(groups[1].getAttribute('data-open')).toBe('true');
    // Iteration 1 has only IN1.
    const iter1Entries = groups[0].querySelectorAll('[data-entry-id]');
    expect(iter1Entries.length).toBe(1);
    expect(iter1Entries[0].getAttribute('data-entry-id')).toBe('IN1');
    // Initial has only INIT.
    const initialEntries = groups[1].querySelectorAll('[data-entry-id]');
    expect(initialEntries.length).toBe(1);
    expect(initialEntries[0].getAttribute('data-entry-id')).toBe('INIT');
  });
});