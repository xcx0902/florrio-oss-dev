/** Shared petal virtual methods and bounded loadout/attachment lifecycle.
 * Recovered from the retained sp_server.wasm instructions. The original
 * signatures, object layouts, store order and allocator boundary are retained.
 * See petal-lifecycle-map.json for function evidence and dependencies.
 */
export const functionIds = Object.freeze([22, 85, 98, 152, 171, 218, 281]);

export function createPetalLifecycleHooks(runtime) {
  let buffer, view;
  function access(address, width) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    if (address < 0 || address + width > view.byteLength) {
      throw new WebAssembly.RuntimeError('memory access out of bounds');
    }
    return view;
  }
  const u8 = address => access(address, 1).getUint8(address);
  const u32 = address => access(address, 4).getUint32(address, true);
  const byte = (address, value) => access(address, 1).setUint8(address, value);
  const word = (address, value) => access(address, 4).setUint32(address, value, true);
  const add = (address, offset) => (address + offset) >>> 0;
  const call = (id, ...args) => runtime.call(id, ...args);

  /** Slots with flag41 share one orbital position across their instances.
   * Missing entity handles reserve configured positions, but existing entities
   * without a petal component do not. All eight slots receive indices; +292
   * stores the count at the player's currently unlocked slot boundary.
   */
  function assignPetalOrbitIndices(loadout) {
    loadout >>>= 0;
    let orbitIndex = 0;
    for (let slot = 0; slot < 8; slot++) {
      const type = u8(add(loadout, slot) + 20);
      if (((type - 1) & 255) <= 37) {
        const definition = add(8545792, Math.imul(type, 52));
        if (!u8(definition + 40)) {
          const group = add(loadout, Math.imul(slot, 36));
          if (u8(definition + 41)) {
            let positionUsed = 0;
            let entity = u32(group + 296);
            if (entity) {
              const petal = u32(entity + 124);
              if (petal) { byte(petal + 18, orbitIndex); positionUsed = 1; }
            } else positionUsed = u32(definition + 32) !== 0 ? 1 : 0;
            entity = u32(group + 308);
            if (entity) {
              const petal = u32(entity + 124);
              if (petal) { byte(petal + 18, orbitIndex); positionUsed = 1; }
            } else positionUsed |= u32(definition + 32) > 1 ? 1 : 0;
            entity = u32(group + 320);
            if (entity) {
              const petal = u32(entity + 124);
              if (petal) {
                byte(petal + 18, orbitIndex);
                orbitIndex = (orbitIndex + 1) >>> 0;
              } else orbitIndex = (orbitIndex + positionUsed) >>> 0;
            } else {
              positionUsed |= u32(definition + 32) > 2 ? 1 : 0;
              orbitIndex = (orbitIndex + positionUsed) >>> 0;
            }
          } else {
            for (let instance = 0; instance < 3; instance++) {
              const entity = u32(group + 296 + instance * 12);
              if (entity) {
                const petal = u32(entity + 124);
                if (petal) {
                  byte(petal + 18, orbitIndex);
                  orbitIndex = (orbitIndex + 1) >>> 0;
                }
              } else if (u32(definition + 32) > instance) {
                orbitIndex = (orbitIndex + 1) >>> 0;
              }
            }
          }
        }
      }
      const level = u8(loadout + 148);
      const unlockedSlots = level < 15 ? 5 : level < 30 ? 6 : level < 45 ? 7 : 8;
      if (slot + 1 === unlockedSlots) byte(loadout + 292, orbitIndex);
    }
  }

  function clearEntityPacket(entity, offset) {
    const address = add(add(u32(entity), (u32(entity + 16) & 16383) << 3), offset);
    const packet = u32(address);
    word(address, 0);
    if (packet) { call(14, u32(packet + 12)); call(14, packet); }
  }
  function markReplicationEpochs(entity, world, includeInitial) {
    const tick = u32(world + 2140);
    word(add(add(world, (u32(entity + 16) & 16383) << 2), 68268), tick);
    word(add(add(world, (u32(entity + 16) & 16383) << 2), 133804), tick);
    if (includeInitial) word(add(add(world, (u32(entity + 16) & 16383) << 2), 199340), tick);
  }
  function attachPetalSlot(entity, petal) {
    entity >>>= 0; petal |= 0;
    byte(entity + 92, u8(entity + 92) | 64);
    clearEntityPacket(entity, 264876); clearEntityPacket(entity, 264880);
    const world = u32(entity);
    markReplicationEpochs(entity, world, true);

    let capacity = u32(world + 304);
    const count = u32(world + 300), nextCount = (count + 1) >>> 0;
    let items;
    if (capacity >= nextCount) items = u32(world + 308);
    else {
      capacity = capacity ? (capacity << 1) >>> 0 : 1024;
      while (capacity < nextCount) capacity = (capacity << 1) >>> 0;
      const previous = u32(world + 308);
      items = call(16, (capacity << 2) >>> 0) >>> 0;
      const copied = call(15, items, previous, (count << 2) >>> 0);
      call(14, previous);
      word(world + 308, copied); word(world + 304, capacity);
    }
    word(add(items, (count << 2) >>> 0), petal);
    word(world + 300, nextCount);

    const currentWorld = u32(entity);
    word(entity + 304, u32(currentWorld + 2140));
    word(entity + 308, u32(currentWorld + 2140));
    clearEntityPacket(entity, 264876); clearEntityPacket(entity, 264880);
    markReplicationEpochs(entity, u32(entity), false);
  }

  return {
    22: function deleteBehaviorObject(object) { call(14, object | 0); },
    85: assignPetalOrbitIndices,
    98: function behaviorIdentity(object) { return object | 0; },
    // The retained bodies are literally empty WASM functions. Their separate
    // signatures matter at typed table call sites despite having no stores.
    152: function ignoreThreeArguments(object, entity, other) {},
    171: function ignoreTwoArguments(object, entity) {},
    218: attachPetalSlot,
    281: function ignoreFourArguments(object, context, entity, other) {},
  };
}
