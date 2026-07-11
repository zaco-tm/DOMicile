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
  let _activeTargetId = null;

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