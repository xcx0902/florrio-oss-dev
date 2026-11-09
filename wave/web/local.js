// Keep the October build on loopback while preserving its original URL checks.
(() => {
  if (location.protocol !== 'http:' || location.hostname !== 'localhost') {
    return;
  }

  // Restore only the original presentation cache before the October Wasm loads.
  // The bearer token selects the durable server profile; socket mutations validate ownership.
  try {
    const cached = new XMLHttpRequest();
    cached.open('GET', '/wave/cache/' + (localStorage.getItem('cp6_player_id') || ''), false);
    cached.send();
    if (cached.status === 200) {
      const profile = JSON.parse(cached.responseText);
      localStorage.setItem('cp6_player_id', profile.token);
      localStorage.setItem('cached_inventory', profile.inventory);
      localStorage.setItem('cached_level', profile.level);
      localStorage.setItem('cached_num_petals', profile.numPetals);
      localStorage.setItem('cached_equipped', profile.equipped);
    }
  } catch {
    /* W2 and unavailable storage fall back to normal client admission. */
  }

  const gardenDiscovery = '/endpoint/florrio-waves-0/findEach/';
  const rotatingDiscovery = '/endpoint/florrio-waves-1/findEach/';
  let ocean = new URLSearchParams(location.search).get('biome') === 'ocean';
  if (ocean) {
    localStorage.setItem('florrio_gamemode', '1');
  }
  let biome =
    localStorage.getItem('florrio_gamemode') === '1' ? (ocean ? 'ocean' : 'desert') : 'garden';
  const selector = document.createElement('select');
  selector.setAttribute('aria-label', 'Wave biome');
  selector.style.cssText =
    'position:fixed;top:8px;left:168px;z-index:10;padding:3px 6px;' +
    'font:600 13px Ubuntu,sans-serif;color:white;background:#202020b8;' +
    'border:1px solid #ffffff70;border-radius:4px;color-scheme:dark';
  for (const name of ['Garden', 'Desert', 'Ocean']) {
    selector.add(new Option(name, name.toLowerCase()));
  }
  selector.value = biome;
  const switchBiome = (name) => {
    localStorage.setItem('florrio_gamemode', name === 'garden' ? '0' : '1');
    const url = new URL(location.href);
    if (name === 'ocean') {
      url.searchParams.set('biome', 'ocean');
    } else {
      url.searchParams.delete('biome');
    }
    url.hash = '';
    location.replace(url);
  };
  selector.addEventListener('change', () => switchBiome(selector.value));
  document.body.append(selector);
  const suspended = new WeakSet();
  let modeNotice;
  function unsupportedMode() {
    if (modeNotice) {
      return;
    }
    modeNotice = document.createElement('dialog');
    modeNotice.id = 'wave-mode-notice';
    const title = document.createElement('h1');
    title.textContent = 'PvP unavailable';
    const description = document.createElement('p');
    description.textContent = 'Choose Garden, Desert, or Ocean to play Waves.';
    const recover = document.createElement('button');
    recover.textContent = 'Return to Garden';
    recover.addEventListener('click', () => switchBiome('garden'));
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
    if (method === 'GET' && original === 'https://api.n.m28.io/endpoint/florrio-pvp/findEach/') {
      // Suspend this unavailable discovery, without invoking the original
      // client's network-error retry callback or contacting the retired API.
      suspended.add(this);
      unsupportedMode();
      return open.call(this, method, gardenDiscovery, ...options);
    }
    const garden = original === `https://api.n.m28.io${gardenDiscovery}`;
    const rotating = original === `https://api.n.m28.io${rotatingDiscovery}`;
    if (method === 'GET' && (garden || rotating)) {
      if (garden && ocean) {
        const url = new URL(location.href);
        url.searchParams.delete('biome');
        history.replaceState(history.state, '', url);
        ocean = false;
      }
      biome = garden ? 'garden' : ocean ? 'ocean' : 'desert';
      selector.value = biome;
    }
    const local =
      method === 'GET' &&
      (garden || rotating || original === 'https://api.n.m28.io/server/wavelocal');
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
      const suffix = biome === 'garden' ? '' : `/${biome}`;
      super(local ? `ws://${location.host}/wave/socket${suffix}` : url, protocols);
      if (local) {
        Object.defineProperty(this, 'url', { value: original });
      }
    }
  };
})();
