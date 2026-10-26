/** Recovered sp_server spawn-path helpers: spatial quadtree insertion (264),
 * entity-string assignment with cache invalidation (265), and spawn-side
 * component publication (266).
 *
 * Marks the entity's component byte +94 with bit 2, clears the two per-id cache
 * records owned by the world, refreshes three id tables with the world's
 * revision stamp, appends the entity handle to the world's active vector
 * (owner+1164 size, +1168 capacity, +1172 data, initial capacity 1024), stores
 * the stamp at entity +400/+404, then clears the caches and rewrites two id
 * tables again.
 *
 * This is the world+192 manager path used at the end of spawnEntity. It is not
 * a component-record constructor; the record lives on the world and is grown as
 * a vector of entity handles.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([265, 266]);
export const dependencyIds = Object.freeze([16, 15, 14]);
const CACHE_TABLES = Object.freeze([264876, 264880]);
const STAMP_TABLES = Object.freeze([68268, 133804, 199340]);
const ACTIVE_VECTOR_SIZE = 1164;
const ACTIVE_VECTOR_CAPACITY = 1168;
const ACTIVE_VECTOR_DATA = 1172;
const ENTITY_ID_MASK = 16383;

export function createSpawnComponentHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function clearCache(view, world, cell) {
    for (const table of CACHE_TABLES) {
      const slot = (world + cell * 8 + table) >>> 0;
      const record = view.getUint32(slot, true) >>> 0;
      view.setUint32(slot, 0, true);
      if (record !== 0) {
        runtime.call(14, view.getUint32(record + 12, true) >>> 0);
        runtime.call(14, record);
      }
    }
  }

  function writeStamp(view, world, cell, stamp) {
    for (const table of STAMP_TABLES)
      view.setUint32((world + cell * 4 + table) >>> 0, stamp, true);
  }

  /** Original 266: publish an entity handle into the world active vector. */
  function publishSpawnedEntity(entity, handle) {
    try {
      const view = dataView();
      const world = view.getUint32(entity, true) >>> 0;
      const cell = view.getUint32(entity + 16, true) & ENTITY_ID_MASK;
      view.setUint8(entity + 94, view.getUint8(entity + 94) | 4);
      clearCache(view, world, cell);
      const stamp = view.getUint32(world + 2140, true) >>> 0;
      writeStamp(view, world, cell, stamp);

      const size = view.getUint32(world + ACTIVE_VECTOR_SIZE, true) >>> 0;
      let data = view.getUint32(world + ACTIVE_VECTOR_DATA, true) >>> 0;
      const required = size + 1;
      let capacity = view.getUint32(world + ACTIVE_VECTOR_CAPACITY, true) >>> 0;
      if (capacity < required) {
        capacity = capacity === 0 ? 1024 : capacity << 1;
        while (capacity < required) capacity <<= 1;
        const grown = runtime.call(16, capacity * 4) >>> 0;
        runtime.call(15, grown, data, size * 4);
        runtime.call(14, data);
        view.setUint32(world + ACTIVE_VECTOR_DATA, grown, true);
        view.setUint32(world + ACTIVE_VECTOR_CAPACITY, capacity, true);
        data = grown;
      }
      view.setUint32(data + size * 4, handle, true);
      view.setUint32(world + ACTIVE_VECTOR_SIZE, required, true);

      view.setUint32(entity + 400, stamp, true);
      view.setUint32(entity + 404, stamp, true);
      clearCache(view, world, cell);
      for (const table of STAMP_TABLES.slice(0, 2))
        view.setUint32((world + cell * 4 + table) >>> 0, stamp, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return {...addStringHooks(runtime, {
    view: dataView,
    malloc: bytes => runtime.call(16, bytes) >>> 0,
    memcpy: (destination, source, bytes) => runtime.call(15, destination, source, bytes),
    free: address => runtime.call(14, address),
    clearCache,
    writeStamp,
  }), 266: publishSpawnedEntity};
}

/** Recovered sp_server entity-string assignment (original function 265).
 *
 * `target` is the 12-byte std::string member at slot+8; `slot` points at an
 * entity handle at +0 and a cache stamp at +20. The routine compares the target
 * with the incoming string using the libc++ SSO layout. Equal strings are a
 * no-op. Otherwise it rebuilds two global name buffers at 8551040/8555152,
 * moves the incoming string into the target (freeing a heap target first),
 * empties the source, and, when the two saved names still differ, invalidates
 * the entity's per-cell cache and stamps the slot, entity and world id tables.
 *
 * This is a name/description assignment helper, not a component constructor.
 */

export const stringFunctionIds = Object.freeze([265]);
const CACHE_ONE = Object.freeze({flag: 8551040, length: 8551044, capacity: 8551048, data: 8551052, fixed: 8551056});
const CACHE_TWO = Object.freeze({flag: 8555152, length: 8555156, capacity: 8555160, data: 8555164, fixed: 8555168});

function addStringHooks(runtime, api) {
  function readString(view, address) {
    const flag = view.getUint8(address + 11);
    const heap = (flag << 24) >> 24 < 0;
    const length = heap ? view.getUint32(address + 4, true) : flag;
    const data = heap ? view.getUint32(address, true) : address;
    return {length, data, heap};
  }

  function sameString(view, left, right) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++)
      if (view.getUint8(left.data + index) !== view.getUint8(right.data + index)) return false;
    return true;
  }

  function appendName(view, cache, string) {
    api.free(view.getUint32(cache.data, true));
    view.setBigUint64(cache.capacity, 0n, true);
    view.setBigUint64(cache.flag, 0n, true);
    const previousLength = view.getUint32(cache.length, true);
    const incomingLength = string.length + 1;
    const required = previousLength + incomingLength;
    let capacity = view.getUint32(cache.capacity, true);
    if (capacity === 0) capacity = view.getUint32(cache.data, true) === 0 ? 4096 : 0;
    if (capacity < required) {
      capacity = capacity === 0 ? 1 : capacity;
      while (capacity < required) capacity <<= 1;
      const base = view.getUint32(cache.data, true) || cache.fixed;
      const grown = api.malloc(capacity);
      api.memcpy(grown, base, previousLength);
      if (base !== cache.fixed) api.free(base);
      view.setUint32(cache.data, grown, true);
      view.setUint32(cache.capacity, capacity, true);
      capacity = grown;
    }
    const destination = (view.getUint32(cache.data, true) || cache.fixed) + previousLength;
    api.memcpy(destination, string.data, incomingLength);
    view.setUint32(cache.length, required, true);
  }

  /** Original 265: assign a string to an entity slot, invalidating on change. */
  function assignEntityString(target, source) {
    try {
      const view = api.view();
      const current = readString(view, target);
      const incoming = readString(view, source);
      if (sameString(view, current, incoming)) return;

      appendName(view, CACHE_ONE, current);
      if (current.heap) api.free(current.data);
      for (let offset = 0; offset < 12; offset++)
        view.setUint8(target + offset, view.getUint8(source + offset));
      view.setUint8(source + 11, 0);
      view.setUint8(source, 0);
      appendName(view, CACHE_TWO, readString(view, target));

      const firstLength = view.getUint32(CACHE_ONE.length, true);
      const secondLength = view.getUint32(CACHE_TWO.length, true);
      let changed = firstLength !== secondLength;
      if (!changed && firstLength !== 0) {
        const first = view.getUint32(CACHE_ONE.data, true) || CACHE_ONE.fixed;
        const second = view.getUint32(CACHE_TWO.data, true) || CACHE_TWO.fixed;
        for (let index = 0; index < firstLength; index++) {
          if (view.getUint8(first + index) === view.getUint8(second + index)) continue;
          changed = true;
          break;
        }
      }
      if (!changed) return;

      const slot = target - 8;
      const entity = view.getUint32(slot, true) >>> 0;
      if (entity === 0) return;
      const world = view.getUint32(entity, true) >>> 0;
      const stamp = view.getUint32(world + 2140, true) >>> 0;
      view.setUint32(entity + 400, stamp, true);
      view.setUint32(entity + 404, stamp, true);
      const cell = view.getUint32(entity + 16, true) & ENTITY_ID_MASK;
      api.clearCache(view, world, cell);
      for (const table of STAMP_TABLES.slice(0, 2))
        view.setUint32((world + cell * 4 + table) >>> 0, stamp, true);
      view.setUint32((slot + 20) >>> 0, stamp, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({265: assignEntityString});
}
