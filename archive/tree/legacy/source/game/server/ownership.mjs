/** Owner assignment, replicated entity references and ownership component lists.
 * Recovered original IDs73/105/170/428. Shared entity records and intrusive
 * handles retain their original ABI; no separate JS object graph is created.
 */
export const functionIds = Object.freeze([ 73, 105, 170, 428 ]);

export function createOwnershipHooks(runtime) {
  let buffer, view;
  function memory(a, width) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    if (a < 0 || a + width > view.byteLength) throw new WebAssembly.RuntimeError("memory access out of bounds");
    return view;
  }
  const u8 = a => memory(a, 1).getUint8(a), u32 = a => memory(a, 4).getUint32(a, true);
  const byte = (a, v) => memory(a, 1).setUint8(a, v), word = (a, v) => memory(a, 4).setUint32(a, v, true);
  const long = (a, v = 0n) => memory(a, 8).setBigUint64(a, v, true);
  const add = (a, b) => a + b >>> 0, call = (id, ...args) => runtime.call(id, ...args);
  function invalidate(entity, includeCreationRevision = false) {
    for (const offset of [ 264876, 264880 ]) {
      const address = add(add(u32(entity), (u32(entity + 16) & 16383) << 3), offset), packet = u32(address);
      word(address, 0);
      if (packet) {
        call(14, u32(packet + 12));
        call(14, packet);
      }
    }
    const world = u32(entity), index = u32(entity + 16) & 16383, revision = u32(world + 2140);
    word(add(add(world, index << 2), 68268), revision);
    word(add(add(world, index << 2), 133804), revision);
    if (includeCreationRevision) word(add(add(world, index << 2), 199340), revision);
  }
  function resetPacket(base) {
    call(14, u32(base + 12));
    long(base + 8);
    long(base);
  }
  /** Original105: append a referenced entity's wire identity (or zero). */  function serializeEntityReference(handle, packet) {
    const entity = u32(handle), id = entity ? u32(entity + 16) : 0;
    // Wire IDs rotate the generation/index word. The decompiler prints this
    // as a shift, which would silently discard the upper generation bits.
        const identity = id << 18 | id >>> 14;
    if (u32(packet)) word(packet, 0);
    let pointer = u32(packet + 12), capacity = pointer ? u32(packet + 8) : 4096;
    const count = u32(packet + 4), needed = add(count, 4);
    if (capacity < needed) {
      do {
        capacity = capacity << 1 >>> 0;
      } while (capacity < needed);
      const old = pointer || packet + 16;
      pointer = call(16, capacity) >>> 0;
      const copied = call(15, pointer, old, count);
      if (old !== packet + 16) call(14, old);
      word(packet + 12, copied);
      word(packet + 8, capacity);
    }
    word(add(pointer || packet + 16, count), identity);
    word(packet + 4, needed);
  }
  function packetsMatch() {
    const count = u32(8551044);
    if (count !== u32(8555156)) return false;
    const before = u32(8551052) || 8551056, after = u32(8555164) || 8555168;
    for (let i = 0; i < count; i++) if (u8(add(before, i)) !== u8(add(after, i))) return false;
    return true;
  }
  /** Original170: replace an intrusive entity handle and dirty its owner field. */  function setOwnerReference(handle, source) {
    if (u32(handle) === u32(source)) return;
    resetPacket(8551040);
    resetPacket(8555152);
    serializeEntityReference(handle, 8551040);
    const entity = u32(source);
    if (entity !== u32(handle)) {
      const previous = u32(handle + 4);
      word(previous + 8, u32(handle + 8));
      word(u32(handle + 8) + 4, previous);
      word(handle, 0);
      word(handle + 8, handle);
      if (!entity) {
        word(handle, 0);
        word(handle + 4, handle);
        word(handle + 8, handle);
      } else {
        word(handle, u32(entity + 4));
        const tail = u32(entity + 12);
        word(handle + 8, tail);
        word(tail + 4, handle);
        word(handle + 4, entity + 4);
        word(entity + 12, handle);
      }
    }
    serializeEntityReference(handle, 8555152);
    if (packetsMatch()) return;
    const component = add(handle, -20), owner = u32(component);
    if (!owner) return;
    const world = u32(owner);
    word(owner + 368, u32(world + 2140));
    word(owner + 372, u32(world + 2140));
    invalidate(owner);
    word(component + 36, u32(u32(u32(component)) + 2140));
  }
  /** Original428: attach the embedded ownership component to world replication. */  function attachOwnershipComponent(entity, component) {
    byte(entity + 93, u8(entity + 93) | 64);
    invalidate(entity, true);
    const world = u32(entity), count = u32(world + 612), needed = add(count, 1);
    let capacity = u32(world + 616), items = u32(world + 620);
    if (capacity < needed) {
      capacity = capacity ? capacity << 1 >>> 0 : 1024;
      while (capacity < needed) capacity = capacity << 1 >>> 0;
      const pointer = call(16, capacity << 2), copied = call(15, pointer, items, count << 2);
      call(14, items);
      word(world + 620, copied);
      word(world + 616, capacity);
      items = pointer >>> 0;
    }
    word(add(items, count << 2), component);
    word(world + 612, needed);
    word(entity + 368, u32(world + 2140));
    word(entity + 372, u32(world + 2140));
    invalidate(entity);
  }
  function unlinkOwnedChild(entity) {
    const list = u32(entity + 44);
    if (!list) return;
    word(list, u32(list) - 1);
    let next = u32(entity + 52);
    const previous = u32(entity + 48);
    if (previous) {
      word(previous + 8, next);
      next = u32(entity + 52);
    } else word(list + 4, next);
    word(next ? next + 4 : list + 8, previous);
  }
  /** Original73: update both the owner reference and the owner's child list. */  function setEntityOwner(entity, owner) {
    const saved = runtime.stackPointer.value, scratch = saved - 16 >>> 0;
    runtime.stackPointer.value = scratch;
    word(scratch + 12, owner);
    if (!owner) {
      if (u32(entity + 44)) {
        unlinkOwnedChild(entity);
        word(entity + 52, 0);
        long(entity + 44);
      }
      if (u8(entity + 93) & 64) setOwnerReference(entity + 236, scratch + 12);
      runtime.stackPointer.value = saved;
      return;
    }
    if (!(u8(entity + 93) & 64)) {
      const component = entity + 216;
      word(component, entity);
      const revision = u32(u32(entity) + 2140);
      long(entity + 248);
      word(entity + 244, entity + 236);
      word(entity + 240, entity + 236);
      word(entity + 236, 0);
      word(entity + 232, entity + 224);
      word(entity + 228, entity + 224);
      word(entity + 224, 0);
      word(entity + 220, revision);
      attachOwnershipComponent(entity, component);
    }
    setOwnerReference(entity + 236, scratch + 12);
    unlinkOwnedChild(entity);
    const link = entity + 44;
    word(owner + 68, u32(owner + 68) + 1);
    word(entity + 44, owner + 68);
    const tail = u32(owner + 76);
    word(entity + 52, 0);
    word(entity + 48, tail);
    if (!u32(owner + 72)) word(owner + 72, link);
    if (tail) word(tail + 8, link);
    word(owner + 76, link);
    runtime.stackPointer.value = saved;
  }
  return Object.freeze({
    73: (entity, owner) => setEntityOwner(entity >>> 0, owner >>> 0),
    105: (handle, packet) => serializeEntityReference(handle >>> 0, packet >>> 0),
    170: (handle, source) => setOwnerReference(handle >>> 0, source >>> 0),
    428: (entity, component) => attachOwnershipComponent(entity >>> 0, component >>> 0)
  });
}
