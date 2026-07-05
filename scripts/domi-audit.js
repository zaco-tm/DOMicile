/* DOMiNice audit runtime — see docs/AUDIT.md */
(function () {
  const STORAGE_PREFIX = 'dominice:';

  function loadEntries(docName) {
    const raw = localStorage.getItem(STORAGE_PREFIX + docName);
    if (!raw) return { version: 1, name: docName, entries: [] };
    try { return JSON.parse(raw); } catch { return { version: 1, name: docName, entries: [] }; }
  }

  function saveEntries(docName, state) {
    localStorage.setItem(STORAGE_PREFIX + docName, JSON.stringify(state));
  }

  let _state = { version: 1, name: '', entries: [] };
  let _docName = '';
  let _statePath = '';

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
    _state = loadEntries(docName);
    _docName = docName;
    _statePath = statePath;
    _render();
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

  function addComment({ targetId, body }) {
    if (!_docName) return;
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

  function exportJSON() {
    return JSON.stringify(_state);
  }

  globalThis.DomiAudit = { mount, addComment, export: exportJSON };
})();