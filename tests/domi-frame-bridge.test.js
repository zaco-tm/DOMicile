import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// jsdom does not provide PointerEvent. The bridge listens for `pointer*` events,
// so the test needs at least a class that constructs a dispatchable event with
// a `type` of 'pointerdown' etc. MouseEvent is a fine stand-in for the test.
if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = globalThis.MouseEvent;
}

const SRC = readFileSync('scripts/runtime/domi-frame-bridge.js', 'utf8');

function loadBridge() {
  delete globalThis.StudioFrame;
  globalThis.eval(SRC);
  return globalThis.StudioFrame;
}

// jsdom's teardown stumbles when an iframe has a stubbed `contentDocument`:
// it tries to call `window.close()` on a window that doesn't match. Detach
// the stubbed iframe from the DOM before vitest's teardown sees it.
afterEach(() => {
  document.body.innerHTML = '';
});

describe('StudioFrame snap and drag', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="studio-snap">
        <button data-snap="375">375</button>
        <button data-snap="768">768</button>
        <button data-snap="1024" aria-pressed="true">1024</button>
        <button data-snap="1280">1280</button>
        <span class="studio-snap-readout" id="studio-snap-readout">1024px</span>
      </div>
      <iframe id="studio-frame" width="1024"></iframe>
      <div id="studio-resizer" tabindex="0" role="separator" aria-orientation="vertical"></div>
    `;
  });

  it('exposes a mount function on the global', () => {
    const StudioFrame = loadBridge();
    expect(typeof StudioFrame.mount).toBe('function');
  });

  it('clicking a snap button sets the iframe width and updates aria-pressed', () => {
    const StudioFrame = loadBridge();
    StudioFrame.mount({ frameSelector: '#studio-frame' });
    const btn = document.querySelector('[data-snap="375"]');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const frame = document.querySelector('#studio-frame');
    expect(frame.style.width).toBe('375px');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-snap="1024"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('updates the width readout after a snap click', () => {
    const StudioFrame = loadBridge();
    StudioFrame.mount({ frameSelector: '#studio-frame', readoutSelector: '#studio-snap-readout' });
    document.querySelector('[data-snap="768"]').click();
    expect(document.querySelector('#studio-snap-readout').textContent).toBe('768px');
  });

  it('clamps drag widths to [320, 1920]', () => {
    const StudioFrame = loadBridge();
    StudioFrame.mount({ frameSelector: '#studio-frame' });
    const resizer = document.querySelector('#studio-resizer');
    const frame = document.querySelector('#studio-frame');
    resizer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0 }));
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: -9999 }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(parseInt(frame.style.width, 10)).toBeGreaterThanOrEqual(320);
  });
});

describe('StudioFrame postMessage bridge', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <iframe id="studio-frame"></iframe>
      <main></main>
    `;
    // Stub the iframe contentDocument with a body containing [data-feedback] elements.
    const frame = document.querySelector('#studio-frame');
    const fakeDoc = document.implementation.createHTMLDocument('body');
    fakeDoc.body.innerHTML = `
      <button data-feedback="btn-a">A</button>
      <button data-feedback="btn-b">B</button>
    `;
    // Mark the stub as a fully-loaded real document (not the browser's
    // initial about:blank) so the bridge's wireBridge gate
    // (readyState==='complete' AND URL !== 'about:blank') passes and
    // exercises the immediate-wire code path — the path that catches
    // "mount() runs after the iframe has navigated to its body".
    Object.defineProperty(fakeDoc, 'URL', { value: 'http://localhost/body', configurable: true });
    Object.defineProperty(fakeDoc, 'readyState', { value: 'complete', configurable: true });
    Object.defineProperty(frame, 'contentDocument', { value: fakeDoc, configurable: true });
    Object.defineProperty(frame, 'contentWindow', { value: fakeDoc.defaultView, configurable: true });
  });

  it('exposes mount and accepts a frame selector', () => {
    const StudioFrame = loadBridge();
    expect(() => StudioFrame.mount({ frameSelector: '#studio-frame' })).not.toThrow();
  });

  it('clicking a [data-feedback] element inside the iframe sets the active target', () => {
    // Provide a minimal DomiAudit shim that the bridge can call.
    globalThis.DomiAudit = { setTarget: vi.fn() };
    const StudioFrame = loadBridge();
    StudioFrame.mount({ frameSelector: '#studio-frame' });
    const frame = document.querySelector('#studio-frame');
    const btnA = frame.contentDocument.querySelector('[data-feedback="btn-a"]');
    btnA.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(globalThis.DomiAudit.setTarget).toHaveBeenCalledWith('btn-a');
  });
});
