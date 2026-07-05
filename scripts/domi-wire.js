/* DOMiNice wire helpers — server-mode JSON envelope IO.
   Pure stateless functions used by domi.js and domi-audit.js in server mode.
   Phase 2b. */

export function isServerMode() {
  return !!(
    typeof window !== 'undefined' &&
    window.__DOMI_SERVER__ === true
  );
}

export function serverOrigin() {
  if (typeof window === 'undefined') return null;
  return window.location?.origin ?? null;
}

function postJSON(url, body) {
  if (typeof fetch === 'undefined') return Promise.reject(new Error('fetch unavailable'));
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => {
    if (!r.ok) {
      return r.text().then((t) => {
        throw new Error(`POST ${url} → ${r.status} ${r.statusText}: ${t}`);
      });
    }
    return r;
  });
}

function getJSON(url) {
  if (typeof fetch === 'undefined') return Promise.reject(new Error('fetch unavailable'));
  return fetch(url, undefined).then((r) => {
    if (!r.ok) {
      return r.text().then((t) => {
        throw new Error(`GET ${url} → ${r.status} ${r.statusText}: ${t}`);
      });
    }
    return r.json();
  });
}

export function postEvent(event) {
  const origin = serverOrigin();
  if (!origin) return Promise.reject(new Error('no origin (not in a browser)'));
  return postJSON(origin + '/api/events', event);
}

export function getEvents({ since, doc, limit } = {}) {
  const origin = serverOrigin();
  if (!origin) return Promise.reject(new Error('no origin (not in a browser)'));
  const params = [];
  if (since) params.push('since=' + encodeURIComponent(since));
  if (doc) params.push('doc=' + encodeURIComponent(doc));
  if (limit != null) params.push('limit=' + encodeURIComponent(limit));
  const url = origin + '/api/events' + (params.length ? '?' + params.join('&') : '');
  return getJSON(url);
}

export function onServerEvent(cb) {
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => cb(e.detail);
  window.addEventListener('domi-event', handler);
  return () => window.removeEventListener('domi-event', handler);
}

export function onServerOpen(cb) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener('domi-server-open', handler);
  return () => window.removeEventListener('domi-server-open', handler);
}