/* DOMiNice standalone runtime — Phase 1
   Captures clicks/inputs to localStorage; exports as JSONL.
   Server-attached mode (window.__DOMI_SERVER__) is Phase 2. */
(function () {
  'use strict';

  var page = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/, '') || 'index';
  var eventsKey = 'domi:events:' + page;
  var inputsKey = 'domi:inputs:' + page;

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (_) { return fallback; }
  }
  function writeJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function logEvent(ev) {
    var events = readJSON(eventsKey, []);
    events.push(Object.assign({ ts: new Date().toISOString(), page: page }, ev));
    writeJSON(eventsKey, events);
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
    // Event delegation — works for elements added before or after init.
    document.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== document) {
        if (t.getAttribute && t.getAttribute('data-feedback')) {
          logEvent({
            type: 'click',
            selector: t.getAttribute('data-feedback'),
            tag: t.tagName.toLowerCase(),
            text: (t.textContent || '').trim().slice(0, 80)
          });
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
      writeJSON(inputsKey, inputs);
    }, 300);

    document.addEventListener('input', saveInputs);
  }

  function exportFeedback() {
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
