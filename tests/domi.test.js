import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const domiSrc = readFileSync(resolve(here, '../scripts/runtime/domi.js'), 'utf8');

describe('domi.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.clear();
    delete window.__DOMI_SERVER__;
    delete window.DOMi;
    // jsdom does not implement URL.createObjectURL — stub it.
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = () => 'blob:mock';
      window.URL.revokeObjectURL = () => {};
    }
    // jsdom does not auto-execute appended <script> nodes;
    // eval the source directly so the IIFE runs against the test window.
    // eslint-disable-next-line no-eval
    (0, eval)(domiSrc);
  });

  it('exposes a DOMi global', () => {
    expect(window.DOMi).toBeTruthy();
    expect(typeof window.DOMi.exportFeedback).toBe('function');
  });

  it('logs click events on [data-feedback] to localStorage', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-feedback', 'apply');
    btn.textContent = 'Apply';
    document.getElementById('root').appendChild(btn);
    btn.click();

    const events = JSON.parse(localStorage.getItem(window.DOMi.eventsKey) || '[]');
    expect(events.some(e => e.type === 'click' && e.selector === 'apply')).toBe(true);
  });

  it('captures input changes debounced to localStorage', () => {
    vi.useFakeTimers();
    const input = document.createElement('input');
    input.name = 'projectName';
    document.getElementById('root').appendChild(input);
    input.value = 'Acme Co';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(500);

    const inputs = JSON.parse(localStorage.getItem(window.DOMi.inputsKey) || '{}');
    expect(inputs.projectName).toBe('Acme Co');
    vi.useRealTimers();
  });

  it('exportFeedback() returns a Blob URL of the events.jsonl', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-feedback', 'a');
    document.getElementById('root').appendChild(btn);
    btn.click();
    const blob = window.DOMi.exportFeedback();
    expect(blob).toBeTruthy();
    expect(typeof blob).toBe('string');
  });
});

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
    window.location = { origin: 'http://x', pathname: '/' };
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
    window.location = { origin: 'http://x', pathname: '/' };
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
    await vi.runAllTimersAsync();
    const calls = fetchMock.mock.calls.filter(([u]) => u === 'http://x/api/events');
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const lastBody = JSON.parse(calls[calls.length - 1][1].body);
    expect(lastBody.kind).toBe('input');
    expect(lastBody.data.name).toBe('projectName');
    expect(lastBody.data.value).toBe('Acme Co');
    vi.useRealTimers();
  });
});