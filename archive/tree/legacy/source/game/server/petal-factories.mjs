/** Petal constructors and the slot type setter, recovered from sp_server.wasm.
 * The original numeric ABI, constructor store order, vtables and shared memory
 * are retained. Allocation and component-pool services remain explicit calls.
 * See petal-factories-map.json for artifact identity and per-function evidence.
 */
export const functionIds = Object.freeze([
  217, 235, 327, 364, 384, 500, 509, 519, 529, 533, 539, 542, 545, 552,
  558, 565, 572, 579, 583, 590, 593, 598, 602, 612, 614, 621, 626, 629,
  634, 642, 643, 648, 650, 651, 683,
]);

export function createPetalFactoryHooks(runtime) {
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
  const long = (address, value = 0n) => access(address, 8).setBigUint64(address, value, true);
  const add = (address, offset) => (address + offset) >>> 0;
  const call = (id, ...args) => runtime.call(id, ...args);
  const release = pointer => call(14, pointer);
  const allocateBehavior = size => call(20, size) >>> 0;
  const invoke = (signature, index, ...args) => runtime.indirect(signature, index, ...args);

  function createPlainBehavior(vtable) {
    const behavior = allocateBehavior(4);
    word(behavior, vtable);
    return behavior | 0;
  }
  function createClockedBehavior(vtable, stateBytes) {
    const behavior = allocateBehavior(24);
    long(behavior); long(behavior + 8); long(behavior + 16);
    // These redundant stores are present in the artifact and precede the
    // vtable store. Rose uses an i32 state; Wing omits this extra state store.
    if (stateBytes === 1) byte(behavior + 4, 0);
    else if (stateBytes === 4) word(behavior + 4, 0);
    word(behavior, vtable);
    byte(behavior + 8, 0);
    return behavior | 0;
  }
  function createEggBehavior(vtable) {
    const behavior = allocateBehavior(32);
    long(behavior); long(behavior + 24); long(behavior + 8); long(behavior + 16);
    word(behavior, vtable);
    byte(behavior + 24, 0); byte(behavior + 8, 0);
    return behavior | 0;
  }

  function resetTypePacket(address) {
    release(u32(address + 12));
    long(address + 8); long(address);
  }
  function appendTypeByte(address, value) {
    if (u32(address)) word(address, 0);
    let pointer = u32(address + 12);
    let capacity = pointer ? u32(address + 8) : 4096;
    const length = u32(address + 4), nextLength = (length + 1) >>> 0;
    if (capacity < nextLength) {
      do { capacity = (capacity << 1) >>> 0; } while (capacity < nextLength);
      const previous = pointer || address + 16;
      pointer = call(16, capacity) >>> 0;
      const copied = call(15, pointer, previous, length);
      if (previous !== address + 16) release(previous);
      word(address + 12, copied); word(address + 8, capacity);
    }
    byte(add(pointer || address + 16, length), value);
    word(address + 4, nextLength);
    return nextLength;
  }
  function typePacketsMatch(length) {
    if (u32(8551044) !== length) return false;
    if (!length) return true;
    const before = u32(8551052) || 8551056, after = u32(8555164) || 8555168;
    if (u8(before) !== u8(after)) return false;
    for (let index = 1; index !== length; index = (index + 1) >>> 0) {
      if (u8(add(before, index)) !== u8(add(after, index))) return index >= length;
    }
    return true;
  }
  function clearEntityPacket(entity, offset) {
    const slot = add(add(u32(entity), (u32(entity + 16) & 16383) << 3), offset);
    const packet = u32(slot);
    word(slot, 0);
    if (packet) { release(u32(packet + 12)); release(packet); }
  }
  function markTypeChanged(slot) {
    const entity = u32(slot);
    if (!entity) return;
    let world = u32(entity);
    word(entity + 304, u32(world + 2140));
    word(entity + 308, u32(world + 2140));
    clearEntityPacket(entity, 264876);
    clearEntityPacket(entity, 264880);
    world = u32(entity);
    const tick = u32(world + 2140);
    word(add(add(world, (u32(entity + 16) & 16383) << 2), 68268), tick);
    word(add(add(world, (u32(entity + 16) & 16383) << 2), 133804), tick);
    word(slot + 12, u32(u32(u32(slot)) + 2140));
  }

  function setPetalTypeAndCreateBehavior(slot, loadoutIndex, instanceIndex, type) {
    slot >>>= 0; loadoutIndex |= 0; instanceIndex |= 0; type |= 0;
    byte(slot + 17, instanceIndex);
    byte(slot + 16, loadoutIndex);
    if (u8(slot + 8) !== type) {
      resetTypePacket(8551040); resetTypePacket(8555152);
      appendTypeByte(8551040, u8(slot + 8));
      byte(slot + 8, type);
      const length = appendTypeByte(8555152, type);
      if (!typePacketsMatch(length)) markTypeChanged(slot);
    }
    if (u32(slot + 20)) return;

    const typeByte = u8(slot + 8), definitionOffset = Math.imul(typeByte, 52);
    let entity = u32(slot), component, combat;
    if (!u32(entity + 164)) {
      component = call(68, add(u32(entity), 1176)) >>> 0;
      word(entity + 164, component); word(component, entity);
      const tick = u32(u32(entity) + 2140);
      long(component + 48); byte(component + 40, 0); word(component + 4, tick);
      long(component + 8); long(component + 16); long(component + 24);
      byte(component + 32, 0);
      call(67, entity, u32(entity + 164));
      entity = u32(slot);
    }
    combat = u32(entity + 188);
    if (!combat) {
      component = call(65, add(u32(entity), 1440)) >>> 0;
      word(entity + 188, component); word(component, entity);
      const tick = u32(u32(entity) + 2140);
      long(component + 8); word(component + 4, tick); byte(component + 16, 0);
      long(component + 20); long(component + 28); word(component + 36, 0);
      word(component + 48, 16777217); long(component + 40, 1065353216n);
      call(64, entity, u32(entity + 188));
      combat = u32(entity + 188);
      entity = u32(slot);
    }
    byte(combat + 51, 0);
    if (!u32(entity + 184)) {
      component = call(148, add(u32(entity), 1396)) >>> 0;
      word(entity + 184, component); word(component, entity);
      const tick = u32(u32(entity) + 2140);
      word(component + 12, 0); byte(component + 8, 0); word(component + 4, tick);
      call(147, entity, component);
    }
    // The range guard deliberately selects address zero for type 0 and values
    // above 38. Reading that address and calling its table entry preserves the
    // original behavior, including traps; it is not a catalog fallback.
    const definition = ((typeByte - 1) & 255) > 37 ? 0 : add(8545792, definitionOffset);
    let behavior = invoke({ parameters: [], results: ['i32'] }, u32(definition + 48)) >>> 0;
    const previous = u32(slot + 20);
    word(slot + 20, behavior);
    if (previous) {
      invoke({ parameters: ['i32'] }, u32(u32(previous) + 4), previous);
      behavior = u32(slot + 20);
    }
    invoke({ parameters: ['i32', 'i32'] }, u32(u32(behavior) + 8), behavior, u32(slot));
  }

  return {
    217: setPetalTypeAndCreateBehavior,
    235: function createFastR0PetalBehavior() { return createPlainBehavior(5256); },
    327: function createWebR2PetalBehavior() { return createClockedBehavior(6464, 1); },
    364: function createStingerR1PetalBehavior() { return createPlainBehavior(5476); },
    384: function createCactusR2PetalBehavior() { return createPlainBehavior(5852); },
    500: function createPeasR4PetalBehavior() { return createClockedBehavior(6676, 1); },
    509: function createBasicR5PetalBehavior() { return createPlainBehavior(6756); },
    519: function createSaltR2PetalBehavior() { return createPlainBehavior(6800); },
    529: function createRiceR3PetalBehavior() { return createPlainBehavior(6844); },
    533: function createCornR3PetalBehavior() { return createPlainBehavior(6888); },
    539: function createHoneyR2PetalBehavior() { return createPlainBehavior(6548); },
    542: function createLeafR1PetalBehavior() { return createPlainBehavior(6632); },
    545: function createYinYangR3PetalBehavior() { return createPlainBehavior(6420); },
    552: function createHeaviestR3PetalBehavior() { return createPlainBehavior(6376); },
    558: function createAntennaeR4PetalBehavior() { return createPlainBehavior(6332); },
    565: function createRoseR2PetalBehavior() { return createClockedBehavior(6288, 4); },
    572: function createDandelionR2PetalBehavior() { return createClockedBehavior(6072, 1); },
    579: function createCactusR3PetalBehavior() { return createPlainBehavior(6156); },
    583: function createEggR3PetalBehavior() { return createEggBehavior(6200); },
    590: function createEggR4PetalBehavior() { return createEggBehavior(6244); },
    593: function createPollenR3PetalBehavior() { return createClockedBehavior(6028, 1); },
    598: function createBubbleR2PetalBehavior() { return createClockedBehavior(5984, 1); },
    602: function createBasicR0PetalBehavior() { return createPlainBehavior(5212); },
    612: function createHeavyR0PetalBehavior() { return createPlainBehavior(5300); },
    614: function createRockR2PetalBehavior() { return createPlainBehavior(5344); },
    621: function createSquareR5PetalBehavior() { return createPlainBehavior(5388); },
    626: function createRoseR1PetalBehavior() { return createClockedBehavior(5432, 4); },
    629: function createIrisR1PetalBehavior() { return createPlainBehavior(5520); },
    634: function createWingR2PetalBehavior() { return createClockedBehavior(5604, 0); },
    642: function createMissileR2PetalBehavior() { return createClockedBehavior(5648, 1); },
    643: function createPeasR2PetalBehavior() { return createClockedBehavior(5692, 1); },
    648: function createPeasR3PetalBehavior() { return createClockedBehavior(5772, 1); },
    650: function createFasterR2PetalBehavior() { return createPlainBehavior(5896); },
    651: function createRoseR3PetalBehavior() { return createClockedBehavior(5940, 4); },
    683: function createNoPetalBehavior() { return 0; },
  };
}
