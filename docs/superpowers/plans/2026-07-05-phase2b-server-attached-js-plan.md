# Phase 2b: Server-Attached JS Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `scripts/runtime/domi.js` and `scripts/runtime/domi-audit.js` switch into server-attached mode when `window.__DOMI_SERVER__ === true`, posting v2 wire-protocol events to `POST /api/events`, hydrating from `GET /api/events`, and consuming `domi-event` CustomEvents from the server-side shim. Phase 1 (standalone / localStorage) must remain unchanged.

**Architecture:** Two existing IIFE files get a mode branch at the top — a `SERVER` const controls which code path runs. In server mode the runtimes post JSON to the server endpoint; in standalone mode they continue writing to localStorage. The server stamps ULIDs (per Q2=B), so JS doesn't need a ULID library. The shim (already shipped in 2c-β) handles WebSocket → CustomEvent bridge.

**Tech Stack:** Vanilla JavaScript ES2020+ (no transpile). vitest (existing) for tests. No new deps.

## Global Constraints

- Working directory: `/Users/zaco/Projects/Personal/DOMicile`.
- Phase 1 behavior on standalone (no `__DOMI_SERVER__`) is unchanged. Tests in `tests/domi.test.js` and `tests/domi-audit.test.js` from Phase 1 must continue to pass.
- Server mode is signaled by `window.__DOMI_SERVER__ === true` (boolean, set by the 2c-β shim).
- Server mode POSTs JSON envelopes per `docs/WIRE-PROTOCOL.md` §A and `docs/schemas/event.schema.json` v2.
- The JS side does **not** generate ULIDs. The server stamps them. JS sends `id: null` (or omits the field per the schema's behavior).
- The `domi-event` and `domi-server-open` CustomEvents are emitted by `scripts/runtime/domi-server.js` (already shipped in 2c-β as `75372a1`-class work). No changes to that file.
- `localStorage` becomes a read-only boot mirror in server mode — read once on `init()` / `mount()`, then never write.
- Library files (`tokens/`, `components/`, original `templates/*/`, `crates/domi-server/`, `examples/`, `scripts/runtime/domi-server.js`) are **untouched**.
- `scripts/runtime/domi.js` and `scripts/runtime/domi-audit.js` ARE modified in place (this is the point of 2b).

---

### Task 1: Helper module for wire conversion + POST (small reusable piece)

**Files:**
- Create: `scripts/runtime/domi-wire.js`
- Create: `tests/domi-wire.test.js`

**Interfaces:**
- Consumes: nothing — pure stateless helpers.
- Produces:
  - `export function isServerMode(): boolean`
  - `export function serverOrigin(): string | null` — returns `window.location.origin` in browsers, `null` in non-browser test envs.
  - `export function postEvent(event): Promise<void>` — POSTs JSON to `${origin}/api/events`; rejects on network or 4xx/5xx.
  - `export function getEvents({ since?, doc?, limit? }): Promise<{ events: Event[], nextSince: string | null }>` — GETs `${origin}/api/events?...`.
  - `export function onServerEvent(cb): () => void` — subscribes to `window.domini-event` CustomEvents; returns the unsubscribe fn.
  - `export function onServerOpen(cb): () => void` — subscribes to `domi-server-open`.

- [ ] **Step 1: Write failing tests**

Write `tests/domi-wire.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { isServerMode, serverOrigin, postEvent, getEvents, onServerEvent } from '../scripts/runtime/domi-wire.js';

describe('domi-wire.js helpers', () => {
  beforeEach(() => {
    delete globalThis.window;
    delete globalThis.__DOMI_SERVER__;
  });
  afterEach(() => {
    delete globalThis.fetch;
  });

  it('isServerMode false when window missing', () => {
    expect(isServerMode()).toBe(false);
  });

  it('isServerMode true when window.__DOMI_SERVER__ === true', () => {
    globalThis.window = { __DOMI_SERVER__: true };
    expect(isServerMode()).toBe(true);
  });

  it('isServerMode false when window.__DOMI_SERVER__ === false', () => {
    globalThis.window = { __DOMI_SERVER__: false };
    expect(isServerMode()).toBe(false);
  });

  it('isServerMode false when window.__DOMI_SERVER__ not a boolean', () => {
    globalThis.window = { __DOMI_SERVER__: 'yes' };
    expect(isServerMode()).toBe(false);
  });

  it('serverOrigin returns null when window missing', () => {
    expect(serverOrigin()).toBe(null);
  });

  it('serverOrigin returns window.location.origin when present', () => {
    globalThis.window = { location: { origin: 'http://localhost:4173' } };
    expect(serverOrigin()).toBe('http://localhost:4173');
  });

  it('postEvent posts JSON to <origin>/api/events', async () => {
    globalThis.window = { location: { origin: 'http://x' } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    globalThis.fetch = fetchMock;
    const ev = { v: 2, kind: 'click', data: { value: 'x' } };
    await postEvent(ev);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://x/api/events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
        body: JSON.stringify(ev),
      })
    );
  });

  it('postEvent rejects on non-2xx', async () => {
    globalThis.window = { location: { origin: 'http://x' } };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, statusText: 'bad', text: async () => 'err body' });
    await expect(postEvent({ kind: 'x' })).rejects.toThrow(/400/);
  });

  it('postEvent rejects if fetch is unavailable', async () => {
    globalThis.window = { location: { origin: 'http://x' } };
    delete globalThis.fetch;
    await expect(postEvent({ kind: 'x' })).rejects.toThrow(/fetch/i);
  });

  it('getEvents parses { events, nextSince } response', async () => {
    globalThis.window = { location: { origin: 'http://x' } };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ events: [{ id: 'a' }], nextSince: 'b' }),
    });
    const r = await getEvents({ doc: 'foo' });
    expect(r.events).toHaveLength(1);
    expect(r.nextSince).toBe('b');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('doc=foo'), undefined);
  });

  it('onServerEvent subscribes and returns unsubscribe', () => {
    let listener;
    globalThis.window = { addEventListener: (name, cb) => { listener = { name, cb }; }, removeEventListener: vi.fn() };
    const cb = vi.fn();
    const unsubscribe = onServerEvent(cb);
    expect(listener.name).toBe('domi-event');
    listener.cb({ detail: { x: 1 } });
    expect(cb).toHaveBeenCalledWith({ x: 1 });
    unsubscribe();
    expect(globalThis.window.removeEventListener).toHaveBeenCalled();
  });

  it('getEvents URL includes limit and since when provided', async () => {
    globalThis.window = { location: { origin: 'http://x' } };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ events: [], nextSince: null }) });
    await getEvents({ since: '01Z', limit: 50 });
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('since=01Z');
    expect(url).toContain('limit=50');
  });

  it('getEvents rejects on non-2xx', async () => {
    globalThis.window = { location: { origin: 'http://x' } };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'srv', text: async () => '' });
    await expect(getEvents({})).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
npm test -- tests/domi-wire.test.js 2>&1 | tail -5
```
Expected: import fails ("Cannot find module ../scripts/runtime/domi-wire.js"). RED.

- [ ] **Step 3: Implement `scripts/runtime/domi-wire.js`**

```javascript
/* DOMiNice wire helpers — server-mode JSON envelope IO.
   Pure stateless functions used by domi.js and domi-audit.js in server mode.
   Phase 2b. */

export function isServerMode() {
  return !!(
    typeof window !== 'undefined' &&
    window.__DOMI_SERVER__ === true
  );
}

export function serverOrigin() {
  if (typeof window === 'undefined') return null;
  return window.location?.origin ?? null;
}

function postJSON(url, body) {
  if (typeof fetch === 'undefined') return Promise.reject(new Error('fetch unavailable'));
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => {
    if (!r.ok) {
      return r.text().then((t) => {
        throw new Error(`POST ${url} → ${r.status} ${r.statusText}: ${t}`);
      });
    }
    return r;
  });
}

function getJSON(url) {
  if (typeof fetch === 'undefined') return Promise.reject(new Error('fetch unavailable'));
  return fetch(url).then((r) => {
    if (!r.ok) {
      return r.text().then((t) => {
        throw new Error(`GET ${url} → ${r.status} ${r.statusText}: ${t}`);
      });
    }
    return r.json();
  });
}

export function postEvent(event) {
  const origin = serverOrigin();
  if (!origin) return Promise.reject(new Error('no origin (not in a browser)'));
  return postJSON(origin + '/api/events', event);
}

export function getEvents({ since, doc, limit } = {}) {
  const origin = serverOrigin();
  if (!origin) return Promise.reject(new Error('no origin (not in a browser)'));
  const params = [];
  if (since) params.push('since=' + encodeURIComponent(since));
  if (doc) params.push('doc=' + encodeURIComponent(doc));
  if (limit != null) params.push('limit=' + encodeURIComponent(limit));
  const url = origin + '/api/events' + (params.length ? '?' + params.join('&') : '');
  return getJSON(url);
}

export function onServerEvent(cb) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('domi-event', (e) => cb(e.detail));
  return () => window.removeEventListener('domi-event', (e) => cb(e.detail));
}

export function onServerOpen(cb) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener('domi-server-open', handler);
  return () => window.removeEventListener('domi-server-open', handler);
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
npm test -- tests/domi-wire.test.js 2>&1 | tail -5
```
Expected: 12 tests passing.

- [ ] **Step 5: Run full JS suite (regression check)**

```bash
npm test 2>&1 | tail -3
```
Expected: 73 (61 prior + 12 new) tests passing.

- [ ] **Step 6: Commit**

```bash
git add scripts/runtime/domi-wire.js tests/domi-wire.test.js
git commit -m "feat(domi-wire): server-mode HTTP helpers (isServerMode, postEvent, getEvents, onServerEvent)"
```

---

### Task 2: `domi.js` server-mode branch

**Files:**
- Modify: `scripts/runtime/domi.js`
- Modify: `tests/domi.test.js`

**Interfaces:**
- Consumes: `domi-wire.js` from Task 1.
- Produces: `scripts/runtime/domi.js`'s `window.DOMi` API unchanged; behavior branches on `__DOMI_SERVER__`.

- [ ] **Step 1: Write failing tests**

Append to `tests/domi.test.js` (new `describe` block, after existing tests):

```javascript
import { isServerMode as _isServerMode, postEvent, getEvents, onServerOpen } from '../scripts/runtime/domi-wire.js';

describe('domi.js server mode', () => {
  let domiSrc;
  beforeEach(() => {
    domiSrc = readFileSync(resolve(here, '../scripts/runtime/domi.js'), 'utf8');
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.clear();
    delete window.__DOMI_SERVER__;
    delete window.DOMi;
    if (window.URL.createObjectURL) delete window.URL.createObjectURL;
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = () => 'blob:mock';
      window.URL.revokeObjectURL = () => {};
    }
    // (0, eval) the runtime fresh after each test
    (0, eval)(domiSrc);
  });

  it('does NOT post when server mode is off', () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    window.__DOMI_SERVER__ = false;
    // Re-eval with flag false
    delete window.DOMi;
    (0, eval)(domiSrc);
    // Click a feedback element
    const btn = document.createElement('button');
    btn.setAttribute('data-feedback', 'apply');
    document.getElementById('root').appendChild(btn);
    btn.click();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs a v2 click event when server mode is on', async () => {
    window.__DOMI_SERVER__ = true;
    window.location = { origin: 'http://x' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    globalThis.fetch = fetchMock;
    delete window.DOMi;
    (0, eval)(domiSrc);

    const btn = document.createElement('button');
    btn.setAttribute('data-feedback', 'apply');
    btn.textContent = 'Apply';
    document.getElementById('root').appendChild(btn);
    btn.click();

    // Allow microtasks (postEvent is fire-and-forget fetch).
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://x/api/events');
    const body = JSON.parse(init.body);
    expect(body.v).toBe(2);
    expect(body.kind).toBe('click');
    expect(body.src).toBe('domi.js');
    expect(body.target.id).toBe('apply');
    expect(body.data.value).toContain('Apply');
    expect(body.id).toBeNull();
  });

  it('POSTs a v2 input event debounced', async () => {
    window.__DOMI_SERVER__ = true;
    window.location = { origin: 'http://x' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    globalThis.fetch = fetchMock;
    delete window.DOMi;
    (0, eval)(domiSrc);

    vi.useFakeTimers();
    const input = document.createElement('input');
    input.name = 'projectName';
    document.getElementById('root').appendChild(input);
    input.value = 'Acme Co';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(500);
    await new Promise((r) => setTimeout(r, 0));
    const calls = fetchMock.mock.calls.filter(([u]) => u === 'http://x/api/events');
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const lastBody = JSON.parse(calls[calls.length - 1][1].body);
    expect(lastBody.kind).toBe('input');
    expect(lastBody.data.name).toBe('projectName');
    expect(lastBody.data.value).toBe('Acme Co');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run new tests, verify RED**

```bash
npm test -- tests/domi.test.js 2>&1 | tail -10
```
Expected: import of `domi-wire` fails (file doesn't exist yet — Task 1 should have shipped). RED.

- [ ] **Step 3: Implement server-mode branch in `scripts/runtime/domi.js`**

Replace the entire file with:

```javascript
/* DOMiNice standalone + server-attached runtime — Phase 1 + Phase 2b.
   In standalone mode (no window.__DOMI_SERVER__): localStorage.
   In server mode: POST v2 wire events via domi-wire. */
(function () {
  'use strict';

  var page = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/, '') || 'index';
  var eventsKey = 'domi:events:' + page;
  var inputsKey = 'domi:inputs:' + page;
  var SERVER = !!(typeof window !== 'undefined' && window.__DOMI_SERVER__ === true);

  function isOurClick(event) {
    return event && event.kind === 'click' && event.src === 'domi.js';
  }
  function isOurInput(event) {
    return event && event.kind === 'input' && event.src === 'domi.js';
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (_) { return fallback; }
  }
  function writeJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  // Phase 1: append to localStorage.
  function logEventLocal(ev) {
    var events = readJSON(eventsKey, []);
    events.push(Object.assign({ ts: new Date().toISOString(), page: page }, ev));
    writeJSON(eventsKey, events);
  }

  // Phase 2b server mode: POST a v2 event. ULID stamping is the server's job.
  function postEventV2(ev) {
    var body = Object.assign({
      v: 2,
      id: null,
      ts: new Date().toISOString(),
      src: 'domi.js',
      doc: page,
    }, ev);
    return fetch(location.origin + '/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(function (e) { console.warn('domi.js: post failed', e); });
  }

  function toClickV2(selector, tag, text) {
    return {
      kind: 'click',
      target: { id: selector || null, selector: null, rect: null },
      data: { value: text || null },
    };
  }
  function toInputV2(name, value) {
    return {
      kind: 'input',
      target: { id: name || null, selector: null, rect: null },
      data: { name: name, value: value },
    };
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function init() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== document) {
        if (t.getAttribute && t.getAttribute('data-feedback')) {
          var selector = t.getAttribute('data-feedback');
          var tag = t.tagName.toLowerCase();
          var text = (t.textContent || '').trim().slice(0, 80);
          if (SERVER) {
            postEventV2(toClickV2(selector, tag, text));
          } else {
            logEventLocal({ type: 'click', selector: selector, tag: tag, text: text });
          }
          break;
        }
        t = t.parentNode;
      }
      if (t && t.getAttribute && t.getAttribute('data-export-feedback')) {
        var url = window.DOMi.exportFeedback();
        var a = document.createElement('a');
        a.href = url;
        a.download = page + '-feedback.jsonl';
        a.click();
      }
    });

    var saveInputs = debounce(function () {
      var inputs = {};
      document.querySelectorAll('input[name], textarea[name], select[name]').forEach(function (el) {
        inputs[el.name] = el.value;
      });
      if (SERVER) {
        var entries = Object.keys(inputs).map(function (name) {
          return toInputV2(name, inputs[name]);
        });
        Promise.all(entries.map(function (ev) {
          return fetch(location.origin + '/api/events', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(Object.assign({ v: 2, id: null, ts: new Date().toISOString(), src: 'domi.js', doc: page }, ev)),
          }).catch(function (e) { console.warn('domi.js: input post failed', e); });
        }));
        // Boot mirror — read once on first server-mode load.
        var cached = readJSON(inputsKey, null);
        if (cached) {
          // Replay cached inputs into the form fields. One-shot.
          Object.keys(cached).forEach(function (name) {
            var el = document.querySelector('[name="' + name + '"]');
            if (el) el.value = cached[name];
          });
        }
      } else {
        writeJSON(inputsKey, inputs);
      }
    }, 300);

    document.addEventListener('input', saveInputs);
  }

  function exportFeedback() {
    if (SERVER) {
      // Build a JSONL string from server-fetched events.
      return fetch(location.origin + '/api/events?doc=' + encodeURIComponent(page) + '&limit=1000')
        .then(function (r) { return r.ok ? r.json() : { events: [], nextSince: null }; })
        .then(function (body) {
          var events = (body.events || []).filter(isOurClick);
          var inputs = (body.events || []).filter(isOurInput);
          var lines = events.map(function (e) { return JSON.stringify({ type: 'click', selector: (e.target && e.target.id) || '', text: (e.data && e.data.value) || '', ts: e.ts }); });
          inputs.forEach(function (e) {
            lines.push(JSON.stringify({ type: 'input', name: e.data.name, value: e.data.value, ts: e.ts }));
          });
          var blob = new Blob([lines.join('\n') + '\n'], { type: 'application/jsonl' });
          return URL.createObjectURL(blob);
        })
        .catch(function () {
          return URL.createObjectURL(new Blob([''], { type: 'application/jsonl' }));
        });
    }
    var events = readJSON(eventsKey, []);
    var inputs = readJSON(inputsKey, {});
    var lines = events.map(function (e) { return JSON.stringify(e); });
    Object.keys(inputs).forEach(function (name) {
      lines.push(JSON.stringify({ type: 'input', name: name, value: inputs[name], ts: new Date().toISOString(), page: page }));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'application/jsonl' });
    return URL.createObjectURL(blob);
  }

  window.DOMi = { exportFeedback: exportFeedback, eventsKey: eventsKey, inputsKey: inputsKey };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

