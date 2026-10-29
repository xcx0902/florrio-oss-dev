/**
 * Client wasm probe for the original-client parity spike (R03).
 *
 * The archived `client.js` instantiates `client.wasm` through
 * `WebAssembly.instantiateStreaming` / `WebAssembly.instantiate`. Wrapping both
 * exposes the instance and its linear memory to the driver so a trap can be
 * diagnosed without editing `web/`.
 *
 * The snapshot decoder keeps its world state behind `p0 + 8` where `p0` is the
 * network object; the driver locates that state by its signature (entity slot
 * 3's packed handle from the first packet plus the sequence counter at +2276).
 */
export function installClientWasmProbe() {
  const probe = { instance: null, memory: null, errors: [] };
  window.__clientWasm = probe;

  const record = result => {
    const instance = result && result.instance ? result.instance : result;
    if (!instance || !instance.exports) return result;
    // The deterministic worker instantiates sp_server.wasm in this page too.
    // Select the shipped client's memory export, otherwise the later server
    // instance silently replaces the client and every state probe is invalid.
    const memory = instance.exports.Mf;
    if (!(memory instanceof WebAssembly.Memory)) return result;
    if (memory) {
      probe.instance = instance;
      probe.memory = memory;
      probe.exports = Object.keys(instance.exports);
    }
    return result;
  };

  const originalInstantiate = WebAssembly.instantiate;
  WebAssembly.instantiate = function (bytes, imports) {
    const result = originalInstantiate.call(this, bytes, imports);
    if (result && typeof result.then === 'function') return result.then(record);
    return record(result);
  };
  if (WebAssembly.instantiateStreaming) {
    const originalStreaming = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = function (source, imports) {
      const result = originalStreaming.call(this, source, imports);
      if (result && typeof result.then === 'function') return result.then(record);
      return record(result);
    };
  }
  const OriginalInstance = WebAssembly.Instance;
  if (OriginalInstance) {
    WebAssembly.Instance = function (module, imports) {
      const instance = new OriginalInstance(module, imports);
      return record(instance);
    };
    WebAssembly.Instance.prototype = OriginalInstance.prototype;
  }

  /** Read a u32 from client memory. */
  probe.u32 = address => new DataView(probe.memory.buffer).getUint32(address >>> 0, true);
  probe.f32 = address => new DataView(probe.memory.buffer).getFloat32(address >>> 0, true);
  probe.f64 = address => new DataView(probe.memory.buffer).getFloat64(address >>> 0, true);
  probe.bytes = (address, length) => new Uint8Array(probe.memory.buffer, address >>> 0, length).slice();

  /**
   * Locate the snapshot state object. `signature` is `{handle, index, sequence}`.
   * Entity records live at `state + 2928 + index * 448`; +16 is the packed
   * handle. Returns the state address or 0.
   */
  probe.findState = signature => {
    if (!probe.memory) return 0;
    const view = new DataView(probe.memory.buffer);
    const limit = probe.memory.buffer.byteLength;
    const readable = (address, size) => address > 0x10000 && address + size <= limit;
    let best = 0, bestScore = 0;
    for (let candidate = 0; candidate + 3000 < limit; candidate += 4) {
      const sequence = view.getUint32(candidate + 2276, true);
      if (sequence === 0 || sequence > 1000000) continue;
      const active = view.getUint32(candidate + 2296, true);
      if (active === 0 || active > 16384) continue;
      if (signature && signature.handle) {
        const entity = candidate + 2928 + signature.index * 448;
        if (entity + 200 > limit) continue;
        if (view.getUint32(entity + 16, true) !== signature.handle) continue;
      }
      let score = 0;
      for (let index = 0; index < 1024; index++) {
        const entity = candidate + 2928 + index * 448;
        if (entity + 200 > limit) break;
        const handle = view.getUint32(entity + 16, true);
        if (handle === 0 || (handle & 16383) !== index) continue;
        score += 1;
      }
      if (score > bestScore) { bestScore = score; best = candidate; }
    }
    if (best) probe.lastMatch = { candidate: best, score: bestScore, signature };
    return best;
  };

  /** Raw u32 header words, for diffing the original server against the engine. */
  probe.findValue = (value, limit = 8) => {
    if (!probe.memory) return [];
    const view = new DataView(probe.memory.buffer);
    const found = [];
    for (let address = 0; address + 4 <= probe.memory.buffer.byteLength; address += 4) {
      if (view.getUint32(address, true) !== value) continue;
      found.push(address);
      if (found.length >= limit) break;
    }
    return found;
  };

  probe.inspectAddress = (address, index = 0) => {
    const view = new DataView(probe.memory.buffer);
    const candidate = address - 16 - 2928 - index * 448;
    if (candidate < 0) return null;
    return { candidate, sequence: view.getUint32(candidate + 2276, true),
      active: view.getUint32(candidate + 2296, true), activated: view.getUint32(candidate + 2364, true),
      acknowledged: view.getUint32(candidate + 2356, true), connected: view.getUint8(candidate + 7342992) };
  };

  probe.stateHeader = state => {
    const view = new DataView(probe.memory.buffer);
    const at = offset => (state + offset + 4 <= probe.memory.buffer.byteLength ? view.getUint32(state + offset, true) : -1);
    return { state, sequence: at(2276), previous: at(2280), active: at(2296), acknowledged: at(2356),
      activated: at(2364), reused: at(2368), groups: at(2404), connected: at(7342992) };
  };

  probe.dumpHeader = (state, words = 620) => {
    const view = new DataView(probe.memory.buffer);
    const limit = probe.memory.buffer.byteLength;
    const values = [];
    for (let index = 0; index < words; index++) {
      const address = state + index * 4;
      if (address + 4 > limit) break;
      values.push(view.getUint32(address, true));
    }
    return values;
  };

  /** Read-only R19 diagnostic. Offsets follow entity-snapshot's component
   * table and entity-renderer's local transform, kept out of domain code. */
  probe.dumpVisualState = (state, now) => {
    const view = new DataView(probe.memory.buffer), f = Math.fround;
    const u32 = at => view.getUint32(at, true), f32 = at => view.getFloat32(at, true);
    const f64 = at => view.getFloat64(at, true), byte = at => view.getUint8(at);
    const scalar = (base, current, previous, stamp, double = false) => {
      const read = double ? f64 : f32;
      const target = read(base + current), old = read(base + previous);
      const at = byte(base + stamp) ? f64(base + stamp + 8) : null;
      const t = at === null ? 1 : Math.max(0, Math.min(1, (now - at) / 120));
      return { target, previous: old, at, displayed: double ? old + (target - old) * t : f(old + f(target - old) * t) };
    };
    const entities = [];
    for (let index = 0; index < 16384; index++) {
      const entity = state + 2928 + index * 448;
      if (entity + 200 >= view.byteLength) break;
      const handle = u32(entity + 16);
      if (handle < 16384 || (handle & 16383) !== index) continue;
      const transform = u32(entity + 120), camera = u32(entity + 72);
      const health = u32(entity + 116), collider = u32(entity + 140);
      const player = u32(entity + 152), input = u32(entity + 144), visual = u32(entity + 136);
      if (!transform) continue;
      entities.push({ handle, wireHandle: ((handle >>> 14) | (handle << 18)) >>> 0,
        x: scalar(transform, 64, 68, 72), y: scalar(transform, 40, 44, 48),
        angle: scalar(transform, 8, 16, 24, true),
        cameraX: camera ? scalar(camera, 16, 20, 24) : null,
        cameraY: camera ? scalar(camera, 112, 116, 120) : null,
        radius: collider ? scalar(collider, 8, 12, 16) : null,
        visual: visual ? { flags: byte(visual + 8), immediate: byte(visual + 16),
          fadeAt: byte(visual + 40) ? f64(visual + 48) : null } : null,
        health: health ? f32(health + 8) : null, maxHealth: health ? f32(health + 12) : null,
        player: player ? { look: byte(player + 8), model: byte(player + 9), expressions: byte(player + 10),
          level: byte(player + 168), progress: u32(player + 12), score: scalar(player, 16, 20, 24),
          actions: input ? byte(input + 8) : 0 } : null });
    }
    const local = u32(state + 256) ? u32(u32(state + 264)) : 0;
    const controlled = local ? u32(local + 144) : 0;
    const cached = controlled ? u32(controlled + 120) : 0;
    return { now, control: { cameraX: f32(state + 2148), cameraY: f32(state + 2152),
      scale: f32(state + 2156), localX: local ? scalar(local, 16, 20, 24) : null,
      localY: local ? scalar(local, 112, 116, 120) : null,
      cachedX: cached ? f64(cached + 152) : null, cachedY: cached ? f64(cached + 160) : null },
      panX: f32(state + 2048), panY: f32(state + 2052),
      arenaWidth: f32(state + 900), arenaHeight: f32(state + 988), entities };
  };

  probe.dumpState = state => {
    const view = new DataView(probe.memory.buffer);
    const limit = probe.memory.buffer.byteLength;
    const readable = (address, size) => address > 0 && address + size <= limit;
    const entities = [];
    for (let index = 0; index < 16384; index++) {
      const entity = state + 2928 + index * 448;
      if (entity + 300 > limit) break;
      const handle = view.getUint32(entity + 16, true);
      if (!handle) continue;
      const transform = view.getUint32(entity + 168, true);
      const health = view.getUint32(entity + 164, true);
      entities.push({
        index,
        handle,
        transform,
        x: readable(transform + 20, 4) ? view.getFloat32(transform + 20, true) : 0,
        y: readable(transform + 16, 4) ? view.getFloat32(transform + 16, true) : 0,
        angle: readable(transform + 8, 8) ? view.getFloat64(transform + 8, true) : 0,
        health: readable(health + 8, 4) ? view.getFloat32(health + 8, true) : 0,
      });
      if (entities.length >= 4000) break;
    }
    let playerFlagged = 0;
    for (let index = 0; index < 16384; index++) {
      const entity = state + 2928 + index * 448;
      if (entity + 200 > limit) break;
      if (!view.getUint32(entity + 16, true)) continue;
      if (view.getUint8(entity + 44) & 1) playerFlagged += 1;
    }
    const at = offset => (readable(state + offset, 4) ? view.getUint32(state + offset, true) : -1);
    return {
      sequence: at(2276),
      acknowledged: at(2356),
      activated: at(2364),
      reused: at(2368),
      activeCount: at(2296),
      referenceGroups: at(2404),
      playerFlagged,
      connectedFlag: readable(state + 7342992, 1) ? view.getUint8(state + 7342992) : -1,
      entities,
    };
  };
}
