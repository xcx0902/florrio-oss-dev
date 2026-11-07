// Keep the October build on loopback while preserving its original URL checks.
(() => {
  if (location.protocol !== 'http:' || location.hostname !== 'localhost') {
    return;
  }

  const discoveryPath = '/endpoint/florrio-waves-0/findEach/';
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...options) {
    const original = String(url);
    const local =
      method === 'GET' &&
      (original === `https://api.n.m28.io${discoveryPath}` ||
        original === 'https://api.n.m28.io/server/wavelocal');
    return open.call(this, method, local ? new URL(original).pathname : url, ...options);
  };

  const NativeSocket = window.WebSocket;
  window.WebSocket = class extends NativeSocket {
    constructor(url, protocols) {
      const original = new URL(url, location.href).href;
      const local =
        original === 'ws://127.0.0.1:443/' || original === 'wss://wavelocal.s.m28n.net/';
      super(local ? `ws://${location.host}/wave/socket` : url, protocols);
      if (local) {
        Object.defineProperty(this, 'url', { value: original });
      }
    }
  };
})();
