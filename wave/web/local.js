// Keep the October build on loopback while preserving its original URL checks.
(() => {
  if (location.protocol !== 'http:' || location.hostname !== 'localhost') {
    return;
  }

  // Adapt the pinned October client in memory; the served Wasm is unchanged.
  // $597 and $1795 fit world art to the wire radius; $991 skips the AFK timer.
  const uleb = (value) => {
    const bytes = [];
    do {
      const next = value & 0x7f;
      value >>>= 7;
      bytes.push(next | (value ? 0x80 : 0));
    } while (value);
    return bytes;
  };
  const f32 = (value) => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setFloat32(0, value, true);
    return [0x43, ...bytes];
  };
  const branch = (condition, body) => [...condition, 0x04, 0x40, ...body, 0x0b];
  // In $597, $0 is the type component, $1 is the canvas state, $2 is the entity.
  const typeIs = (id) => [0x20, 0, 0x2d, 0, 8, 0x41, id, 0x46];
  const radius = [0x20, 2, 0x28, 2, 92];
  const radiusRatio = (base) => [...radius, 0x2a, 2, 8, ...f32(base), 0x95];
  const scaleBasis = (factor) => [
    ...[0, 4, 8, 12].flatMap((offset) => [
      0x20, 1, 0x20, 1, 0x2a, 2, offset, // &matrix, matrix[offset]
      ...factor, 0x94, 0x38, 2, offset,  // multiply and store f32
    ]),
    0x20, 1, 0x41, 1, 0x3a, 0, 48,     // mark canvas transform dirty
  ];
  const mobArt = () => {
    // Match the solid body to the collision diameter; keep native proportions
    // and decorations. Linked Leech art is calibrated inside $1795 instead.
    const scales = [
      1,                               // Reserved ID 0
      .91, .98, .91, .83,              // Rock, Cactus, Ladybug, Bee
      1.82, 1.62, 1.62, .82,           // Baby, Worker, Soldier, Queen Ant
      .91, .94, .79,                   // Ant Hole, Beetle, Hornet
      1, 1, 1, 1, 1, 1,               // Centipedes: bodies meet at the collision radius
      1.28, .91, .91,                  // Square, Dark Ladybug, Shiny Ladybug
      1.43, .99, 1.62, .91,            // Spider, Scorpion, Fire Ant, Fire Ant Burrow
      .85, .96, .96, 1.05,             // Sandstorm, Bubble, Acid Bubble, Shell
      .62, .91, .95, .82, .82,         // Starfish, Crab, Jellyfish, Digger, Sponge
    ];
    const fixed = new Set([5, 6, 7, 8, 18, 23]);
    return [
      ...f32(1), 0x21, 12,             // $12 is scratch f32 in the mob draw branch
      ...scales.flatMap((scale, id) => id ? branch(typeIs(id), [
        ...f32(scale),
        ...(fixed.has(id) ? [...radiusRatio(35), 0x94] : []),
        0x21, 12,
      ]) : []),
      ...scaleBasis([0x20, 12]),
    ];
  };
  const adaptWaveClient = (wasm) => {
    const missile = branch(typeIs(9), branch(radius, scaleBasis(radiusRatio(15))));
    const mobs = branch(radius, mobArt());
    const leech = [...f32(-2.5), 0x92]; // Account for the native 2.5-unit outer stroke.
    const rendererGrowth = missile.length + mobs.length;
    const growth = rendererGrowth + leech.length;
    const petalBranch = [0x20, 2, 0x28, 2, 108, 0x22, 0, 0x04, 0x40];
    const mobBranch = [0x20, 2, 0x28, 2, 124, 0x22, 0, 0x45, 0x0d, 0];
    const idleBranch = [0x02, 0x40, 0x02, 0x40, 0x20, 11, 0x45, 0x0d, 0];
    const leechRadius = [0x21, 3, 0x20, 4, 0x41, 0xa8, 0x0a, 0x6a, 0x20, 1];
    const edits = [
      [18538, uleb(2330231), uleb(2330231 + growth)], // Code section size
      [580942, uleb(8411), uleb(8411 + rendererGrowth)], // $597 body size
      [580944 + 4921, petalBranch, [...petalBranch, ...missile]],
      [580944 + 8174, mobBranch, [...mobBranch, ...mobs]],
      // Always take $991's existing path that clears the AFK deadline.
      [1436535 + 4217, idleBranch, [0x02, 0x40, 0x02, 0x40, 0x41, 0, 0x45, 0x0d, 0]],
      [1736840, uleb(8141), uleb(8141 + leech.length)], // $1795 body size
      [1736842 + 2931, leechRadius, [...leech, ...leechRadius]],
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

  const recovery = document.createElement('aside');
  recovery.id = 'wave-connection';
  recovery.hidden = true;
  const connectionStatus = document.createElement('p');
  connectionStatus.setAttribute('role', 'status');
  const retry = document.createElement('button');
  retry.textContent = 'Reconnect';
  retry.addEventListener('click', () => {
    retry.disabled = true;
    window.onbeforeunload = null;
    location.reload();
  });
  recovery.append(connectionStatus, retry);
  document.body.append(recovery);

  let activeSocket;
  let stopped = false;
  let lastPacket = performance.now();
  function showRecovery(message, terminal = true) {
    stopped ||= terminal;
    connectionStatus.textContent = message;
    recovery.hidden = false;
  }
  function clientStopped() {
    showRecovery('The game client stopped. Reconnect to try again.');
    activeSocket?.close();
  }
  window.Module.onAbort = clientStopped;
  window.addEventListener('error', (event) => {
    if (event.error instanceof WebAssembly.RuntimeError) {
      clientStopped();
    }
  });

  const gardenDiscovery = '/endpoint/florrio-waves-0/findEach/';
  const rotatingDiscovery = '/endpoint/florrio-waves-1/findEach/';
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
    description.textContent = 'Choose Garden or the current Waves rotation.';
    const recover = document.createElement('button');
    recover.textContent = 'Return to Garden';
    recover.addEventListener('click', () => {
      localStorage.setItem('florrio_gamemode', '0');
      const url = new URL(location.href);
      url.hash = '';
      location.replace(url);
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
    if (method === 'GET' && original === 'https://api.n.m28.io/endpoint/florrio-pvp/findEach/') {
      // Suspend this unavailable discovery, without invoking the original
      // client's network-error retry callback or contacting the retired API.
      suspended.add(this);
      unsupportedMode();
      return open.call(this, method, gardenDiscovery, ...options);
    }
    const garden = original === `https://api.n.m28.io${gardenDiscovery}`;
    const rotating = original === `https://api.n.m28.io${rotatingDiscovery}`;
    const local =
      method === 'GET' &&
      (garden || rotating || original === 'https://api.n.m28.io/server/wavelocal' ||
        original === 'https://api.n.m28.io/server/waverotation');
    return open.call(this, method, local ? new URL(original).pathname : url, ...options);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (!suspended.has(this)) {
      return send.apply(this, args);
    }
  };

  const NativeSocket = window.WebSocket;
  window.WebSocket = class extends NativeSocket {
    #intentionalClose = false;

    constructor(url, protocols) {
      const original = new URL(url, location.href).href;
      const garden =
        original === 'ws://127.0.0.1:443/' || original === 'wss://wavelocal.s.m28n.net/';
      const rotating =
        original === 'ws://127.0.0.2:443/' || original === 'wss://waverotation.s.m28n.net/';
      const local = garden || rotating;
      const suffix = rotating ? '/rotating' : '';
      super(local ? `ws://${location.host}/wave/socket${suffix}` : url, protocols);
      if (!local) {
        return;
      }
      activeSocket = this;
      Object.defineProperty(this, 'url', { value: original });
      // These listeners run before the October handlers. Its two-byte fatal
      // response forces a page reload, including when retrying cannot help.
      this.addEventListener('message', (event) => {
        if (activeSocket !== this || stopped) {
          event.stopImmediatePropagation();
          return;
        }
        if (event.data instanceof ArrayBuffer && event.data.byteLength === 2 &&
            new DataView(event.data).getUint16(0) === 0) {
          event.stopImmediatePropagation();
          showRecovery('The server ended this session. Reconnect to restore your saved profile.');
          return;
        }
        lastPacket = performance.now();
        recovery.hidden = true;
      });
      this.addEventListener('error', (event) => {
        if (activeSocket === this && !this.#intentionalClose) {
          event.stopImmediatePropagation();
        }
      });
      this.addEventListener('close', (event) => {
        if (activeSocket !== this || this.#intentionalClose) {
          return;
        }
        event.stopImmediatePropagation();
        if (event.code === 4001) {
          showRecovery('This guest is playing in another tab. Reconnect to play here instead.');
        } else if (!stopped) {
          showRecovery('Connection lost. Reconnect to try again.');
        }
      });
    }

    close(...args) {
      this.#intentionalClose = true;
      return super.close(...args);
    }
  };

  // Preload the signed display cache before the original script starts. The
  // asynchronous request keeps the page responsive if storage is busy.
  async function startClient() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const token = localStorage.getItem('cp6_player_id') || '';
      const cached = await fetch('/wave/cache/' + encodeURIComponent(token), {
        signal: controller.signal,
      });
      if (cached.ok) {
        const profile = await cached.json();
        localStorage.setItem('cp6_player_id', profile.token);
        localStorage.setItem('cached_inventory', profile.inventory);
        localStorage.setItem('cached_level', profile.level);
        localStorage.setItem('cached_num_petals', profile.numPetals);
        localStorage.setItem('cached_equipped', profile.equipped);
      } else if (cached.status !== 404) {
        throw new Error('Wave profile cache is unavailable');
      }
    } catch {
      showRecovery('Could not load your saved profile. Reconnect to try again.');
      return;
    } finally {
      clearTimeout(timeout);
    }

    const script = document.createElement('script');
    script.src = '/client.js';
    script.addEventListener('error', clientStopped);
    document.body.append(script);
    lastPacket = performance.now();
    document.addEventListener('visibilitychange', () => {
      lastPacket = performance.now();
    });
    setInterval(() => {
      if (!stopped && !document.hidden && !modeNotice?.open &&
          performance.now() - lastPacket >= 10000) {
        showRecovery('No response from the game server. Reconnect to try again.', false);
      }
    }, 1000);
  }
  window.addEventListener('DOMContentLoaded', startClient, { once: true });
})();
