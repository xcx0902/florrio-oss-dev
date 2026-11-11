// Keep the October build on loopback while preserving its original URL checks.
(() => {
  if (location.protocol !== 'http:' || location.hostname !== 'localhost') {
    return;
  }

  // Adapt the pinned October client in memory; the served Wasm is unchanged.
  // $597 scales fixed-size world art, and $991 skips the local AFK timer.
  const uleb = (value) => {
    const bytes = [];
    do {
      const next = value & 0x7f;
      value >>>= 7;
      bytes.push(next | (value ? 0x80 : 0));
    } while (value);
    return bytes;
  };
  const artScale = (types, baseRadius) => {
    // $0 = type component, $1 = canvas state, $2 = entity.
    const test = types.flatMap((type, i) => [
      0x20, 0, 0x2d, 0, 8, 0x41, type, 0x46, // type->id == type
      ...(i ? [0x72] : []),                   // i32.or
    ]);
    const radius = [0x20, 2, 0x28, 2, 92];   // entity->radius component
    const base = new Uint8Array(4);
    new DataView(base.buffer).setFloat32(0, baseRadius, true);
    const basis = [0, 4, 8, 12].flatMap((offset) => [
      0x20, 1, 0x20, 1, 0x2a, 2, offset,    // &matrix, matrix[offset]
      ...radius, 0x2a, 2, 8, 0x43, ...base, // radius->value, baseRadius
      0x95, 0x94, 0x38, 2, offset,          // divide, multiply, store f32
    ]);
    return [
      ...test, 0x04, 0x40, ...radius, 0x04, 0x40, ...basis,
      0x20, 1, 0x41, 1, 0x3a, 0, 48,      // mark canvas transform dirty
      0x0b, 0x0b,
    ];
  };
  const adaptWaveClient = (wasm) => {
    const missile = artScale([9], 15);
    const fixedMobs = artScale([5, 6, 7, 8, 18, 23], 35);
    const growth = missile.length + fixedMobs.length;
    const petalBranch = [0x20, 2, 0x28, 2, 108, 0x22, 0, 0x04, 0x40];
    const mobBranch = [0x20, 2, 0x28, 2, 124, 0x22, 0, 0x45, 0x0d, 0];
    const idleBranch = [0x02, 0x40, 0x02, 0x40, 0x20, 11, 0x45, 0x0d, 0];
    const edits = [
      [18538, uleb(2330231), uleb(2330231 + growth)], // Code section size
      [580942, uleb(8411), uleb(8411 + growth)],      // $597 body size
      [580944 + 4921, petalBranch, [...petalBranch, ...missile]],
      [580944 + 8174, mobBranch, [...mobBranch, ...fixedMobs]],
      // Always take $991's existing path that clears the AFK deadline.
      [1436535 + 4217, idleBranch, [0x02, 0x40, 0x02, 0x40, 0x41, 0, 0x45, 0x0d, 0]],
    ];
    const result = new Uint8Array(wasm.length + growth);
    let input = 0;
    let output = 0;
    for (const [offset, before, after] of edits) {
      if (!before.every((byte, i) => wasm[offset + i] === byte)) {
        throw new Error('Wave runtime fixes require the pinned October client');
      }
      result.set(wasm.subarray(input, offset), output);
      output += offset - input;
      result.set(after, output);
      output += after.length;
      input = offset + before.length;
    }
    result.set(wasm.subarray(input), output);
    return result;
  };
  const instantiateStreaming = WebAssembly.instantiateStreaming;
  if (instantiateStreaming) {
    WebAssembly.instantiateStreaming = async (source, imports, ...options) => {
      const response = await source;
      if (response.url !== new URL('/client.wasm', location.href).href || !response.ok) {
        return instantiateStreaming(response, imports, ...options);
      }
      const wasm = adaptWaveClient(new Uint8Array(await response.arrayBuffer()));
      return WebAssembly.instantiate(wasm, imports, ...options);
    };
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
