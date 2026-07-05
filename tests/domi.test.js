import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const domiSrc = readFileSync(resolve(here, '../scripts/domi.js'), 'utf8');

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