Note: `exportFeedback()` now returns a `Promise<string>` in server mode and a `string` (the Blob URL) in standalone mode. This is a slight API shape change; the brief's tests assert both forms via `URL.createObjectURL`.

If the existing Phase 1 `tests/domi.test.js` already asserts `expect(typeof blob).toBe('string')` (it does), the server-mode test should `await` the promise and then assert.

- [ ] **Step 4: Update `tests/domi.test.js` Phase 1 assertion for the new signature**

The existing Phase 1 test:
```js
it('exportFeedback() returns a Blob URL of the events.jsonl', () => {
  // ... clicks btn ...
  const blob = window.DOMi.exportFeedback();
  expect(blob).toBeTruthy();
  expect(typeof blob).toBe('string');
});
```

The standalone path returns a `string` (Blob URL). The brief says "Phase 1 callers see no change." Phase 1 retains `expect(typeof blob).toBe('string')` and that still passes. The server-mode test calls `await` and asserts `URL.createObjectURL` was invoked.

- [ ] **Step 5: Run all `domi.test.js` tests, verify GREEN**

```bash
npm test -- tests/domi.test.js 2>&1 | tail -10
```
Expected: 4 prior + 3 new = 7 tests passing.

- [ ] **Step 6: Run full JS suite, regression check**

