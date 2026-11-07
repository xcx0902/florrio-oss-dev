// Keep the October build on loopback while preserving its original URL checks.
(() => {
  if (location.protocol !== 'http:' || location.hostname !== 'localhost') {
    return;
  }

  const discoveryPath = '/endpoint/florrio-waves-0/findEach/';
  const unsupportedDiscovery = new Set([
    'https://api.n.m28.io/endpoint/florrio-waves-1/findEach/',
    'https://api.n.m28.io/endpoint/florrio-pvp/findEach/',
  ]);
  const suspended = new WeakSet();
  let modeNotice;
  function unsupportedMode() {
    if (modeNotice) {
      return;
    }
    modeNotice = document.createElement('dialog');
    modeNotice.id = 'wave-mode-notice';
    const title = document.createElement('h1');
    title.textContent = 'Garden only';
    const description = document.createElement('p');
    description.textContent =
      'This local W2 build supports Garden. Desert and PvP are not available yet.';
    const recover = document.createElement('button');
    recover.textContent = 'Return to Garden';
    recover.addEventListener('click', () => {
      localStorage.setItem('florrio_gamemode', '0');
      location.replace(location.pathname);
    });
    modeNotice.append(title, description, recover);
    document.body.append(modeNotice);
    modeNotice.addEventListener('cancel', (event) => event.preventDefault());
    modeNotice.showModal();
    recover.focus();
  }
  for (const type of ['keydown', 'keyup']) {
    window.addEventListener(
      type,
      (event) => {
        if (modeNotice?.open) {
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  }
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...options) {
    const original = String(url);
    suspended.delete(this);
    if (method === 'GET' && unsupportedDiscovery.has(original)) {
      // Suspend this unavailable discovery, without invoking the original
      // client's network-error retry callback or contacting the retired API.
      suspended.add(this);
      unsupportedMode();
      return open.call(this, method, discoveryPath, ...options);
    }
    const local =
      method === 'GET' &&
      (original === `https://api.n.m28.io${discoveryPath}` ||
        original === 'https://api.n.m28.io/server/wavelocal');
    return open.call(this, method, local ? new URL(original).pathname : url, ...options);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (!suspended.has(this)) {
      return send.apply(this, args);
    }
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
