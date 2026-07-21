/* DOMicile audit runtime — see docs/AUDIT.md (Phase 2b: server-attached mode). */
(function () {
  const STORAGE_PREFIX = 'domicile:';
  const SERVER = !!(typeof window !== 'undefined' && window.__DOMI_SERVER__ === true);

  function loadEntries(docName) {
    if (SERVER) {
      // In server mode, hydrate via fetch and filter to domi-audit.js rail events.
      // Async; resolved via fetchFromServer below.
      return null;
    }
    const raw = localStorage.getItem(STORAGE_PREFIX + docName);
    if (!raw) return { version: 1, name: docName, entries: [], removed: [] };
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.removed)) parsed.removed = [];
      return parsed;
    } catch { return { version: 1, name: docName, entries: [], removed: [] }; }
  }

  function saveEntries(docName, state) {
    if (SERVER) return; // Read-only mirror.
    localStorage.setItem(STORAGE_PREFIX + docName, JSON.stringify(state));
  }

  let _state = { version: 1, name: '', entries: [], removed: [], iterEvents: [] };
  let _docName = '';
  let _statePath = '';
  let _hydrationDone = false;
  let _activeTargetId = null;

  function fetchFromServer(docName) {
    if (!SERVER || typeof fetch === 'undefined') return Promise.resolve(_state);
    if (!window.location?.origin) return Promise.resolve(_state);
    const url = window.location.origin + '/api/events?doc=' + encodeURIComponent(docName) + '&limit=1000';
    return fetch(url)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((body) => {
        const events = (body.events || [])
          .filter((e) => (
            (e.src === 'domi-audit.js' && (e.kind === 'rail-add' || e.kind === 'rail-resolve' || e.kind === 'rail-remove'))
            || (e.kind === 'agent-iterating')
          ));
        const entries = [];
        const removed = new Set(_state.removed || []);
        // _state.iterEvents must include both rail-add and agent-iterating
        // events — computeIterations buckets rail-adds by the iter windows
        // that are open at their ts, so it needs to see the rail-adds too.
        // (Brief suggested filtering to only agent-iterating; that's the
        // 4th brief bug — see task-5-report.md.)
        const iterEvents = [];
        for (const e of events) {
          if (e.kind === 'rail-add') {
            entries.push({
              id: e.id,
              targetId: (e.data && e.data.targetId) || null,
              author: 'user',
              timestamp: e.ts,
              body: (e.data && e.data.body) || '',
              resolved: false,
            });
            iterEvents.push(e);
          } else if (e.kind === 'rail-remove') {
            const entryId = e.data && e.data.entryId;
            if (entryId) removed.add(entryId);
          } else if (e.kind === 'agent-iterating') {
            iterEvents.push(e);
          }
        }
        // Deduplicate entries by id.
        const seen = new Set();
        const merged = entries.filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
        return { version: 1, name: docName, entries: merged, removed: Array.from(removed), iterEvents: iterEvents.sort((a, b) => (a.ts || '').localeCompare(b.ts || '')) };
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

  const REF_RE = /@([0-9A-HJKMNP-TV-Z]{4,7})(?![0-9A-HJKMNP-TV-Z])/g;

  function parseRefs(body, knownShorts) {
    const segments = [];
    let lastIndex = 0;
    let m;
    REF_RE.lastIndex = 0;
    while ((m = REF_RE.exec(body)) !== null) {
      const candidate = m[1];
      if (knownShorts.has(candidate)) {
        if (m.index > lastIndex) {
          segments.push({ kind: 'text', value: body.slice(lastIndex, m.index) });
        }
        segments.push({ kind: 'ref', value: m[0], refId: candidate });
        lastIndex = m.index + m[0].length;
      }
      // If not a known short, the @... stays as part of the surrounding text segment.
    }
    if (lastIndex < body.length) {
      segments.push({ kind: 'text', value: body.slice(lastIndex) });
    }
    if (segments.length === 0) segments.push({ kind: 'text', value: '' });
    return segments;
  }

  function computeIterations(events) {
    const sorted = [...events].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
    const iters = [];
    let open = null; // index into iters, or null
    let initial = { id: -1, startTs: null, endTs: null, entryIds: [], isInitial: true };
    iters.push(initial);

    for (const e of sorted) {
      if (e.kind === 'agent-iterating' && e.data && (e.data.state === 'start' || e.data.state === 'end')) {
        if (e.data.state === 'start') {
          // Auto-close the prior open iteration (if any) at this start's ts.
          if (open !== null) iters[open].endTs = e.ts;
          const idx = iters.length;
          iters.push({ id: iters.length, startTs: e.ts, endTs: null, entryIds: [], isInitial: false });
          open = idx;
        } else {
          // end. If there's an open iteration, close it.
          if (open !== null) {
            iters[open].endTs = e.ts;
            open = null;
          }
          // else: end without a preceding start — ignore.
        }
      } else if (e.kind === 'rail-add') {
        // Sticky rule: bucket to the most recently opened real iteration, or the
        // synthetic initial group if no iteration has been opened yet.
        const bucket = iters.length > 1 ? iters[iters.length - 1] : initial;
        bucket.entryIds.push(e.id);
      }
      // other event kinds: ignored for iteration purposes.
    }

    // Drop the synthetic initial group if it has no entries.
    if (initial.entryIds.length === 0) iters.shift();
    // Reassign 1-based ids (the initial group used -1 as a placeholder).
    iters.forEach((it, i) => { it.id = i + 1; });
    return iters;
  }

  // Crockford base-32 alphabet (no I, L, O, U).
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  // 10 chars of timestamp + 16 chars of randomness = 26 chars total.
  // Time-sortable like ULID, but local. Server stamps canonical ULIDs in
  // server mode; this only runs in standalone.
  function genLocalId() {
    let s = '';
    let n = Date.now();
    for (let i = 0; i < 10; i++) {
      s = B32[n & 0x1f] + s;
      n = Math.floor(n / 32);
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const b of bytes) s += B32[b & 0x1f];
    return s;
  }

  // Build the set of 6-char shorts known in the session.
  function _knownShorts() {
    const s = new Set();
    for (const e of _state.entries) s.add(e.id.slice(0, 6));
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
        if (_state.removed.includes(_resolveShort(seg.refId))) {
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
    for (const e of _state.entries) {
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
    if (_state.removed.includes(targetId)) return;
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
    const visibleEntries = _state.entries.filter((e) => {
      if (_state.removed.includes(e.id)) return false;
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
      if (_state.entries.length === 0) return [];
      return [{
        id: 1, startTs: null, endTs: null,
        entryIds: _state.entries.map((e) => e.id),
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
    return Array.isArray(_state.iterEvents) ? _state.iterEvents : [];
  }

  function _formatIterMeta(iter, isInitial) {
    const count = iter.entryIds.filter((id) => !_state.removed.includes(id)).length;
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
    const visibleEntries = _state.entries.filter((e) => !_state.removed.includes(e.id));
    if (visibleEntries.length === 0) return;

    const iters = _currentIters();
    // Order: real iterations newest-first, then "initial" last.
    const realIters = iters.filter((it) => !it.isInitial).sort((a, b) => b.id - a.id);
    const initial = iters.find((it) => it.isInitial);
    for (const it of realIters) {
      // Skip empty iterations.
      if (it.entryIds.every((id) => _state.removed.includes(id))) continue;
      list.appendChild(_renderIteration(it, false));
    }
    if (initial && initial.entryIds.some((id) => !_state.removed.includes(id))) {
      list.appendChild(_renderIteration(initial, true));
    }
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
      if (!Array.isArray(_state.iterEvents)) _state.iterEvents = [];
      _state.iterEvents.push(event);
      _state.iterEvents.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
      _render();
    } else if (event.kind === 'rail-remove') {
      const entryId = event.data && event.data.entryId;
      if (entryId && !_state.removed.includes(entryId)) {
        _state.removed.push(entryId);
      }
      _render();
    } else if (event.kind === 'rail-resolve') {
      const entryId = event.data && event.data.entryId;
      const idx = _state.entries.findIndex((e) => e.id === entryId);
      if (idx >= 0) {
        _state.entries[idx] = Object.assign({}, _state.entries[idx], { resolved: true });
        _render();
      }
    } else if (event.kind === 'agent-iterating') {
      if (!Array.isArray(_state.iterEvents)) _state.iterEvents = [];
      _state.iterEvents.push(event);
      _state.iterEvents.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
      _render();
    }
  }

  function mount({ statePath, docName }) {
    const rail = document.querySelector('[data-domini-rail]');
    if (rail && !rail.querySelector('[data-domini-rail-form]')) {
      const form = document.createElement('form');
      form.setAttribute('data-domini-rail-form', '');
      form.innerHTML = `
        <div data-domini-target-hint style="font-size:12px;opacity:.7;margin-bottom:4px;">
          Targeting: <strong data-domini-target-id>(doc — click an element)</strong>
        </div>
        <textarea name="body" rows="2" placeholder="Comment on this doc…"></textarea>
        <button type="submit">Add</button>
      `;
      rail.appendChild(form);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const body = form.elements['body'].value.trim();
        if (!body) return;
        addComment({ targetId: _activeTargetId, body });
        form.elements['body'].value = '';
        setActiveTarget(null);
      });

      document.addEventListener('click', (ev) => {
        if (ev.target.closest('aside[data-domini-rail]')) return;
        if (ev.target.closest('form')) return;
        const el = ev.target.closest('[data-feedback]');
        if (!el) { setActiveTarget(null); return; }
        setActiveTarget(el.getAttribute('data-feedback'), el);
      });
      function setActiveTarget(id, el) {
        _activeTargetId = id || null;
        const hint = rail.querySelector('[data-domini-target-id]');
        if (hint) hint.textContent = id ? `${id}` : '(doc — click an element)';
        document.querySelectorAll('[data-feedback][data-domini-target]').forEach((n) => {
          n.removeAttribute('data-domini-target');
        });
        if (el) el.setAttribute('data-domini-target', '');
      }
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
        const removed = new Set([
          ...(bootMirror.removed || []),
          ...(serverState.removed || []),
        ]);
        _state = {
          version: 1, name: docName,
          entries: Array.from(byId.values()),
          removed: Array.from(removed),
          iterEvents: serverState.iterEvents || [],
        };
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
    if (!raw) return { version: 1, name: docName, entries: [], removed: [] };
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.removed)) parsed.removed = [];
      return parsed;
    } catch { return { version: 1, name: docName, entries: [], removed: [] }; }
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
      id: genLocalId(),
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

  function removeEntry(entryId) {
    if (!entryId) return;
    if (SERVER) {
      postRail({
        kind: 'rail-remove',
        target: null,
        data: { entryId },
      });
      return;
    }
    // No-op for entryIds not present in _state.entries (avoids littering
    // _state.removed with stale ULIDs from typos or replayed WS events).
    if (!_state.entries.some((e) => e.id === entryId)) return;
    if (!_state.removed.includes(entryId)) {
      _state.removed.push(entryId);
    }
    saveEntries(_docName, _state);
    _render();
  }

  function exportJSON() {
    const visibleEntries = _state.entries.filter((e) => !_state.removed.includes(e.id));
    const out = Object.assign({}, _state, { entries: visibleEntries });
    if (SERVER) return JSON.stringify(out);
    return JSON.stringify(out);
  }

  globalThis.DomiAudit = { mount, addComment, resolveEntry, removeEntry, export: exportJSON, _internals: { computeIterations, parseRefs } };
})();