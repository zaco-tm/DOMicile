/* DOMicile audit runtime — render layer.
 *
 * Sibling IIFE to domi-audit.js. Must be loaded AFTER domi-audit.js (script tag
 * order). Reads the live state via DomiAudit._internals.getState() and the
 * helpers (parseRefs, computeIterations) from the same namespace. Click handlers
 * invoke the public removeEntry.
 *
 * What lives here vs. domi-audit.js:
 *   domi-audit.js         — state mgmt, wire helpers, ID generation, server mode
 *   domi-audit-render.js  — DOM construction, click handlers, iteration grouping
 */
(function () {
  const _internals = globalThis.DomiAudit && globalThis.DomiAudit._internals;
  if (!_internals || typeof _internals.getState !== 'function') {
    // domi-audit.js not loaded yet — defer to a no-op so the main file can
    // still render via its own (legacy) path if needed.
    return;
  }
  const getState = _internals.getState;
  const parseRefs = _internals.parseRefs;
  const computeIterations = _internals.computeIterations;
  const removeEntry = globalThis.DomiAudit.removeEntry;

  // Build the set of 6-char shorts known in the session.
  function _knownShorts() {
    const s = new Set();
    for (const e of getState().entries) s.add(e.id.slice(0, 6));
    return s;
  }

  function _renderEntry(entry) {
    const li = document.createElement('li');
    li.className = 'entry';
    li.setAttribute('data-entry-id', entry.id);

    const idSpan = document.createElement('span');
    idSpan.className = 'entry-id';
    idSpan.setAttribute('data-copy', entry.id);
    idSpan.setAttribute('title', 'Click to copy full ID');
    idSpan.textContent = '#' + entry.id.slice(0, 6);
    idSpan.addEventListener('click', () => _onCopyClick(entry.id, idSpan));
    li.appendChild(idSpan);

    const bodySpan = document.createElement('span');
    bodySpan.className = 'entry-body';
    const known = _knownShorts();
    const segments = parseRefs(entry.body, known);
    for (const seg of segments) {
      if (seg.kind === 'text') {
        bodySpan.appendChild(document.createTextNode(seg.value));
      } else {
        const a = document.createElement('a');
        a.className = 'entry-ref';
        a.setAttribute('data-ref-id', _resolveShort(seg.refId));
        a.setAttribute('href', '#');
        a.textContent = '#' + seg.refId;
        if (getState().removed.includes(_resolveShort(seg.refId))) {
          a.setAttribute('data-target-state', 'removed');
        }
        a.addEventListener('click', (ev) => _onRefClick(ev, a));
        bodySpan.appendChild(a);
      }
    }
    li.appendChild(bodySpan);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'entry-remove';
    removeBtn.setAttribute('data-remove-id', entry.id);
    removeBtn.setAttribute('aria-label', 'Remove annotation');
    removeBtn.setAttribute('tabindex', '-1');
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => removeEntry(entry.id));
    li.appendChild(removeBtn);

    return li;
  }

  function _resolveShort(short) {
    // Given a 4-7 char short, return the full ULID it matches (first 6-char prefix
    // of any known entry, where the short is a prefix of that 6-char prefix).
    for (const e of getState().entries) {
      if (e.id.slice(0, 6).startsWith(short)) return e.id;
    }
    return null;
  }

  function _onCopyClick(ulid, span) {
    if (!navigator?.clipboard?.writeText) return;
    navigator.clipboard.writeText(ulid).then(
      () => {
        span.setAttribute('data-copied', '');
        setTimeout(() => span.removeAttribute('data-copied'), 1000);
      },
      () => { /* silent no-op on rejection */ }
    );
  }

  function _onRefClick(ev, anchor) {
    ev.preventDefault();
    const targetId = anchor.getAttribute('data-ref-id');
    if (!targetId) return;
    if (getState().removed.includes(targetId)) return;
    // If the target is in a collapsed iteration, expand it first.
    const targetEntry = document.querySelector(`[data-entry-id="${targetId}"]`);
    if (!targetEntry) return;
    const iterLi = targetEntry.closest('[data-iter]');
    if (iterLi && iterLi.getAttribute('data-open') !== 'true') {
      const toggle = iterLi.querySelector('.iter-toggle');
      if (toggle) toggle.click();
    }
    targetEntry.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEntry.setAttribute('data-flash', '');
    setTimeout(() => targetEntry.removeAttribute('data-flash'), 1000);
  }

  function _renderIteration(iter, isInitial) {
    const li = document.createElement('li');
    li.setAttribute('data-iter', isInitial ? 'initial' : String(iter.id));
    const openByDefault = isInitial || (iter.id === _latestIterId());
    li.setAttribute('data-open', openByDefault ? 'true' : 'false');

    const head = document.createElement('header');
    head.className = 'iter-head';

    const toggle = document.createElement('button');
    toggle.className = 'iter-toggle';
    toggle.setAttribute('aria-expanded', openByDefault ? 'true' : 'false');
    toggle.textContent = openByDefault ? '▾' : '▸';
    toggle.addEventListener('click', () => {
      const isOpen = li.getAttribute('data-open') === 'true';
      li.setAttribute('data-open', isOpen ? 'false' : 'true');
      toggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      toggle.textContent = isOpen ? '▸' : '▾';
    });
    head.appendChild(toggle);

    const label = document.createElement('span');
    label.className = 'iter-label';
    label.textContent = isInitial ? 'Initial review' : `Iteration ${iter.id}`;
    head.appendChild(label);

    const meta = document.createElement('span');
    meta.className = 'iter-meta';
    meta.textContent = _formatIterMeta(iter, isInitial);
    head.appendChild(meta);

    li.appendChild(head);

    const ol = document.createElement('ol');
    ol.className = 'iter-entries';
    const visibleEntries = getState().entries.filter((e) => {
      if (getState().removed.includes(e.id)) return false;
      return iter.entryIds.includes(e.id);
    });
    for (const e of visibleEntries) ol.appendChild(_renderEntry(e));
    li.appendChild(ol);

    return li;
  }

  function _latestIterId() {
    // The highest non-initial iteration id in the current derivation.
    const iters = _currentIters();
    let max = 0;
    for (const it of iters) if (!it.isInitial && it.id > max) max = it.id;
    return max;
  }

  function _currentIters() {
    // Build the list of iterations from the events currently in memory.
    // In server mode this includes agent-iterating events hydrated from
    // /api/events + any received via WS. In standalone mode, the runtime
    // doesn't store agent-iterating events locally; fall back to a single
    // synthetic "initial" group containing all entries. Iteration grouping
    // in standalone mode is a follow-up spec.
    const events = _allIterEvents();
    if (events.length === 0) {
      if (getState().entries.length === 0) return [];
      return [{
        id: 1, startTs: null, endTs: null,
        entryIds: getState().entries.map((e) => e.id),
        isInitial: true,
      }];
    }
    const raw = computeIterations(events);
    // Renumber real iters 1..N in chronological order. computeIterations
    // assigns sequential ids to the initial group + real iters, so when
    // initial has entries it claims id 1; this renumbering keeps the
    // displayed iteration number aligned with the agent's iteration count.
    const real = raw.filter((it) => !it.isInitial).sort((a, b) => a.id - b.id);
    const initial = raw.find((it) => it.isInitial);
    real.forEach((it, i) => { it.id = i + 1; });
    return initial ? [...real, initial] : real;
  }

  function _allIterEvents() {
    // Server mode: track the raw event list inside _state. Standalone mode:
    // synthesize nothing — all entries land in initial.
    return Array.isArray(getState().iterEvents) ? getState().iterEvents : [];
  }

  function _formatIterMeta(iter, isInitial) {
    const count = iter.entryIds.filter((id) => !getState().removed.includes(id)).length;
    if (isInitial) return `${count} note${count === 1 ? '' : 's'}`;
    if (!iter.endTs) return `${count} note${count === 1 ? '' : 's'} · ${_hhmm(iter.startTs)}–now · open`;
    return `${count} note${count === 1 ? '' : 's'} · ${_hhmm(iter.startTs)}–${_hhmm(iter.endTs)}`;
  }

  function _hhmm(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  function _render() {
    const list = document.querySelector('[data-domini-rail-list]');
    if (!list) return;
    list.innerHTML = '';
    // Filter out removed entries first.
    const visibleEntries = getState().entries.filter((e) => !getState().removed.includes(e.id));
    if (visibleEntries.length === 0) return;

    const iters = _currentIters();
    // Order: real iterations newest-first, then "initial" last.
    const realIters = iters.filter((it) => !it.isInitial).sort((a, b) => b.id - a.id);
    const initial = iters.find((it) => it.isInitial);
    for (const it of realIters) {
      // Skip empty iterations.
      if (it.entryIds.every((id) => getState().removed.includes(id))) continue;
      list.appendChild(_renderIteration(it, false));
    }
    if (initial && initial.entryIds.some((id) => !getState().removed.includes(id))) {
      list.appendChild(_renderIteration(initial, true));
    }
  }

  _internals.render = _render;
})();
