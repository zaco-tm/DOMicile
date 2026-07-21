(() => {
  if (window.__DOMI_SERVER__) return;
  window.__DOMI_SERVER__ = true;
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/events';
  let socket;
  function connect() {
    socket = new WebSocket(url);
    socket.addEventListener('open', () => {
      dispatchEvent(new CustomEvent('domi-server-open'));
      socket.send(JSON.stringify({ type: 'subscribe', path: location.pathname }));
    });
    socket.addEventListener('close', () => setTimeout(connect, 500));
    socket.addEventListener('error', () => setTimeout(connect, 500));
    socket.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg && msg.type === 'event' && msg.event) {
          dispatchEvent(new CustomEvent('domi-event', { detail: msg.event }));
        } else if (msg && msg.type === 'reload') {
          location.reload();
        }
      } catch (_) {}
    });
  }
  window.DomiServer = {
    export() { return new Promise(() => {}); },
    subscribe(cb) { addEventListener('domi-event', (ev) => cb(ev.detail)); },
  };
  connect();
})();