```bash
npm test 2>&1 | tail -3
```
Expected: 76 (73 + 3) tests passing.

- [ ] **Step 7: Commit**

```bash
git add scripts/runtime/domi.js tests/domi.test.js
git commit -m "feat(domi.js): server-attached mode — POST v2 events on click/input"
```

---

### Task 3: `domi-audit.js` server-mode branch

**Files:**
- Modify: `scripts/runtime/domi-audit.js`
- Modify: `tests/domi-audit.test.js`

**Interfaces:**
- Consumes: `domi-wire.js` from Task 1.
- Produces: `window.DomiAudit.{mount, addComment, export, resolveEntry}` — `resolveEntry` is new in server mode (Phase 1 had no resolve). In standalone mode, `resolveEntry` no-ops the entry's `resolved` flag locally.

- [ ] **Step 1: Write failing tests**

Append to `tests/domi-audit.test.js`:

```javascript
describe('domi-audit.js server mode', () => {
  let src;
  beforeEach(() => {
    src = readFileSync('scripts/runtime/domi-audit.js', 'utf8');
    document.body.innerHTML = '';
    delete globalThis.DomiAudit;
    delete globalThis.window;
    delete globalThis.__DOMI_SERVER__;
    (0, eval)(src);
  });

  it('addComment POSTs a rail-add event in server mode', async () => {
    globalThis.window = { __DOMI_SERVER__: true, location: { origin: 'http://x' } };
    document.body.innerHTML = `<aside data-domini-rail></aside>`;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    globalThis.fetch = fetchMock;
    DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
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
    globalThis.window = { __DOMI_SERVER__: true, location: { origin: 'http://x' } };
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
    expect(exported.entries[0].data.body).toBe('first');
    expect(exported.entries[1].data.body).toBe('second');
  });

  it('resolveEntry POSTs a rail-resolve event in server mode', async () => {
    globalThis.window = { __DOMI_SERVER__: true, location: { origin: 'http://x' } };
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
    globalThis.window = { __DOMI_SERVER__: true, location: { origin: 'origin-x' } };
    document.body.innerHTML = `<aside data-domini-rail></aside>`;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ events: [], nextSince: null }) });
    DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    await new Promise((r) => setTimeout(r, 10));
    // Simulate the shim firing a domi-event
    globalThis.window.dispatchEvent({ type: 'domi-event', detail: {
      id: '77Z', ts: 't', src: 'domi-audit.js', doc: 'x', kind: 'rail-add',
      target: null, data: { body: 'remote', targetId: null }
    }});
    // Wait for the listener to re-render
    await new Promise((r) => setTimeout(r, 0));
    const exported = JSON.parse(DomiAudit.export());
    expect(exported.entries.some((e) => e.id === '77Z')).toBe(true);
  });

  it('does NOT POST in standalone mode (regression — Phase 1 path)', () => {
    globalThis.window = { __DOMI_SERVER__: false, location: { origin: 'http://x' } };
    document.body.innerHTML = `<aside data-domini-rail></aside>`;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    DomiAudit.addComment({ targetId: null, body: 'hi' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run new tests, verify RED**

```bash
npm test -- tests/domi-audit.test.js 2>&1 | tail -10
```
Expected: 5 new tests fail (functions not yet server-aware). RED.

- [ ] **Step 3: Implement server-mode branch in `scripts/runtime/domi-audit.js`**

Replace the entire file with:

```javascript
/* DOMiNice audit runtime — see docs/AUDIT.md (Phase 2b: server-attached mode). */
(function () {
  const STORAGE_PREFIX = 'dominice:';
  const SERVER = !!(typeof window !== 'undefined' && window.__DOMI_SERVER__ === true);

  function loadEntries(docName) {
    if (SERVER) {
      // In server mode, hydrate via fetch and filter to domi-audit.js rail events.
      // Async; resolved via fetchFromServer below.
      return null;
    }
    const raw = localStorage.getItem(STORAGE_PREFIX + docName);
    if (!raw) return { version: 1, name: docName, entries: [] };
    try { return JSON.parse(raw); } catch { return { version: 1, name: docName, entries: [] }; }
  }

  function saveEntries(docName, state) {
    if (SERVER) return; // Read-only mirror.
    localStorage.setItem(STORAGE_PREFIX + docName, JSON.stringify(state));
  }

  let _state = { version: 1, name: '', entries: [] };
  let _docName = '';
  let _statePath = '';
  let _hydrationDone = false;

  function fetchFromServer(docName) {
    if (!SERVER || typeof fetch === 'undefined') return Promise.resolve(_state);
    if (!window.location?.origin) return Promise.resolve(_state);
    const url = window.location.origin + '/api/events?doc=' + encodeURIComponent(docName) + '&limit=1000';
    return fetch(url)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((body) => {
        const entries = (body.events || [])
          .filter((e) => (e.src === 'domi-audit.js') && (e.kind === 'rail-add' || e.kind === 'rail-resolve'))
          .map((e) => {
            if (e.kind === 'rail-add') {
              return {
                id: e.id, targetId: (e.data && e.data.targetId) || null,
                author: e.src === 'domi-audit.js' ? 'user' : 'agent',
                timestamp: e.ts, body: (e.data && e.data.body) || '',
                resolved: false,
              };
            }
            // rail-resolve: mark existing entry resolved.
            const entryId = e.data && e.data.entryId;
            if (entryId) {
              const idx = _state.entries.findIndex((x) => x.id === entryId);
              if (idx >= 0) _state.entries[idx] = Object.assign({}, _state.entries[idx], { resolved: true });
            }
            return null;
          })
          .filter(Boolean);
        // Deduplicate by id (server may emit duplicates if WS and GET overlap).
        const seen = new Set();
        const merged = entries.filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
        return { version: 1, name: docName, entries: merged };
      })
      .catch(() => _state);
  }

  function postRail(event) {
    if (!SERVER) return Promise.reject(new Error('not in server mode'));
    if (typeof fetch === 'undefined' || !window.location?.origin) return Promise.reject(new Error('fetch unavailable'));
    const body = Object.assign({
      v: 2, id: null, ts: new Date().toISOString(),
      src: 'domi-audit.js', doc: _docName,
    }, event);
    return fetch(window.location.origin + '/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((e) => { console.warn('domi-audit.js: post failed', e); });
  }

  function toRailAdd(targetId, body) {
    return {
      kind: 'rail-add',
      target: { id: targetId || null, selector: null, rect: null },
      data: { body, targetId: targetId || null },
    };
  }
  function toRailResolve(entryId) {
    return {
      kind: 'rail-resolve',
      target: null,
      data: { entryId },
    };
  }

  function _render() {
    const list = document.querySelector('[data-domini-rail-list]');
    if (!list) return;
    list.innerHTML = '';
    _state.entries.forEach((e) => {
      const li = document.createElement('li');
      li.dataset.entryId = e.id;
      li.textContent = `[${e.targetId || 'doc'}] ${e.body}`;
      list.appendChild(li);
    });
  }

  function onServerEvent(event) {
    if (!event || event.doc !== _docName) return;
    if (event.kind === 'rail-add') {
      if (_state.entries.some((e) => e.id === event.id)) return; // dedup
      _state.entries.push({
        id: event.id,
        targetId: (event.data && event.data.targetId) || null,
        author: 'user',
        timestamp: event.ts,
        body: (event.data && event.data.body) || '',
        resolved: false,
      });
      _render();
    } else if (event.kind === 'rail-resolve') {
      const entryId = event.data && event.data.entryId;
      const idx = _state.entries.findIndex((e) => e.id === entryId);
      if (idx >= 0) {
        _state.entries[idx] = Object.assign({}, _state.entries[idx], { resolved: true });
        _render();
      }
    }
  }

  function mount({ statePath, docName }) {
    const rail = document.querySelector('[data-domini-rail]');
    if (rail && !rail.querySelector('[data-domini-rail-form]')) {
      const form = document.createElement('form');
      form.setAttribute('data-domini-rail-form', '');
      form.innerHTML = `
        <textarea name="body" rows="2" placeholder="Comment on this doc…"></textarea>
        <button type="submit">Add</button>
      `;
      rail.appendChild(form);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const body = form.elements['body'].value.trim();
        if (!body) return;
        addComment({ targetId: null, body });
        form.elements['body'].value = '';
      });
      const list = document.createElement('ul');
      list.setAttribute('data-domini-rail-list', '');
      rail.appendChild(list);
    }

    _statePath = statePath;
    _docName = docName;

    if (SERVER) {
      // Async rehydrate from server. Standalone path uses localStorage sync.
      const bootMirror = loadLocal(docName);
      _state = bootMirror;
      _render();
      fetchFromServer(docName).then((serverState) => {
        // Server state is authoritative. Merge by ULID.
        const byId = new Map();
        bootMirror.entries.forEach((e) => byId.set(e.id, e));
        serverState.entries.forEach((e) => byId.set(e.id, e));
        _state = { version: 1, name: docName, entries: Array.from(byId.values()) };
        _hydrationDone = true;
        _render();
      });
      // Subscribe to server WS bridge.
      if (typeof window !== 'undefined') {
        window.addEventListener('domi-event', (e) => onServerEvent(e.detail));
      }
    } else {
      _state = loadEntries(docName);
      _render();
    }
  }

  // Boot mirror read (always, even in server mode — see Q1=A).
  function loadLocal(docName) {
    const raw = localStorage.getItem(STORAGE_PREFIX + docName);
    if (!raw) return { version: 1, name: docName, entries: [] };
    try { return JSON.parse(raw); } catch { return { version: 1, name: docName, entries: [] }; }
  }

  function addComment({ targetId, body }) {
    if (!_docName) return;
    if (SERVER) {
      // Do NOT mutate _state locally; the WS bridge will deliver the entry
      // back via onServerEvent, which re-renders the rail.
      postRail(toRailAdd(targetId, body));
      return;
    }
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      targetId: targetId || null,
      author: 'user',
      timestamp: new Date().toISOString(),
      body,
      resolved: false,
    };
    _state.entries.push(entry);
    saveEntries(_docName, _state);
    _render();
  }

  function resolveEntry(entryId) {
    if (!entryId) return;
    if (SERVER) {
      postRail(toRailResolve(entryId));
      return;
    }
    // Standalone: just toggle locally.
    const idx = _state.entries.findIndex((e) => e.id === entryId);
    if (idx >= 0) {
      _state.entries[idx] = Object.assign({}, _state.entries[idx], { resolved: true });
      saveEntries(_docName, _state);
      _render();
    }
  }

  function exportJSON() {
    if (SERVER) {
      // Synchronous export returns the current in-memory state (after hydration).
      // Phase 2 callers wanting the full server snapshot should use fetch.
      return JSON.stringify(_state);
    }
    return JSON.stringify(_state);
  }

  globalThis.DomiAudit = { mount, addComment, resolveEntry, export: exportJSON };
})();
```

- [ ] **Step 4: Run all `domi-audit.test.js` tests**

```bash
npm test -- tests/domi-audit.test.js 2>&1 | tail -10
```
Expected: 4 prior + 5 new = 9 passing.

- [ ] **Step 5: Run full JS suite, regression check**

```bash
npm test 2>&1 | tail -3
```
Expected: 81 (76 + 5) tests passing.

- [ ] **Step 6: Commit**

```bash
git add scripts/runtime/domi-audit.js tests/domi-audit.test.js
git commit -m "feat(domi-audit.js): server-attached mode — POST rail-add/rail-resolve, hydrate via GET /api/events"
```

---

### Task 4: Cross-language wire-protocol sample

**Files:**
- Modify: `tests/wire-protocol.test.js`

**Interfaces:**
- Consumes: 2a's JSON Schema, 2b's `WIRE-PROTOCOL.md` "id stamping" rule.
- Produces: at least one new AJV-validated sample that exercises `id: null` and the server-stamps rule.

- [ ] **Step 1: Add a new test case to `tests/wire-protocol.test.js`**

Find the existing `MINIMAL_EVENT` near the top of the file. After it (or at the end of the file's `describe('event.schema.json', …)`), add:

```javascript
it('accepts an event with id: null (server stamps before append)', () => {
  const ev = structuredClone(MINIMAL_EVENT);
  ev.id = null;
  expect(validate(ev)).toBe(true);
});
```

- [ ] **Step 2: Run, verify GREEN**

```bash
npm test -- tests/wire-protocol.test.js 2>&1 | tail -5
```
Expected: 11 prior + 1 new = 12 passing.

- [ ] **Step 3: Run full JS suite, regression check**

```bash
npm test 2>&1 | tail -3
```
Expected: 82 (81 + 1) tests passing.

- [ ] **Step 4: Commit**

```bash
git add tests/wire-protocol.test.js
git commit -m "test(wire-protocol): accept id: null — server stamps before append (2b rule)"
```

---

### Task 5: Verify library invariant + workspace summary

**Files:** none (verification only).

- [ ] **Step 1: Confirm no library files were modified**

```bash
git diff v0.1.0..HEAD --stat -- tokens/ components/ scripts/runtime/domi-server.js crates/domi-server/ examples/
```
Expected: empty from THIS round (the prior 2c-β's `domi-server.js` was already committed; what matters is no new diffs in this round).

- [ ] **Step 2: Confirm `domi.js` and `domi-audit.js` ARE modified (this is the point)**

```bash
git diff v0.1.0..HEAD --stat -- scripts/runtime/domi.js scripts/runtime/domi-audit.js
```
Expected: both files show non-zero insertions/deletions from this round's commits only (i.e., from Tasks 2 and 3).

- [ ] **Step 3: Run full JS suite once more**

```bash
npm test 2>&1 | tail -3
```
Expected: 82/82 passing.

- [ ] **Step 4: Run the cargo suite (no expected new commits; should still be 25 + 1 ignored)**

```bash
cargo test -p domi-server 2>&1 | tail -3
```
Expected: 25 passing, 1 ignored.

- [ ] **Step 5: Commit only if something was discovered-and-fixed**

Likely nothing. Skip if clean.

---

### Task 6: Documentation + release notes

**Files:**
- Modify: `RELEASE-NOTES-v0.1.0.md`

(AUDIT.md and WIRE-PROTOCOL.md were already updated as part of 2b's spec companion in commit `2644370`.)

- [ ] **Step 1: Append a release-notes section**

```markdown

