import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { isServerMode, serverOrigin, postEvent, getEvents, onServerEvent } from '../scripts/domi-wire.js';

describe('domi-wire.js helpers', () => {
  beforeEach(() => {
    delete globalThis.window;
    delete globalThis.__DOMI_SERVER__;
  });
  afterEach(() => {
    delete globalThis.fetch;
  });

  it('isServerMode false when window missing', () => {
    expect(isServerMode()).toBe(false);
  });

  it('isServerMode true when window.__DOMI_SERVER__ === true', () => {
    globalThis.window = { __DOMI_SERVER__: true };
    expect(isServerMode()).toBe(true);
  });

  it('isServerMode false when window.__DOMI_SERVER__ === false', () => {
    globalThis.window = { __DOMI_SERVER__: false };
    expect(isServerMode()).toBe(false);
  });

  it('isServerMode false when window.__DOMI_SERVER__ not a boolean', () => {
    globalThis.window = { __DOMI_SERVER__: 'yes' };
    expect(isServerMode()).toBe(false);
  });

  it('serverOrigin returns null when window missing', () => {
    expect(serverOrigin()).toBe(null);
  });

  it('serverOrigin returns window.location.origin when present', () => {
    globalThis.window = { location: { origin: 'http://localhost:4173' } };
    expect(serverOrigin()).toBe('http://localhost:4173');
  });

  it('postEvent posts JSON to <origin>/api/events', async () => {
    globalThis.window = { location: { origin: 'http://x' } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    globalThis.fetch = fetchMock;
    const ev = { v: 2, kind: 'click', data: { value: 'x' } };
    await postEvent(ev);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://x/api/events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
        body: JSON.stringify(ev),
      })
    );
  });

  it('postEvent rejects on non-2xx', async () => {
    globalThis.window = { location: { origin: 'http://x' } };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, statusText: 'bad', text: async () => 'err body' });
    await expect(postEvent({ kind: 'x' })).rejects.toThrow(/400/);
  });

  it('postEvent rejects if fetch is unavailable', async () => {
    globalThis.window = { location: { origin: 'http://x' } };
    delete globalThis.fetch;
    await expect(postEvent({ kind: 'x' })).rejects.toThrow(/fetch/i);
  });

  it('getEvents parses { events, nextSince } response', async () => {
    globalThis.window = { location: { origin: 'http://x' } };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ events: [{ id: 'a' }], nextSince: 'b' }),
    });
    const r = await getEvents({ doc: 'foo' });
    expect(r.events).toHaveLength(1);
    expect(r.nextSince).toBe('b');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('doc=foo'), undefined);
  });

  it('onServerEvent subscribes and returns unsubscribe', () => {
    let listener;
    globalThis.window = { addEventListener: (name, cb) => { listener = { name, cb }; }, removeEventListener: vi.fn() };
    const cb = vi.fn();
    const unsubscribe = onServerEvent(cb);
    expect(listener.name).toBe('domi-event');
    listener.cb({ detail: { x: 1 } });
    expect(cb).toHaveBeenCalledWith({ x: 1 });
    unsubscribe();
    expect(globalThis.window.removeEventListener).toHaveBeenCalled();
  });

  it('getEvents URL includes limit and since when provided', async () => {
    globalThis.window = { location: { origin: 'http://x' } };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ events: [], nextSince: null }) });
    await getEvents({ since: '01Z', limit: 50 });
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('since=01Z');
    expect(url).toContain('limit=50');
  });

  it('getEvents rejects on non-2xx', async () => {
    globalThis.window = { location: { origin: 'http://x' } };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'srv', text: async () => '' });
    await expect(getEvents({})).rejects.toThrow(/500/);
  });
});