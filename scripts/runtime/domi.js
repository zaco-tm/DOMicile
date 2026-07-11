/* DOMicile standalone + server-attached runtime — Phase 1 + Phase 2b.
   In standalone mode (no window.__DOMI_SERVER__): localStorage.
   In server mode: POST v2 wire events via domi-wire. */
(function () {
  'use strict';

  var page = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/, '') || 'index';
  var eventsKey = 'domi:events:' + page;
  var inputsKey = 'domi:inputs:' + page;
  var SERVER = !!(typeof window !== 'undefined' && window.__DOMI_SERVER__ === true);

  function isOurClick(event) {
    return event && event.kind === 'click' && event.src === 'domi.js';
  }
  function isOurInput(event) {
    return event && event.kind === 'input' && event.src === 'domi.js';
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (_) { return fallback; }
  }
  function writeJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  // Phase 1: append to localStorage.
  function logEventLocal(ev) {
    var events = readJSON(eventsKey, []);
    events.push(Object.assign({ ts: new Date().toISOString(), page: page }, ev));
    writeJSON(eventsKey, events);
  }

  // Phase 2b server mode: POST a v2 event. ULID stamping is the server's job.
  function postEventV2(ev) {
    var body = Object.assign({
      v: 2,
      id: null,
      ts: new Date().toISOString(),
      src: 'domi.js',
      doc: page,
    }, ev);
    return fetch(location.origin + '/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(function (e) { console.warn('domi.js: post failed', e); });
  }

  function toClickV2(selector, tag, text) {
    return {
      kind: 'click',
      target: { id: selector || null, selector: null, rect: null },
      data: { value: text || null },
    };
  }
  function toInputV2(name, value) {
    return {
      kind: 'input',
      target: { id: name || null, selector: null, rect: null },
      data: { name: name, value: value },
    };
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function init() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== document) {
        if (t.getAttribute && t.getAttribute('data-feedback')) {
          var selector = t.getAttribute('data-feedback');
          var tag = t.tagName.toLowerCase();
          var text = (t.textContent || '').trim().slice(0, 80);
          if (SERVER) {
            postEventV2(toClickV2(selector, tag, text));
          } else {
            logEventLocal({ type: 'click', selector: selector, tag: tag, text: text });
          }
          break;
        }
        t = t.parentNode;
      }
      if (t && t.getAttribute && t.getAttribute('data-export-feedback')) {
        var url = window.DOMi.exportFeedback();
        var a = document.createElement('a');
        a.href = url;
        a.download = page + '-feedback.jsonl';
        a.click();
      }
    });

    var saveInputs = debounce(function () {
      var inputs = {};
      document.querySelectorAll('input[name], textarea[name], select[name]').forEach(function (el) {
        inputs[el.name] = el.value;
      });
      if (SERVER) {
        var entries = Object.keys(inputs).map(function (name) {
          return toInputV2(name, inputs[name]);
        });
        Promise.all(entries.map(function (ev) {
          return fetch(location.origin + '/api/events', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(Object.assign({ v: 2, id: null, ts: new Date().toISOString(), src: 'domi.js', doc: page }, ev)),
          }).catch(function (e) { console.warn('domi.js: input post failed', e); });
        }));
        // Boot mirror — read once on first server-mode load.
        var cached = readJSON(inputsKey, null);
        if (cached) {
          // Replay cached inputs into the form fields. One-shot.
          Object.keys(cached).forEach(function (name) {
            var el = document.querySelector('[name="' + name + '"]');
            if (el) el.value = cached[name];
          });
        }
      } else {
        writeJSON(inputsKey, inputs);
      }
    }, 300);

    document.addEventListener('input', saveInputs);
  }

  function exportFeedback() {
    if (SERVER) {
      // Build a JSONL string from server-fetched events.
      return fetch(location.origin + '/api/events?doc=' + encodeURIComponent(page) + '&limit=1000')
        .then(function (r) { return r.ok ? r.json() : { events: [], nextSince: null }; })
        .then(function (body) {
          var events = (body.events || []).filter(isOurClick);
          var inputs = (body.events || []).filter(isOurInput);
          var lines = events.map(function (e) { return JSON.stringify({ type: 'click', selector: (e.target && e.target.id) || '', text: (e.data && e.data.value) || '', ts: e.ts }); });
          inputs.forEach(function (e) {
            lines.push(JSON.stringify({ type: 'input', name: e.data.name, value: e.data.value, ts: e.ts }));
          });
          var blob = new Blob([lines.join('\n') + '\n'], { type: 'application/jsonl' });
          return URL.createObjectURL(blob);
        })
        .catch(function () {
          return URL.createObjectURL(new Blob([''], { type: 'application/jsonl' }));
        });
    }
    var events = readJSON(eventsKey, []);
    var inputs = readJSON(inputsKey, {});
    var lines = events.map(function (e) { return JSON.stringify(e); });
    Object.keys(inputs).forEach(function (name) {
      lines.push(JSON.stringify({ type: 'input', name: name, value: inputs[name], ts: new Date().toISOString(), page: page }));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'application/jsonl' });
    return URL.createObjectURL(blob);
  }

  window.DOMi = { exportFeedback: exportFeedback, eventsKey: eventsKey, inputsKey: inputsKey };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();