---

## Phase 2b — Server-attached JS mode (2026-07-05)

- `scripts/runtime/domi.js` and `scripts/runtime/domi-audit.js` now branch on `window.__DOMI_SERVER__ === true`.
- **Standalone mode** (Phase 1) is unchanged: localStorage is the source of truth, all existing tests pass.
- **Server mode:**
  - `domi.js` POSTs v2 click/input events to `/api/events` with `id: null`; server stamps the ULID.
  - `domi-audit.js` POSTs v2 `rail-add` / `rail-resolve` events; hydrates via `GET /api/events?doc=<doc>` on mount.
  - WebSocket bridge: `domi-event` CustomEvents render comments / resolve events live as they arrive.
  - `localStorage` becomes a read-only boot mirror — read once on init, never written.
  - `DomiAudit.resolveEntry(entryId)` is new in 2b; phase 1 had no resolve path.
- New `scripts/runtime/domi-wire.js`: stateless `isServerMode`, `postEvent`, `getEvents`, `onServerEvent`, `onServerOpen`, `serverOrigin` helpers used by both runtimes.
- 13 new tests: 12 for `domi-wire` (helper coverage), 3 server-mode for `domi.js`, 5 server-mode for `domi-audit` (one of which is the regression for Phase 1), 1 server-stamps rule for `wire-protocol`.
- Spec + companion docs:
  - `docs/superpowers/specs/2026-07-05-phase2b-server-attached-js-design.md`
  - `docs/AUDIT.md` (new "Server-attached mode" section)
  - `docs/WIRE-PROTOCOL.md` (server stamps `id` if absent rule)
- Library files (`tokens/`, `components/`, original `templates/*/`, `crates/domi-server/`, `examples/`, `scripts/runtime/domi-server.js`): untouched.
```

- [ ] **Step 2: Final verification**

```bash
npm test 2>&1 | tail -3
cargo test -p domi-server 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add RELEASE-NOTES-v0.1.0.md
git commit -m "docs(release): Phase 2b — server-attached JS mode release notes"
```

---

## Done when

All 6 task checklists complete; `npm test` reports 82/82 passing; `cargo test -p domi-server` reports 25 + 1 ignored; `git diff v0.1.0..HEAD --stat -- tokens/ components/ examples/ crates/domi-server/` shows zero new diffs from this round; `git diff v0.1.0..HEAD --stat -- scripts/runtime/domi.js scripts/runtime/domi-audit.js scripts/runtime/domi-wire.js` shows commits from this round only.
