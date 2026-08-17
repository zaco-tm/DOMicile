/* DOMicile studio frame bridge.
   Loaded only by the chrome (templates/working-doc-chrome/index.html).
   - Snap buttons: set iframe width to a fixed breakpoint.
   - Drag handle: free-resize the iframe, clamped to [320, 1920].
   - Keyboard: arrow keys on the focused resizer.
   - PostMessage bridge: click in iframe -> DomiAudit.setTarget(id).
   See docs/superpowers/specs/2026-08-17-studio-frame-design.md. */

(function () {
  const MIN_WIDTH = 320;
  const MAX_WIDTH = 1920;
  const DEFAULT_WIDTH = 1024;

  function clamp(n) {
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(n)));
  }

  function parseWidthPx(value) {
    if (!value) return DEFAULT_WIDTH;
    const n = parseInt(String(value).replace('px', ''), 10);
    return clamp(n);
  }

  function setWidth(frame, n) {
    const w = clamp(n);
    frame.style.width = w + 'px';
    const readout = document.querySelector('[data-domini-frame-readout], #studio-snap-readout');
    if (readout) readout.textContent = w + 'px';
    document.querySelectorAll('[data-snap]').forEach((b) => {
      b.setAttribute('aria-pressed', String(parseInt(b.getAttribute('data-snap'), 10) === w));
    });
  }

  function wireSnapButtons(frame) {
    document.querySelectorAll('[data-snap]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = parseInt(btn.getAttribute('data-snap'), 10);
        if (Number.isFinite(n)) setWidth(frame, n);
      });
    });
  }

  function wireResizer(frame) {
    const resizer = document.querySelector('#studio-resizer');
    if (!resizer) return;
    let startX = 0;
    let startW = 0;
    let dragging = false;

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      setWidth(frame, startW + dx);
    };
    const onUp = () => {
      dragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    resizer.addEventListener('pointerdown', (e) => {
      dragging = true;
      startX = e.clientX;
      startW = parseWidthPx(frame.style.width || frame.getAttribute('width'));
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });

    resizer.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const step = e.shiftKey ? 50 : 10;
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      const cur = parseWidthPx(frame.style.width || frame.getAttribute('width'));
      setWidth(frame, cur + dir * step);
      e.preventDefault();
    });
  }

  function wireBridge(frame) {
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      const el = t.closest('[data-feedback]');
      if (!el) return;
      const id = el.getAttribute('data-feedback');
      if (id && globalThis.DomiAudit && typeof globalThis.DomiAudit.setTarget === 'function') {
        globalThis.DomiAudit.setTarget(id);
      }
    });

    // Outline the matching element when the target changes from outside the iframe.
    document.addEventListener('domi-target-changed', (e) => {
      doc.querySelectorAll('.studio-iframe-target').forEach((el) => el.classList.remove('studio-iframe-target'));
      const id = e.detail && e.detail.id;
      if (!id) return;
      const el = doc.querySelector('[data-feedback="' + id.replace(/"/g, '\\"') + '"]');
      if (el) el.classList.add('studio-iframe-target');
    });
  }

  function mount({ frameSelector } = {}) {
    const frame = document.querySelector(frameSelector || '#studio-frame');
    if (!frame) return;
    wireSnapButtons(frame);
    wireResizer(frame);
    // If contentDocument is available, wire the bridge now; otherwise wait for load.
    // (We don't gate on readyState === 'complete': in jsdom test stubs the document
    // is non-null but still in 'loading' state, and the load event may never fire.)
    if (frame.contentDocument) {
      wireBridge(frame);
    } else {
      frame.addEventListener('load', () => wireBridge(frame), { once: true });
    }
    // Initial readout
    setWidth(frame, parseWidthPx(frame.style.width || frame.getAttribute('width') || DEFAULT_WIDTH));
  }

  globalThis.StudioFrame = { mount, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH };
})();
