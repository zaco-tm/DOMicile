import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('scripts/runtime/domi-audit.js', 'utf8');
const RENDER_SRC = readFileSync('scripts/runtime/domi-audit-render.js', 'utf8');

describe('DomiAudit.setTarget', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    delete globalThis.DomiAudit;
    globalThis.eval(SRC);
    globalThis.eval(RENDER_SRC);
  });

  it('exposes a setTarget function on the global', () => {
    expect(typeof globalThis.DomiAudit.setTarget).toBe('function');
  });

  it('sets the active target and dispatches domi-target-changed', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const handler = vi.fn();
    document.addEventListener('domi-target-changed', handler);
    globalThis.DomiAudit.setTarget('cta-primary');
    const hint = document.querySelector('[data-domini-target-id]');
    expect(hint && hint.textContent).toBe('cta-primary');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.id).toBe('cta-primary');
  });

  it('a subsequent click on a different [data-feedback] element calls setTarget (single source of truth)', () => {
    document.body.innerHTML = `
      <div data-domini-rail></div>
      <button data-feedback="cta-primary">A</button>
      <button data-feedback="cta-secondary">B</button>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const handler = vi.fn();
    document.addEventListener('domi-target-changed', handler);
    document.querySelector('[data-feedback="cta-secondary"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail.id).toBe('cta-secondary');
  });
});
