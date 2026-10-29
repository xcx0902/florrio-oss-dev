/** Equipped/reserve type changes and creation of individual equipped petals.
 * Complete original125/397 bodies. Slot handles are real entity references,
 * shared with damage, ownership, transforms and the replicated loadout state.
 */
export const functionIds = Object.freeze([125, 397]);
export function createLoadoutHooks(runtime) {
  let buffer, view;
  function memory(a, width) {
    if (buffer !== runtime.memory.buffer) { buffer = runtime.memory.buffer; view = new DataView(buffer); }
    if (a < 0 || a + width > view.byteLength) throw new WebAssembly.RuntimeError('memory access out of bounds');
    return view;
  }
  const u8 = a => memory(a, 1).getUint8(a), u32 = a => memory(a, 4).getUint32(a, true);
  const float = a => memory(a, 4).getFloat32(a, true), double = a => memory(a, 8).getFloat64(a, true);
  const byte = (a, v) => memory(a, 1).setUint8(a, v), word = (a, v) => memory(a, 4).setUint32(a, v, true);
  const short = (a, v) => memory(a, 2).setUint16(a, v, true), long = a => memory(a, 8).setBigUint64(a, 0n, true);
  const putDouble = (a, v) => memory(a, 8).setFloat64(a, v, true);
  const add = (a, b) => (a + b) >>> 0, call = (id, ...args) => runtime.call(id, ...args);
  function unlink(handle) {
    const previous = u32(handle + 4);
    word(previous + 8, u32(handle + 8)); word(u32(handle + 8) + 4, previous);
  }
  function link(handle, entity) {
    word(handle, u32(entity + 4)); const tail = u32(entity + 12);
    word(handle + 8, tail); word(tail + 4, handle); word(handle + 4, entity + 4); word(entity + 12, handle);
  }
  function changeSlotType(loadout, slot, type) {
    const saved = runtime.stackPointer.value, scratch = (saved - 16) >>> 0;
    runtime.stackPointer.value = scratch;
    if (slot <= 15) {
      const typeField = add(loadout, slot) + 20;
      if (u8(typeField) !== type) {
        if (slot <= 7) {
          for (let instance = 0; instance < 3; instance++) {
            const handle = add(loadout, slot * 36 + instance * 12) + 296, child = u32(handle);
            if (!child) continue;
            const health = u32(child + 164);
            if (health) {
              short(scratch + 8, 1); call(43, health, 0, float(health + 8), scratch + 8);
              if (!u32(handle)) continue;
            }
            unlink(handle); word(handle, 0); word(handle + 8, handle); word(handle + 4, handle);
          }
          const pending = add(loadout, slot * 3);
          byte(pending + 586, 1); short(pending + 584, 257);
          const timers = add(loadout, slot * 12);
          word(timers + 616, 0); long(timers + 608);
        }
        if (u8(typeField) !== type) {
          const entity = u32(loadout);
          if (entity) {
            const world = u32(entity); word(entity + 492, u32(world + 2140));
            const cachedAddress = add(add(world, (u32(entity + 16) & 16383) << 3), 264880), cached = u32(cachedAddress);
            word(cachedAddress, 0); if (cached) { call(14, u32(cached + 12)); call(14, cached); }
            const currentWorld = u32(entity);
            word(add(add(currentWorld, (u32(entity + 16) & 16383) << 2), 133804), u32(currentWorld + 2140));
            const revision = u32(u32(u32(loadout)) + 2140);
            word(loadout + 172, revision); word(add(loadout, (slot + 9) << 2), revision);
          }
          byte(typeField, type);
        }
        call(85, loadout); call(145, loadout);
      }
    }
    runtime.stackPointer.value = saved;
  }
  function ensurePetalComponent(entity) {
    let petal = u32(entity + 124); if (petal) return petal;
    petal = call(128, add(u32(entity), 268)) >>> 0;
    word(entity + 124, petal); word(petal, entity); const revision = u32(u32(entity) + 2140);
    word(petal + 20, 0); byte(petal + 8, 0); word(petal + 4, revision); word(petal + 12, 0); word(petal + 15, 0);
    call(218, entity, u32(entity + 124)); return u32(entity + 124);
  }
  function ensureTransform(entity) {
    let transform = u32(entity + 168); if (transform) return transform;
    transform = call(97, add(u32(entity), 1220)) >>> 0;
    word(entity + 168, transform); word(transform, entity); const revision = u32(u32(entity) + 2140);
    long(transform + 8); word(transform + 4, revision); long(transform + 16); long(transform + 24); word(transform + 32, 0);
    word(transform + 112, 0); byte(transform + 36, 1);
    for (const offset of [40, 48, 56, 64, 72]) long(transform + offset);
    byte(transform + 80, 0); call(96, entity, u32(entity + 168)); return u32(entity + 168);
  }
  function createEquippedPetal(loadout, slot, instance) {
    if (slot > 7 || instance > 2) return;
    const handle = add(loadout, slot * 36 + instance * 12) + 296;
    if (u32(handle)) return;
    const type = u8(add(loadout, slot) + 20); if (!type) return;
    const level = u8(loadout + 148), slots = level < 15 ? 5 : level < 30 ? 6 : level < 45 ? 7 : 8;
    if (slots <= slot || ((type - 1) & 255) > 37) return;
    const definition = add(8545792, type * 52);
    if (u8(definition + 40) || u32(definition + 32) <= instance) return;
    const entity = call(74, u32(u32(loadout))) >>> 0; if (!entity) return;
    call(73, entity, u32(loadout));
    const petal = ensurePetalComponent(entity), transform = ensureTransform(entity), source = u32(u32(loadout) + 168);
    if (!u8(source + 80)) call(17, source);
    const x = double(source + 88), y = double(source + 96);
    const saved = runtime.stackPointer.value, scratch = (saved - 16) >>> 0; runtime.stackPointer.value = scratch;
    putDouble(scratch, y); putDouble(scratch + 8, x);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (u8(transform + 80)) {
        byte(transform + 80, 0); let child = u32(u32(transform) + 84);
        while (child) { const next = u32(child + 8); call(34, child); child = next; }
      }
      call(44, transform + 20, scratch + 8); call(47, transform + 16, scratch);
    }
    runtime.stackPointer.value = saved;
    call(217, petal, slot, instance, u8(add(loadout, slot) + 20));
    if (entity !== u32(handle)) {
      unlink(handle); word(handle, 0); word(handle + 8, handle);
      link(handle, entity);
    }
    word(add(loadout, slot * 12 + (instance + 152) * 4), 0);
    byte(add(loadout, slot * 3 + instance) + 584, 0); call(85, loadout);
  }
  return Object.freeze({
    125: (loadout, slot, type) => changeSlotType(loadout >>> 0, slot >>> 0, type | 0),
    397: (loadout, slot, instance) => createEquippedPetal(loadout >>> 0, slot >>> 0, instance >>> 0),
  });
}
