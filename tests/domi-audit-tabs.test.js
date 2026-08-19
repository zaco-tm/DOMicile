import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('scripts/runtime/domi-audit.js', 'utf8');
const RENDER_SRC = readFileSync('scripts/runtime/domi-audit-render.js', 'utf8');

describe('audit rail tab system (current / history)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    delete globalThis.DomiAudit;
    // Eval both files in the canonical load order so the render module's IIFE
    // sees DomiAudit._internals already populated.
    globalThis.eval(SRC);
    globalThis.eval(RENDER_SRC);
  });

  it('mount renders a tablist with two tabs (current and history)', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const tablist = document.querySelector('[role="tablist"]');
    expect(tablist).toBeTruthy();
    const tabs = tablist.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute('data-rail-tab')).toBe('current');
    expect(tabs[1].getAttribute('data-rail-tab')).toBe('history');
  });

  it('current tab is the default active tab', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const cur = document.querySelector('[data-rail-tab="current"]');
    const hist = document.querySelector('[data-rail-tab="history"]');
    expect(cur.getAttribute('aria-selected')).toBe('true');
    expect(hist.getAttribute('aria-selected')).toBe('false');
  });

  it('mount creates two tabpanel <ul>s, only the current one is visible', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const cur = document.querySelector('[data-domini-rail-list="current"]');
    const hist = document.querySelector('[data-domini-rail-list="history"]');
    expect(cur).toBeTruthy();
    expect(hist).toBeTruthy();
    expect(cur.hidden).toBe(false);
    expect(hist.hidden).toBe(true);
  });

  it('clicking the history tab switches aria-selected and toggles panel visibility', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    document.querySelector('[data-rail-tab="history"]').click();
    expect(document.querySelector('[data-rail-tab="current"]').getAttribute('aria-selected')).toBe('false');
    expect(document.querySelector('[data-rail-tab="history"]').getAttribute('aria-selected')).toBe('true');
    const cur = document.querySelector('[data-domini-rail-list="current"]');
    const hist = document.querySelector('[data-domini-rail-list="history"]');
    expect(cur.hidden).toBe(true);
    expect(hist.hidden).toBe(false);
  });

  it('clicking the current tab after history switches back', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    document.querySelector('[data-rail-tab="history"]').click();
    document.querySelector('[data-rail-tab="current"]').click();
    expect(document.querySelector('[data-rail-tab="current"]').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('[data-rail-tab="history"]').getAttribute('aria-selected')).toBe('false');
  });

  it('mount wraps form + tablist in a sticky head; list panels are siblings of head', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const head = document.querySelector('[data-domini-rail-head]');
    expect(head).toBeTruthy();
    expect(head.querySelector('[data-domini-rail-form]')).toBeTruthy();
    expect(head.querySelector('[role="tablist"]')).toBeTruthy();
    // Panels must be direct children of the rail, NOT the head, so they
    // scroll under the sticky head.
    const rail = document.querySelector('[data-domini-rail]');
    expect(rail.querySelector('[data-domini-rail-list="current"]')).toBeTruthy();
    expect(rail.querySelector('[data-domini-rail-list="history"]')).toBeTruthy();
    expect(head.querySelector('[data-domini-rail-list]')).toBeNull();
  });

  it('standalone mode: all entries land in the current tab, history is 0', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    globalThis.DomiAudit.addComment({ targetId: null, body: 'one' });
    globalThis.DomiAudit.addComment({ targetId: null, body: 'two' });
    globalThis.DomiAudit.addComment({ targetId: null, body: 'three' });
    expect(document.querySelector('[data-rail-tab-count="current"]').textContent).toBe('3');
    expect(document.querySelector('[data-rail-tab-count="history"]').textContent).toBe('0');
    const curPanel = document.querySelector('[data-domini-rail-list="current"]');
    expect(curPanel.querySelectorAll('[data-entry-id]')).toHaveLength(3);
  });

  it('removing an entry decrements the current-tab count', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    globalThis.DomiAudit.addComment({ targetId: null, body: 'one' });
    globalThis.DomiAudit.addComment({ targetId: null, body: 'two' });
    expect(document.querySelector('[data-rail-tab-count="current"]').textContent).toBe('2');
    document.querySelector('.entry-remove').click();
    expect(document.querySelector('[data-rail-tab-count="current"]').textContent).toBe('1');
  });
});
