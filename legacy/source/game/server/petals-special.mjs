/** High-level reconstruction of the remaining nontrivial petal virtual methods.
 * Artifact identity and per-body dependency boundaries are in petals-special-map.json.
 * runtime.call retains original shared entity, component and scheduler services.
 */
const f32 = Math.fround;
export const functionIds = Object.freeze([
  146, 272, 273, 431, 673, 674, 675, 676, 677, 678, 679, 681, 691, 693,
  719, 732, 741, 742, 743, 744, 745, 746, 747,
]);
const E = Object.freeze({ world: 0, petal: 124, health: 164, transform: 168,
  combat: 188, effects: 192, render: 116, parent: 224, owner: 236 });

export function createSpecialPetalHooks(runtime) {
  let previousBuffer, view;
  function access(address, width) {
    if (previousBuffer !== runtime.memory.buffer) {
      previousBuffer = runtime.memory.buffer;
      view = new DataView(previousBuffer);
    }
    if (address < 0 || address + width > view.byteLength) throw new WebAssembly.RuntimeError('memory access out of bounds');
    return view;
  }
  const u8 = a => access(a, 1).getUint8(a);
  const u32 = a => access(a, 4).getUint32(a, true);
  const float = a => access(a, 4).getFloat32(a, true);
  const double = a => access(a, 8).getFloat64(a, true);
  const byte = (a, v) => access(a, 1).setUint8(a, v);
  const word = (a, v) => access(a, 4).setUint32(a, v, true);
  const short = (a, v) => access(a, 2).setUint16(a, v, true);
  const setFloat = (a, v) => access(a, 4).setFloat32(a, v, true);
  const setDouble = (a, v) => access(a, 8).setFloat64(a, v, true);
  const long = (a, v = 0n) => access(a, 8).setBigUint64(a, v, true);
  const call = (id, ...args) => runtime.call(id, ...args);
  function frame(size, work) {
    const pointer = (runtime.stackPointer.value - size) >>> 0;
    runtime.stackPointer.value = pointer;
    const result = work(pointer);
    runtime.stackPointer.value = (pointer + size) | 0;
    return result;
  }
  function virtual(object, slot) {
    return runtime.indirect({ parameters: ['i32'], results: [] }, u32(u32(object) + slot * 4), object);
  }
  function ready(clock, behavior, delay) {
    return !u8(clock) || (u8(behavior + 8) !== 0 && double(clock + 8) - double(behavior + 16) > delay);
  }
  function ensureWorld(transform) { if (!u8(transform + 80)) call(17, transform); }
  function invalidateTransform(transform) {
    if (!u8(transform + 80)) return;
    byte(transform + 80, 0);
    let node = u32(u32(transform) + 84);
    while (node) { const next = u32(node + 8); call(34, node); node = next; }
  }
  function ownerOf(entity) { return (u32(entity + E.owner) & ((u8(entity + 93) << 25) >> 31)) >>> 0; }
  function detachSlot(entity) {
    const petal = u32(entity + E.petal), slotEntity = u32(petal);
    if (!(u8(slotEntity + 93) & 64)) return;
    const owner = u32(slotEntity + E.owner);
    if (!owner) return;
    const loadout = u32(owner + 200);
    if (!loadout) return;
    const slot = u8(petal + 16), instance = u8(petal + 17);
    if (slot > 7 || instance > 2) return;
    const handle = loadout + slot * 36 + instance * 12 + 296;
    if (u32(handle) !== slotEntity) return;
    unlink(handle);
    word(handle, 0); word(handle + 8, handle); word(handle + 4, handle);
    call(85, loadout);
  }
  function unlink(handle) {
    const previous = u32(handle + 4);
    word(previous + 8, u32(handle + 8)); word(u32(handle + 8) + 4, previous);
  }
  /** Intrusive reference handle insertion, matching entity's original list ABI. */
  function link(handle, entity) {
    if (!entity) { word(handle, 0); word(handle + 4, handle); word(handle + 8, handle); return; }
    word(handle, u32(entity + 4));
    const tail = u32(entity + 12);
    word(handle + 8, tail); word(tail + 4, handle);
    word(handle + 4, entity + 4); word(entity + 12, handle);
  }
  function setPosition(transform, x, y, xScratch, yScratch) {
    setDouble(xScratch, x); setDouble(yScratch, y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    invalidateTransform(transform);
    call(44, transform + 20, xScratch); call(47, transform + 16, yScratch);
  }
  function ensureTransform(entity) {
    let transform = u32(entity + E.transform);
    if (transform) return transform;
    transform = call(97, u32(entity) + 1220) >>> 0;
    word(entity + E.transform, transform); word(transform, entity);
    const epoch = u32(u32(entity) + 2140);
    long(transform + 8); word(transform + 4, epoch);
    long(transform + 16); long(transform + 24); word(transform + 32, 0);
    word(transform + 112, 0); byte(transform + 36, 1);
    for (const offset of [40, 48, 56, 64, 72]) long(transform + offset);
    byte(transform + 80, 0);
    call(96, entity, u32(entity + E.transform));
    return u32(entity + E.transform);
  }
  function ensurePetal(entity) {
    let petal = u32(entity + E.petal);
    if (petal) return petal;
    petal = call(128, u32(entity) + 268) >>> 0;
    word(entity + E.petal, petal); word(petal, entity);
    const epoch = u32(u32(entity) + 2140);
    word(petal + 20, 0); byte(petal + 8, 0); word(petal + 4, epoch);
    word(petal + 12, 0); word(petal + 15, 0);
    call(218, entity, u32(entity + E.petal));
    return u32(entity + E.petal);
  }
  function ensureRender(entity) {
    let render = u32(entity + E.render);
    if (render) return render;
    render = call(106, u32(entity) + 180) >>> 0;
    word(entity + E.render, render); word(render, entity);
    const epoch = u32(u32(entity) + 2140);
    word(render + 12, 0); byte(render + 8, 0); word(render + 4, epoch);
    call(278, entity, render);
    return u32(entity + E.render);
  }
  function setHealthMaximum(health, maximum, value, ratio) {
    setFloat(value, maximum);
    const oldMaximum = float(health + 12);
    if (oldMaximum <= 0) call(18, health + 8, value);
    else { setFloat(ratio, f32(f32(float(health + 8) * maximum) / oldMaximum)); call(18, health + 8, ratio); }
    call(25, health + 12, value);
  }
  function nextRandom() {
    const seed = u32(8573024), quotient = Math.floor(seed / 44488);
    const product = Math.imul((Math.imul(quotient, -44488) + seed) | 0, 48271) >>> 0;
    const correction = Math.imul(quotient, 3399) >>> 0;
    const next = ((product < correction ? 2147483647 : 0) + product - correction) >>> 0;
    word(8573024, next); return next;
  }
  function copyHandles(to, from, count) {
    for (let index = 0; index < count; index++) {
      const target = to + index * 12, source = from + index * 12;
      word(target, u32(source));
      const next = u32(source + 8);
      word(target + 8, next); word(next + 4, target);
      word(target + 4, source); word(source + 8, target);
    }
  }
  function moveHandles(to, from, count) {
    for (let index = 0; index < count; index++) {
      const target = to + index * 12, source = from + index * 12, previous = u32(source + 4);
      word(target, u32(source));
      if (source === previous) { word(target + 8, target); word(target + 4, target); }
      else {
        word(target + 4, previous); word(target + 8, u32(source + 8));
        word(previous + 8, target); word(u32(source + 8) + 4, target);
      }
      word(source, 0); word(source + 4, source); word(source + 8, source);
    }
  }
  function destroyHandles(start, count) { for (let index = 0; index < count; index++) unlink(start + index * 12); }
  function clonePeasCallback(source, destination, vtable) {
    word(destination, vtable);
    const phase = float(source + 4);
    byte(destination + 8, 0); setFloat(destination + 4, phase);
    const count = u8(source + 8);
    for (let index = 0; index < count; index++) {
      const target = destination + 12 + index * 12;
      word(target, 0); word(target + 8, target);
      copyHandles(target, source + 12 + index * 12, 1);
    }
    byte(destination + 8, count);
  }
  function allocatePeasCallback(source, vtable) {
    const destination = call(20, 60) >>> 0;
    word(destination, vtable); setFloat(destination + 4, float(source + 4));
    const count = u8(source + 8);
    copyHandles(destination + 12, source + 12, count); byte(destination + 8, count);
    return destination;
  }
  function destroyPeasCallback(callback, vtable, deallocate = false) {
    if (vtable) word(callback, vtable);
    destroyHandles(callback + 12, u8(callback + 8));
    if (deallocate) { call(14, callback); return; }
    byte(callback + 8, 0);
    if (vtable) return callback;
  }
  /** The deferred scheduler invokes this radial impulse one millisecond later. */
  function launchPeas(callback) {
    const count = u8(callback + 8);
    if (!count) return;
    const angleStep = 2 * Math.PI / count; let angle = float(callback + 4);
    for (let index = 0; index < count; index++) {
      angle = f32(angleStep + angle);
      const child = u32(callback + 12 + index * 12);
      if (!child) continue;
      const x = call(77, angle), transform = u32(child + E.transform);
      setDouble(transform + 40, double(transform + 40) + f32(x * 1.4));
      const y = call(78, angle);
      setDouble(transform + 48, double(transform + 48) + f32(y * 1.4));
      setDouble(transform + 56, double(transform + 56) + f32(x * 0.6));
      setDouble(transform + 64, double(transform + 64) + f32(y * 0.6));
    }
  }
  function queueEntityRemoval(entity) {
    if (u32(entity + 32)) return;
    const world = u32(entity), first = u32(world + 2176), tail = u32(world + 2180);
    word(world + 2172, u32(world + 2172) + 1);
    word(entity + 40, 0); word(entity + 36, tail); word(entity + 32, world + 2172);
    const node = entity + 32;
    if (!first) word(world + 2176, node);
    if (tail) word(tail + 8, node);
    word(world + 2180, node);
  }

  /** Split Peas into four linked children, then queue their deferred launch. */
  function splitPeas(output, behavior, context, type, visible, poison, closureVtable) {
    return frame(224, scratch => {
      byte(output + 4, 0); word(output, 0);
      if (u8(behavior + 4)) { byte(output + 4, 1); return; }
      setFloat(output, 65);
      const ownerContext = u32(context + 4);
      if (!ownerContext) return;
      if (!(u8(ownerContext + 10) & 1)) {
        if (u8(u32(context + 4) + 10) & 2) setFloat(output, 40);
        return;
      }
      const originalTransform = u32(u32(context) + E.transform);
      call(21, scratch + 144);
      if (!ready(scratch + 144, behavior, 500)) {
        if (u8(u32(context + 4) + 10) & 2) setFloat(output, 40);
        return;
      }
      byte(behavior + 4, 1); byte(scratch + 80, 0);
      const children = (scratch + 80) | 4;
      for (;;) {
        const child = call(74, u32(u32(context))) >>> 0;
        if (!child) break;
        call(73, child, ownerOf(u32(context)));
        const transform = ensureTransform(child);
        ensureWorld(originalTransform);
        const worldY = double(originalTransform + 96), worldX = double(originalTransform + 88);
        setPosition(transform, worldX, worldY, scratch + 144, scratch + 8);
        const petal = ensurePetal(child);
        call(217, petal, -1, -1, type);
        byte(u32(petal + 20) + 4, 1);

        // The original temporary reference is at scratch+144. Its transient
        // links are preserved before insertion into the bounded four-handle list.
        const reference = u32(child + 4), tail = u32(child + 12);
        word(tail + 4, scratch + 144); word(child + 12, scratch + 144);
        const count = u8(scratch + 80), handle = children + count * 12;
        word(handle, reference);
        if (child + 4 === scratch + 144) {
          word(handle + 4, handle); word(handle + 8, handle);
        } else {
          word(handle + 4, child + 4); word(handle + 8, tail);
          word(child + 12, handle); word(tail + 4, handle);
        }
        byte(scratch + 80, count + 1);
        if (((count + 1) & 255) >= 4) break;
      }
      const phase = f32(f32((nextRandom() - 1) >>> 0) * f32(2 * Math.PI / 2147483648));
      let angle = phase;
      let count = u8(scratch + 80);
      for (let index = 0; index < count; index++) {
        angle = f32(2 * Math.PI / count + angle);
        const child = u32(children + index * 12), render = ensureRender(child);
        word(scratch + 144, visible ? u8(render + 8) | 1 : u8(render + 8) & 254);
        const property = call(151, render + 8, scratch + 144);
        word(scratch + 144, poison ? u8(render + 8) | 2 : u8(render + 8) & 253);
        call(151, property, scratch + 144);
        const health = u32(child + E.health);
        setHealthMaximum(health, 5, scratch + 144, scratch + 8);
        setFloat(u32(child + E.health) + 24, 1000);
        const sine = call(78, angle), transform = u32(child + E.transform), oldX = float(transform + 20);
        const worldY = f32(sine * f32(Math.sqrt(72))) + float(transform + 16);
        setDouble(scratch + 8, worldY);
        const worldX = f32(call(77, angle) * f32(Math.sqrt(72))) + oldX;
        setDouble(scratch + 144, worldX);
        if (Number.isFinite(worldX) && Number.isFinite(worldY)) {
          invalidateTransform(transform);
          call(44, transform + 20, scratch + 144); call(47, transform + 16, scratch + 8);
        }
        count = u8(scratch + 80);
      }
      const world = u32(u32(context));
      call(21, scratch + 64);
      const now = double(scratch + 72);
      setFloat(scratch + 8, phase);
      count = u8(scratch + 80);
      copyHandles(scratch + 16, children, count); byte(scratch + 12, count);
      const scheduled = call(277) >>> 0;
      for (const offset of [0, 32, 24, 16, 8]) long(scheduled + offset);
      word(scratch + 136, scheduled);
      const storedPhase = float(scratch + 8); setFloat(scratch + 144, storedPhase);
      const callbackCount = u8(scratch + 12);
      copyHandles(scratch + 152, scratch + 16, callbackCount);
      const callback = call(20, 60) >>> 0;
      setFloat(callback + 4, storedPhase); word(callback, closureVtable);
      moveHandles(callback + 12, scratch + 152, callbackCount);
      byte(callback + 8, callbackCount);
      destroyHandles(scratch + 152, callbackCount);
      word(scratch + 216, callback); byte(scratch + 148, 0);
      call(276, scratch + 200, scheduled);
      const remainingCallback = u32(scratch + 216);
      if (remainingCallback) virtual(remainingCallback, remainingCallback === scratch + 200 ? 4 : 5);
      destroyHandles(scratch + 152, u8(scratch + 148));
      setDouble(scheduled + 32, now + 1); byte(scheduled + 24, 1);
      const end = u32(world + 1920);
      if (end < u32(world + 1924)) { word(scratch + 136, 0); word(end, scheduled); word(world + 1920, end + 4); }
      else call(275, world + 1916, scratch + 136);
      call(150, scratch + 136);
      destroyHandles(scratch + 16, u8(scratch + 12));
      detachSlot(u32(context)); queueEntityRemoval(u32(context));
      destroyHandles(children, u8(scratch + 80));
    });
  }

  function hatchEgg(output, behavior, context, delay, type) {
    return frame(16, scratch => {
      setFloat(output, 65); byte(output + 4, 0);
      if (u8(behavior + 24)) { byte(output + 4, 1); return; }
      call(21, scratch);
      if (!ready(scratch, behavior, delay)) return;
      byte(behavior + 24, 1);
      let entity = u32(context);
      const transform = u32(entity + E.transform);
      if (!u8(transform + 80)) { call(17, transform); entity = u32(context); }
      const hatchling = call(144, u32(entity) + 1936, type, double(transform + 88), double(transform + 96), -1) >>> 0;
      entity = u32(context);
      const petal = u32(entity + E.petal), slotEntity = u32(petal);
      if (u8(slotEntity + 93) & 64) {
        const owner = u32(slotEntity + E.owner), loadout = owner ? u32(owner + 200) : 0;
        const slot = u8(petal + 16), instance = u8(petal + 17);
        if (loadout && slot <= 7 && instance <= 2) {
          const handle = loadout + slot * 36 + instance * 12 + 296;
          if (u32(handle) === slotEntity) {
            if (slotEntity !== hatchling) {
              unlink(handle); word(handle, 0); word(handle + 8, handle);
              link(handle, hatchling);
            }
            call(85, loadout); entity = u32(context);
          }
        }
      }
      call(73, hatchling, ownerOf(entity));
      const ai = u32(hatchling + 204);
      if (ai) { byte(ai + 8, 0); word(ai + 4, 0); }
      entity = u32(context);
      const owner = ownerOf(entity), movement = u32(hatchling + 104), handle = movement + 164;
      if (owner !== u32(handle)) {
        unlink(handle); word(handle + 8, handle); word(handle, 0);
        link(handle, owner);
      }
      setFloat(movement + 120, 1000);
      long(movement + 136, 4934256342871703552n);
      short(scratch, 1);
      const health = u32(entity + E.health);
      call(43, health, 0, float(health + 8), scratch);
    });
  }

  function effectSource(entity) {
    if (!entity) return 0;
    let ancestor = entity;
    while (ancestor && !(u8(ancestor + 92) & 32)) {
      const owner = ownerOf(ancestor);
      if (owner) ancestor = owner;
      else { if (!(u8(ancestor + 93) & 64)) return entity; ancestor = u32(ancestor + E.parent); }
    }
    if (!ancestor) return entity;
    const flower = u32(ancestor + 120);
    return flower ? u32(flower + 100) || u32(flower) : entity;
  }
  function appendPoison(effects, effect) {
    if (call(118, effect) <= 0) { virtual(effect, 1); return; }
    const count = u32(effects + 16), needed = (count + 1) >>> 0;
    let capacity = u32(effects + 20), items = u32(effects + 24);
    if (capacity < needed) {
      let candidate = capacity ? capacity << 1 : 1024;
      do { capacity = candidate >>> 0; candidate <<= 1; } while (capacity < needed);
      const old = items; items = call(16, capacity << 2) >>> 0;
      for (let index = 0; index < count; index++) {
        const source = old + index * 4, item = u32(source);
        word(source, 0); word(items + index * 4, item);
        const residual = u32(source); word(source, 0);
        if (residual) virtual(residual, 1);
      }
      call(14, old); word(effects + 24, items); word(effects + 20, capacity);
    }
    word(items + count * 4, effect); word(effects + 16, needed);
  }
  function poisonHit(attacker, target, duration) {
    return frame(16, scratch => {
      const effects = u32(target + E.effects);
      if (!effects) return;
      const source = effectSource(attacker), effect = call(20, 40) >>> 0;
      call(21, scratch); byte(effect + 8, 1); setDouble(effect + 16, double(scratch + 8) + duration);
      word(effect + 32, effect + 24); word(effect + 24, 0); word(effect, 5564);
      link(effect + 24, source);
      appendPoison(effects, effect);
    });
  }

  function growArray(pointer, count, capacity, needed) {
    let next = capacity ? capacity << 1 : 1024;
    while ((next >>> 0) < needed) next <<= 1;
    const result = call(15, call(16, next << 2), pointer, count << 2) >>> 0;
    call(14, pointer); return { pointer: result, capacity: next >>> 0 };
  }
  /** Component pools store free slots in a maximum-address binary heap. */
  function takePool(pool, stride) {
    const count = u32(pool + 16);
    if (count) {
      const heap = u32(pool + 24), result = u32(heap), remaining = count - 1;
      if (count === 1) { word(pool + 16, 0); return result; }
      const last = heap + count * 4 - 4;
      word(heap, u32(last)); word(last, result);
      if (count !== 2) {
        const root = u32(heap); let child = count >= 4 && u32(heap + 4) < u32(heap + 8) ? 2 : 1;
        let value = u32(heap + child * 4);
        if (value >= root) {
          const lastParent = (count - 3) >> 1; let hole = 0;
          for (;;) {
            word(heap + hole * 4, value); hole = child;
            if (child > lastParent) break;
            child = (child << 1) | 1;
            if (remaining > child + 1 && u32(heap + child * 4) < u32(heap + (child + 1) * 4)) child++;
            value = u32(heap + child * 4); if (value < root) break;
          }
          word(heap + hole * 4, root);
        }
      }
      word(pool + 16, remaining); return result;
    }
    const used = u32(pool);
    if (used <= 127) {
      const chunk = u32(u32(pool + 12) + u32(pool + 4) * 4 - 4);
      word(pool, used + 1); return chunk + used * stride;
    }
    const chunk = call(16, stride * 128) >>> 0, chunks = u32(pool + 4), needed = (chunks + 1) >>> 0;
    let pointers = u32(pool + 12), capacity = u32(pool + 8);
    if (capacity < needed) {
      const grown = growArray(pointers, chunks, capacity, needed);
      pointers = grown.pointer; word(pool + 12, pointers); word(pool + 8, grown.capacity);
    }
    word(pointers + chunks * 4, chunk); word(pool, 1); word(pool + 4, needed); return chunk;
  }
  function appendComponent(world, offset, component) {
    const count = u32(world + offset), needed = (count + 1) >>> 0;
    let capacity = u32(world + offset + 4), items = u32(world + offset + 8);
    if (capacity < needed) {
      const grown = growArray(items, count, capacity, needed);
      items = grown.pointer; word(world + offset + 8, items); word(world + offset + 4, grown.capacity);
    }
    word(items + count * 4, component); word(world + offset, needed);
  }
  function invalidateEntity(entity, third = false) {
    for (const offset of [264876, 264880]) {
      const address = u32(entity) + (u32(entity + 16) & 16383) * 8 + offset, cached = u32(address);
      word(address, 0); if (cached) { call(14, u32(cached + 12)); call(14, cached); }
    }
    const world = u32(entity), id = u32(entity + 16) & 16383, epoch = u32(world + 2140);
    word(world + id * 4 + 68268, epoch); word(world + id * 4 + 133804, epoch);
    if (third) word(world + id * 4 + 199340, epoch);
  }
  function ensureWebTag(entity) {
    if (u32(entity + 140)) return;
    const tag = takePool(u32(entity) + 480, 8);
    word(entity + 140, tag); word(tag, entity); word(tag + 4, u32(u32(entity) + 2140));
    byte(entity + 93, u8(entity + 93) | 8); invalidateEntity(entity, true);
    appendComponent(u32(entity), 512, tag);
    word(entity + 344, u32(u32(entity) + 2140)); word(entity + 348, u32(u32(entity) + 2140));
    invalidateEntity(entity);
  }
  function ensureWebEffects(entity) {
    let effects = u32(entity + 208);
    if (effects) return effects;
    effects = takePool(u32(entity) + 1820, 28);
    word(entity + 208, effects); long(effects + 4); word(effects, entity);
    long(effects + 12); long(effects + 20); byte(entity + 95, u8(entity + 95) | 128);
    appendComponent(u32(entity), 1852, u32(entity + 208));
    return u32(entity + 208);
  }
  function spawnWeb(behavior, petalEntity, unusedTarget) {
    return frame(16, scratch => {
      if (!u8(behavior + 4)) return;
      const entity = call(74, u32(petalEntity)) >>> 0;
      let combat = u32(entity + E.combat);
      if (!combat) {
        combat = call(65, u32(entity) + 1440) >>> 0; word(entity + E.combat, combat); word(combat, entity);
        const epoch = u32(u32(entity) + 2140);
        long(combat + 8); word(combat + 4, epoch); byte(combat + 16, 0);
        long(combat + 20); long(combat + 28); word(combat + 36, 0);
        word(combat + 48, 16777217); long(combat + 40, 1065353216n);
        call(64, entity, u32(entity + E.combat)); combat = u32(entity + E.combat);
      }
      setDouble(scratch + 8, 50); call(26, combat + 8, scratch + 8); byte(combat + 50, 1);
      let health = u32(entity + E.health);
      if (!health) {
        health = call(68, u32(entity) + 1176) >>> 0; word(entity + E.health, health); word(health, entity);
        const epoch = u32(u32(entity) + 2140);
        long(health + 48); byte(health + 40, 0); word(health + 4, epoch);
        long(health + 8); long(health + 16); long(health + 24); byte(health + 32, 0);
        call(67, entity, u32(entity + E.health)); health = u32(entity + E.health);
      }
      word(health + 24, 1178304512); setHealthMaximum(health, 5, scratch + 8, scratch);
      const transform = ensureTransform(entity), sourceTransform = u32(petalEntity + E.transform);
      ensureWorld(sourceTransform);
      const y = double(sourceTransform + 96), x = double(sourceTransform + 88);
      setPosition(transform, x, y, scratch + 8, scratch);
      if (!u32(entity + 184)) {
        const score = call(148, u32(entity) + 1396) >>> 0;
        word(entity + 184, score); word(score, entity);
        const epoch = u32(u32(entity) + 2140);
        word(score + 12, 0); byte(score + 8, 0); word(score + 4, epoch); call(147, entity, score);
      }
      ensureWebTag(entity);
      const effects = ensureWebEffects(entity), effect = call(20, 4) >>> 0;
      word(effect, 6508); word(scratch + 8, effect); call(271, effects, 50, scratch + 8);
      const residual = u32(scratch + 8); if (residual) virtual(residual, 1);
      word(effects + 12, 50); call(73, entity, ownerOf(petalEntity));
    });
  }

  const hooks = {
    146: callback => destroyPeasCallback(callback, 0, true),
    272: launchPeas,
    273: callback => destroyPeasCallback(callback, 0),
    431: (o, b, c) => splitPeas(o, b, c, 34, true, true, 6720),
    676: (o, b, c) => splitPeas(o, b, c, 11, false, false, 5736),
    681: (o, b, c) => splitPeas(o, b, c, 12, true, false, 5816),
    691: (b, unused, attacker, target) => poisonHit(attacker, target, 4444.444444444444),
    693: (o, b, c) => hatchEgg(o, b, c, 1000, 9),
    719: (o, b, c) => hatchEgg(o, b, c, 2500, 12),
    732: spawnWeb,
    744: (packet, source) => { word(packet + 4, u32(source + 24)); word(packet, 1091567616); },
    745: effect => { word(effect, 5564); unlink(effect + 24); call(14, effect); },
    746: effect => { word(effect, 5564); unlink(effect + 24); return effect; },
    747: (b, attacker, target) => poisonHit(attacker, target, 16000 / 9),
  };
  for (const [copy, allocate, destroy, vtable] of [[673, 674, 675, 5736], [677, 678, 679, 5816], [741, 742, 743, 6720]]) {
    hooks[copy] = (source, destination) => clonePeasCallback(source, destination, vtable);
    hooks[allocate] = source => allocatePeasCallback(source, vtable);
    hooks[destroy] = source => destroyPeasCallback(source, vtable);
  }
  for (const id of functionIds) { const body = hooks[id]; hooks[id] = (...args) => body(...args.map(value => value >>> 0)); }
  return hooks;
}
