/** Server health loss, reflection, death, retained loot and death attribution.
 * Recovered from original func43; offsets with uncertain names remain explicit.
 * Dependencies run through the shared runtime; this module never calls func43.
 */
const f32 = Math.fround;
export const functionIds = Object.freeze([43]);

export function createDamageHooks(runtime) {
  let memoryBuffer, view;
  function access(pointer, width) {
    if (memoryBuffer !== runtime.memory.buffer) {
      memoryBuffer = runtime.memory.buffer;
      view = new DataView(memoryBuffer);
    }
    if ((pointer >>> 0) + width > view.byteLength) throw new WebAssembly.RuntimeError('memory access out of bounds');
    return view;
  }
  const u8 = p => access(p, 1).getUint8(p >>> 0);
  const i8 = p => access(p, 1).getInt8(p >>> 0);
  const u16 = p => access(p, 2).getUint16(p >>> 0, true);
  const u32 = p => access(p, 4).getUint32(p >>> 0, true);
  const f = p => access(p, 4).getFloat32(p >>> 0, true);
  const d = p => access(p, 8).getFloat64(p >>> 0, true);
  const long = p => access(p, 8).getBigUint64(p >>> 0, true);
  const byte = (p, v) => access(p, 1).setUint8(p >>> 0, v);
  const short = (p, v) => access(p, 2).setUint16(p >>> 0, v, true);
  const uint = (p, v) => access(p, 4).setUint32(p >>> 0, v, true);
  const float = (p, v) => access(p, 4).setFloat32(p >>> 0, v, true);
  const double = (p, v) => access(p, 8).setFloat64(p >>> 0, v, true);
  const putLong = (p, v) => access(p, 8).setBigUint64(p >>> 0, BigInt.asUintN(64, v), true);
  const call = (id, ...args) => runtime.call(id, ...args);

  function invalidate(entity, includeSpawnRevision = false) {
    for (const offset of [264876, 264880]) {
      const address = u32(entity) + ((u32(entity + 16) & 16383) << 3) + offset;
      const cached = u32(address); uint(address, 0);
      if (cached) { call(14, u32(cached + 12)); call(14, cached); }
    }
    const world = u32(entity), epoch = u32(world + 2140), index = u32(entity + 16) & 16383;
    uint(world + (index << 2) + 68268, epoch); uint(world + (index << 2) + 133804, epoch);
    if (includeSpawnRevision) uint(world + (index << 2) + 199340, epoch);
  }
  function mark(component, componentRevision, entityRevision) {
    const entity = u32(component);
    if (!entity) return;
    const epoch = u32(u32(entity) + 2140);
    uint(entity + entityRevision, epoch); uint(entity + entityRevision + 4, u32(u32(entity) + 2140));
    invalidate(entity); uint(component + componentRevision, u32(u32(u32(component)) + 2140));
  }
  function resetTracking() {
    for (const base of [8551040, 8555152]) {
      call(14, u32(base + 12)); putLong(base + 8, 0n); putLong(base, 0n);
    }
  }
  function appendTracked(base, source, count) {
    if (u32(base)) uint(base, 0);
    let pointer = u32(base + 12), capacity = pointer ? u32(base + 8) : 4096;
    const used = u32(base + 4), required = (used + count) >>> 0;
    if (capacity < required) {
      do { capacity = (capacity << 1) >>> 0; } while (capacity < required);
      const previous = pointer || base + 16;
      pointer = call(16, capacity); const copied = call(15, pointer, previous, used);
      if (previous !== base + 16) call(14, previous);
      uint(base + 12, copied); uint(base + 8, capacity);
    }
    call(15, (pointer || base + 16) + used, source, count); uint(base + 4, required);
  }
  function trackingChanged() {
    const size = u32(8551044);
    return size !== u32(8555156) || (size !== 0 && call(57, u32(8551052) || 8551056, u32(8555164) || 8555168, size) !== 0);
  }
  function trackedByte(component, offset, value, componentRevision, entityRevision) {
    if (u8(component + offset) === value) return;
    resetTracking();
    byte(8551056, u8(component + offset)); uint(8551044, 1);
    byte(component + offset, value); byte(8555168, value); uint(8555156, 1);
    if (trackingChanged()) mark(component, componentRevision, entityRevision);
  }
  function trackedFloat(component, offset, value, componentRevision, entityRevision, sourceBits) {
    if (f(component + offset) === value) return;
    resetTracking();
    uint(8551056, u32(component + offset)); uint(8551044, 4);
    if (sourceBits === undefined) float(component + offset, value); else uint(component + offset, sourceBits);
    uint(8555168, u32(component + offset)); uint(8555156, 4);
    if (trackingChanged()) mark(component, componentRevision, entityRevision);
  }

  function nextRandom(address) {
    const state = u32(address), quotient = Math.floor(state / 44488);
    const first = Math.imul((state + Math.imul(quotient, -44488)) | 0, 48271) >>> 0;
    const second = Math.imul(quotient, 3399) >>> 0;
    const result = ((first < second ? 2147483647 : 0) + first - second) >>> 0;
    uint(address, result); return result;
  }
  function rarity(petal) { return u32(((((petal - 1) & 255) > 37) ? 0 : petal * 52 + 8545792) + 24); }
  function slotCount(level, first = 13) { return level < 15 ? first : level < 30 ? first + 1 : level < 45 ? first + 2 : first + 3; }
  function playerOwner(entity) {
    while (entity && !(u8(entity + 92) & 32)) {
      const flags = u8(entity + 93), preferred = (flags & 64) ? u32(entity + 236) : 0;
      if (!preferred && !(flags & 64)) return 0;
      entity = preferred || u32(entity + 224);
    }
    return entity;
  }

  function emitHit(entity) {
    const world = u32(entity), id = u32(entity + 16);
    let included = true;
    if (!u8(world + 396008)) {
      let count = u32(world + 395960), pointer = u32(world + 395968);
      const end = pointer + (count << 3), index = id & 16383, generation = id >>> 14;
      while (count) {
        const half = count >>> 1, middle = pointer + (half << 3), candidate = u32(middle);
        const less = (candidate & 16383) === index ? (candidate >>> 14) < generation : (candidate & 16383) < index;
        if (less) { pointer = middle + 8; count = count - half - 1; } else count = half;
      }
      if (pointer !== end) {
        const candidate = u32(pointer);
        included = (candidate & 16383) === index ? generation < (candidate >>> 14) : index < (candidate & 16383);
      }
    }
    const message = call(20, 4124);
    putLong(message + 12, 0n); putLong(message + 4, 0n); uint(message, 5184);
    uint(message + 16, 5); putLong(message + 20, 0n); uint(message + 29, (id << 18) | (id >>> 14)); byte(message + 28, 11);
    if (!included && !u8(world + 396008)) {
      const epoch = u32(world + 2140); uint(message + 4, u32(message + 4) + 1);
      const count = u32(world + 395984), required = (count + 1) >>> 0;
      let capacity = u32(world + 395988), pointer = u32(world + 395992);
      if (capacity < required) {
        capacity = capacity ? capacity << 1 : 256;
        while ((capacity >>> 0) < required) capacity <<= 1;
        const old = pointer; pointer = call(16, capacity << 4);
        for (let i = 0; i < count; i++) {
          const from = old + (i << 4), to = pointer + (i << 4);
          uint(to, u32(from)); uint(to + 4, u32(from + 4)); uint(to + 8, u32(from + 8));
          putLong(from + 4, 0n); byte(to + 12, u8(from + 12));
        }
        call(14, old); uint(world + 395992, pointer); uint(world + 395988, capacity);
      }
      const entry = pointer + (count << 4);
      uint(entry + 4, message + 12); uint(entry, epoch); byte(entry + 12, 0); uint(entry + 8, message);
      uint(world + 395984, required);
    }
    const references = u32(message + 4); uint(message + 4, references - 1);
    if (!references) {
      runtime.indirect({ parameters: ['i32'], results: [] }, u32(u32(message) + 8), message);
      call(35, message);
    }
  }

  // libc++'s shuffle selects [0, remaining) using minstd_rand and an
  // independent-bits engine. Real loadouts contain at most sixteen entries.
  function shufflePetals(begin, count) {
    for (let position = begin, remaining = count; position < begin + count - 1; position++) {
      const range = remaining--;
      let choice = 0;
      if (remaining) {
        const bits = Math.ceil(Math.log2(range)), mask = 2 ** bits - 1;
        const ceiling = Math.floor(2147483646 / 2 ** bits) * 2 ** bits;
        do {
          let sample;
          do { sample = (nextRandom(8573028) - 1) >>> 0; } while (sample >= ceiling);
          choice = sample & mask;
        } while (choice >= range);
      }
      if (choice) { const old = u8(position); byte(position, u8(position + choice)); byte(position + choice, old); }
    }
  }
  function retainPlayerLoot(loadout, frame) {
    for (let group = 0; group < 6; group++) byte(frame + 32 + group * 17, 0);
    const count = slotCount(u8(loadout + 148));
    let occupied = 0;
    function collect(petal) {
      const group = frame + 32 + rarity(petal) * 17, size = u8(group);
      byte(group + size + 1, petal); byte(group, size + 1);
    }
    for (let index = 0; index < count; index++) {
      const petal = u8(loadout + 20 + index);
      if (petal) { collect(petal); occupied++; }
    }
    let bagCount = u8(loadout + 704), limit = count - occupied;
    let bagIndex = bagCount < limit ? 0 : bagCount - limit;
    for (; bagIndex < bagCount; bagIndex++) collect(u8(loadout + 705 + bagIndex));
    byte(frame + 24, 0);
    let retained = 0, lost = 0;
    for (let tier = 5; tier >= 0; tier--) {
      const group = frame + 32 + tier * 17, size = u8(group);
      if (size) {
        if (!(u8(8569380) & 1) && call(32, 8569380)) {
          const text = call(20, 16); uint(frame + 144, text); putLong(frame + 148, -9223371968135299060n);
          byte(text + 12, 0); uint(text + 8, u32(2676)); putLong(text, long(2668));
          call(219, frame + 144); if (i8(frame + 155) < 0) call(14, u32(frame + 144));
          const seed = u32Result(call(130)) % 2147483647; uint(8573028, seed || 1); call(31, 8569380);
        }
        shufflePetals(group + 1, size);
        for (let index = 0; index < u8(group); index++) {
          const petal = u8(group + index + 1);
          if (petal === 1 || f32(f32((nextRandom(8573024) - 1) >>> 0) * 2 ** -31) < 0.1) continue;
          if ((retained & 255) < 3) byte(frame + 25 + ((retained++) & 255), petal);
          else if ((lost & 255) <= 9) byte(frame + 9 + ((lost++) & 255), petal);
        }
      }
      byte(frame + 24, retained);
    }
    for (let index = 0; index < (retained & 255); index++) {
      const pointer = frame + 25 + index;
      if (rarity(u8(pointer)) >= 2 && f32(f32((nextRandom(8573024) - 1) >>> 0) * 2 ** -31) < 0.01) byte(pointer, 19);
    }
    const owner = playerOwner(u32(loadout)), player = owner ? u32(owner + 120) : 0;
    if (player) {
      const count = Math.min(lost & 255, 10);
      trackedByte(player, 96, count, 144, 296);
      for (let index = 0; index < count; index++) {
        const petal = u8(frame + index + 9);
        if (petal !== u8(player + index + 28)) {
          const entity = u32(player);
          if (entity) {
            const epoch = u32(u32(entity) + 2140);
            uint(entity + 296, epoch); uint(entity + 300, u32(u32(entity) + 2140)); invalidate(entity);
            const current = u32(u32(u32(player)) + 2140); uint(player + 124, current); uint(player + 40 + (index << 2), current);
          }
          byte(player + index + 28, petal);
        }
      }
    }
    const loot = u32(u32(loadout) + 204);
    if (loot === frame + 16) return;
    byte(loot + 8, 0);
    const size = u8(frame + 24);
    for (let index = 0; index < size; index++) byte(loot + index + 9, u8(frame + index + 25));
    byte(loot + 8, size);
  }
  function u32Result(value) { return value >>> 0; }

  function takeSlot(pool, stride) {
    const freeCount = u32(pool + 16);
    if (freeCount) {
      const heap = u32(pool + 24), result = u32(heap);
      if (freeCount === 1) { uint(pool + 16, 0); return result; }
      const last = heap + (freeCount << 2) - 4; uint(heap, u32(last)); uint(last, result);
      const remaining = freeCount - 1;
      if (freeCount !== 2) {
        const root = u32(heap); let child = 1;
        if (freeCount >= 4 && u32(heap + 4) < u32(heap + 8)) child = 2;
        let value = u32(heap + (child << 2));
        if (value >= root) {
          const lastParent = (freeCount - 3) >> 1; let hole = 0;
          for (;;) {
            uint(heap + (hole << 2), value); hole = child;
            if (child > lastParent) break;
            child = (child << 1) | 1;
            if (remaining > child + 1 && u32(heap + (child << 2)) < u32(heap + ((child + 1) << 2))) child++;
            value = u32(heap + (child << 2)); if (value < root) break;
          }
          uint(heap + (hole << 2), root);
        }
      }
      uint(pool + 16, remaining); return result;
    }
    const used = u32(pool);
    if (used <= 127) { const chunk = u32(u32(pool + 12) + (u32(pool + 4) << 2) - 4); uint(pool, used + 1); return chunk + used * stride; }
    const chunk = call(16, stride * 128), count = u32(pool + 4), required = (count + 1) >>> 0;
    let capacity = u32(pool + 8), pointer = u32(pool + 12);
    if (capacity < required) {
      capacity = capacity ? capacity << 1 : 1024; while ((capacity >>> 0) < required) capacity <<= 1;
      const previous = pointer; pointer = call(16, capacity << 2); const copied = call(15, pointer, previous, count << 2);
      call(14, previous); uint(pool + 12, copied); uint(pool + 8, capacity);
    }
    uint(pointer + (count << 2), chunk); uint(pool, 1); uint(pool + 4, required); return chunk;
  }
  function ensurePosition(entity) {
    let position = u32(entity + 168);
    if (!position) {
      position = call(97, u32(entity) + 1220); uint(entity + 168, position); uint(position, entity);
      const epoch = u32(u32(entity) + 2140);
      putLong(position + 8, 0n); uint(position + 4, epoch); putLong(position + 16, 0n); putLong(position + 24, 0n);
      uint(position + 32, 0); uint(position + 112, 0); byte(position + 36, 1); putLong(position + 40, 0n);
      putLong(position + 48, 0n); putLong(position + 56, 0n); putLong(position + 64, 0n); putLong(position + 72, 0n); byte(position + 80, 0);
      call(96, entity, u32(entity + 168)); position = u32(entity + 168);
    }
    return position;
  }
  function ensurePhysics(entity) {
    let physics = u32(entity + 188);
    if (!physics) {
      physics = call(65, u32(entity) + 1440); uint(entity + 188, physics); uint(physics, entity);
      const epoch = u32(u32(entity) + 2140);
      putLong(physics + 8, 0n); uint(physics + 4, epoch); byte(physics + 16, 0); putLong(physics + 20, 0n);
      putLong(physics + 28, 0n); uint(physics + 36, 0); uint(physics + 48, 16777217); putLong(physics + 40, 1065353216n);
      call(64, entity, u32(entity + 188)); physics = u32(entity + 188);
    }
    return physics;
  }
  function ensurePickup(entity) {
    let pickup = u32(entity + 100);
    if (pickup) return pickup;
    const world = u32(entity); pickup = takeSlot(world + 4, 72); uint(entity + 100, pickup); uint(pickup, entity);
    const epoch = u32(u32(entity) + 2140);
    uint(pickup + 64, pickup + 56); uint(pickup + 60, pickup + 56); uint(pickup + 56, 0);
    putLong(pickup + 48, 0n); byte(pickup + 40, 0); putLong(pickup + 32, 0n); byte(pickup + 24, 0);
    putLong(pickup + 12, 0n); short(pickup + 8, 0); uint(pickup + 4, epoch); byte(entity + 92, u8(entity + 92) | 1);
    const attached = u32(entity + 100); invalidate(entity, true);
    const currentWorld = u32(entity), count = u32(currentWorld + 36), required = (count + 1) >>> 0;
    let capacity = u32(currentWorld + 40), pointer = u32(currentWorld + 44);
    if (capacity < required) {
      capacity = capacity ? capacity << 1 : 1024; while ((capacity >>> 0) < required) capacity <<= 1;
      const previous = pointer; pointer = call(16, capacity << 2); const copied = call(15, pointer, previous, count << 2);
      call(14, previous); uint(currentWorld + 44, copied); uint(currentWorld + 40, capacity);
    }
    uint(pointer + (count << 2), attached); uint(currentWorld + 36, required);
    const revision = u32(u32(entity) + 2140); uint(entity + 256, revision); uint(entity + 260, u32(u32(entity) + 2140));
    invalidate(entity); return u32(entity + 100);
  }
  function legendaryExists(world, dead, petal) {
    const count = u32(world + 1764), list = u32(world + 1772);
    let skipNext = false;
    for (let index = 0; index < count; index++) {
      if (skipNext) { skipNext = false; continue; }
      const loadout = u32(list + (index << 2));
      if (u32(loadout) === dead) continue;
      for (let slot = 0, size = slotCount(u8(loadout + 148)); slot < size; slot++) {
        if ((slot <= 15 ? u8(loadout + 20 + slot) : 0) === petal) { skipNext = true; break; }
      }
      if (skipNext) return true;
    }
    const pickups = u32(world + 36), pickupList = u32(world + 44);
    for (let index = 0; index < pickups; index++) if (u8(u32(pickupList + (index << 2)) + 8) === petal) return true;
    return false;
  }
  function spawnLoot(entity, sourcePosition, frame) {
    const world = u32(entity), loot = u32(entity + 204);
    if (!loot) return;
    for (let index = 0; index < u8(loot + 8); index++) {
      const petal = u8(loot + 9 + index), drop = call(74, world);
      if (!drop || ((petal - 1) & 255) > 37) continue;
      const tier = rarity(petal);
      if (tier === 5 && legendaryExists(world, entity, petal)) continue;
      const position = ensurePosition(drop), physics = ensurePhysics(drop);
      putLong(frame + 32, 4630122629401935872n); call(26, physics + 8, frame + 32); byte(physics + 49, 1);
      if (!u8(sourcePosition + 80)) call(17, sourcePosition);
      const x = d(sourcePosition + 88), y = d(sourcePosition + 96); double(frame + 32, x); double(frame + 144, y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (u8(position + 80)) {
          byte(position + 80, 0);
          let child = u32(u32(position) + 84);
          while (child) { const next = u32(child + 8); call(34, child); child = next; }
        }
        call(44, position + 20, frame + 32); call(47, position + 16, frame + 144);
      }
      double(position + 40, d(sourcePosition + 40) + d(sourcePosition + 56));
      const vy = d(sourcePosition + 48), additive = d(sourcePosition + 64);
      byte(position + 36, 0); double(position + 48, vy + additive);
      if (!u32(drop + 184)) {
        const shape = call(148, u32(drop) + 1396); uint(drop + 184, shape); uint(shape, drop);
        const epoch = u32(u32(drop) + 2140); uint(shape + 12, 0); byte(shape + 8, 0); uint(shape + 4, epoch); call(147, drop, shape);
      }
      const pickup = ensurePickup(drop), duration = tier >= 2 && tier <= 5 ? d(6928 + ((tier - 2) << 3)) : 32000;
      call(21, frame + 32); putLong(pickup + 48, long(frame + 40)); putLong(pickup + 40, long(frame + 32));
      call(21, frame + 32); const now = d(frame + 40); byte(pickup + 24, 1); double(pickup + 32, duration + now);
      trackedByte(pickup, 8, petal, 12, 256);
      const size = u8(loot + 8);
      if (size >= 2) {
        const angle = f32(index * (2 * Math.PI) / size), cosine = call(77, angle), current = u32(drop + 168);
        double(current + 40, d(current + 40) + f32(cosine * f32(0.6)));
        const sine = call(78, angle); double(current + 48, d(current + 48) + f32(sine * f32(0.6)));
      }
    }
    const reward = f(loot + 4);
    if (reward > 0 && entity) return reward;
  }
  function enqueueRemoval(entity) {
    if (u32(entity + 32)) return;
    const world = u32(entity); uint(world + 2172, u32(world + 2172) + 1);
    const head = u32(world + 2176), previous = u32(world + 2180);
    uint(entity + 40, 0); uint(entity + 36, previous); uint(entity + 32, world + 2172);
    if (!head) uint(world + 2176, entity + 32); if (previous) uint(previous + 8, entity + 32); uint(world + 2180, entity + 32);
  }
  function assignLastAttacker(player, attacker) {
    if (attacker === u32(player + 156)) return;
    let previous = u32(player + 160); uint(previous + 8, u32(player + 164)); uint(u32(player + 164) + 4, previous);
    uint(player + 164, player + 156); uint(player + 156, 0);
    const handle = player + 156; let owner;
    if (!attacker) { uint(handle, 0); owner = handle; }
    else {
      uint(handle, u32(attacker + 4)); previous = u32(attacker + 12); uint(player + 164, previous); uint(previous + 4, handle); owner = attacker + 4;
    }
    uint(player + 160, owner); uint((attacker ? attacker + 12 : player + 164), handle);
  }
  function updateKillerName(player, attacker, frame) {
    const name = attacker ? u32(attacker + 160) : 0;
    if (name) {
      if (i8(name + 19) >= 0) { uint(frame + 40, u32(name + 16)); putLong(frame + 32, long(name + 8)); }
      else call(269, frame + 32, u32(name + 8), u32(name + 12));
    } else { byte(frame + 32, 0); byte(frame + 43, 0); }
    const field = player + 16;
    const stringSize = address => i8(address + 11) < 0 ? u32(address + 4) : u8(address + 11);
    const stringData = address => i8(address + 11) < 0 ? u32(address) : address;
    const size = stringSize(field), otherSize = stringSize(frame + 32);
    if (size !== otherSize || (size && call(57, stringData(field), stringData(frame + 32), size))) {
      resetTracking(); appendTracked(8551040, stringData(field), stringSize(field) + 1);
      if (field !== frame + 32) {
        if (i8(field + 11) >= 0) {
          if (i8(frame + 43) >= 0) { putLong(field, long(frame + 32)); uint(field + 8, u32(frame + 40)); }
          else call(214, field, u32(frame + 32), u32(frame + 36));
        } else call(268, field, stringData(frame + 32), otherSize);
      }
      appendTracked(8555152, stringData(field), stringSize(field) + 1);
      if (trackingChanged()) mark(player, 120, 296);
    }
    if (i8(frame + 43) < 0) call(14, u32(frame + 32));
  }

  /** Original func43. Fourth argument points to two packed damage-option bytes. */
  function damage(health, attacker, amount, options) {
    health |= 0; attacker |= 0; amount = f32(amount); options |= 0;
    const savedStack = runtime.stackPointer.value, frame = (savedStack - 160) | 0;
    runtime.stackPointer.value = frame;
    if (f(health + 8) <= 0) { runtime.stackPointer.value = savedStack; return; }
    let entity = u32(health); const shape = u32(entity + 184), flags = u16(options);
    const apply = !attacker || (u8(u32(entity) + 872) & 1);
    amount = apply ? amount : 0;
    float(frame + 32, f32(f(health + 8) - amount)); const destination = call(18, health + 8, frame + 32);
    if (f(health + 8) < 0) {
      resetTracking(); uint(8551056, u32(health + 8)); uint(8551044, 4); uint(health + 8, 0); uint(8555168, 0); uint(8555156, 4);
      if (trackingChanged()) call(280, destination);
    }
    const eventFlags = apply ? flags : 1;
    entity = u32(health); call(426, entity, attacker);
    const loadout = u32(entity + 200);
    if (loadout) {
      let owner = u32(loadout); const position = u32(owner + 168);
      if (!u8(position + 80)) { call(17, position); owner = u32(loadout); }
      const level = u8(loadout + 148), world = u32(owner);
      let reflects = true;
      if (d(position + 88) < call(84, world + 624, level) && f(loadout + 288) >= (u8(world + 873) === 1 ? 5000 : 45000)) reflects = false;
      if (reflects && flags <= 255 && attacker) {
        let thorns = 0;
        for (let index = 0, count = slotCount(level, 5); index < count; index++) if (!u8(loadout + 584 + index * 3)) thorns += u8(loadout + 20 + index) === 36;
        if (thorns) {
          let target = attacker;
          while (!(u8(target + 95) & 32)) { target = (u8(target + 93) & 64) ? u32(target + 236) : 0; if (!target) break; }
          const targetHealth = target ? u32(target + 164) : 0;
          if (targetHealth) { byte(frame + 32, eventFlags); byte(frame + 33, 1); damage(targetHealth, entity, f32(amount * f32(0.25)), frame + 32); }
        }
      }
    }
    if (shape && !(eventFlags & 255)) {
      const target = u32(health), epoch = u32(u32(target) + 2140);
      if (epoch !== u32(health + 28)) { uint(health + 28, epoch); emitHit(target); }
    }
    if (!(f(health + 8) <= 0)) { runtime.stackPointer.value = savedStack; return; }
    byte(health + 32, 1); call(21, frame + 32); const now = d(frame + 40); byte(health + 40, 1); double(health + 48, now + 1000);
    if (shape) trackedByte(shape, 8, u8(shape + 8) | 1, 12, 448);
    entity = u32(health); const sourcePosition = u32(entity + 168), world = u32(entity);
    if (sourcePosition) {
      const loadout = u32(entity + 200); if (loadout) retainPlayerLoot(loadout, frame);
      const reward = spawnLoot(entity, sourcePosition, frame);
      if (reward > 0 && attacker) {
        const owner = playerOwner(attacker), player = owner ? u32(owner + 120) : 0, body = player ? u32(player + 100) : 0;
        if (body) call(215, u32(body + 200), reward);
      }
    }
    const lifetime = u32(entity + 212); if (lifetime) call(424, lifetime);
    call(426, entity, attacker);
    const owned = u32(entity + 200);
    if (owned) for (let pointer = owned + 296; pointer !== owned + 584; pointer += 12) {
      const child = u32(pointer); if (!child) continue;
      const childHealth = u32(child + 164);
      if (childHealth) { short(frame + 32, 1); damage(childHealth, attacker, f(childHealth + 8), frame + 32); }
      else enqueueRemoval(child);
    }
    const callbacks = u32(entity + 124);
    if (callbacks) { const object = u32(callbacks + 20); runtime.indirect({ parameters: ['i32', 'i32', 'i32'], results: [] }, u32(u32(object) + 24), object, entity, attacker); }
    if (!(u8(entity + 95) & 32)) { runtime.stackPointer.value = savedStack; return; }
    const owner = playerOwner(entity), player = owner ? u32(owner + 120) : 0;
    if (!player || u32(player + 100) !== entity) { runtime.stackPointer.value = savedStack; return; }
    let resolved = attacker;
    if (attacker) {
      for (;;) {
        uint(frame + 32, 0); byte(frame + 36, 0); byte(frame + 34, 20);
        uint(frame + 144, u32(resolved + 92)); byte(frame + 148, u8(resolved + 96)); short(frame + 144, 0);
        byte(frame + 148, 0); byte(frame + 147, 0); byte(frame + 146, u8(frame + 146) & 20);
        if (!call(57, frame + 144, frame + 32, 5)) break;
        const preferred = (u8(resolved + 93) & 64) ? u32(resolved + 224) : 0;
        if (!preferred && !(u8(resolved + 93) & 64)) { resolved = 0; break; }
        resolved = preferred || u32(resolved + 236); if (!resolved) break;
      }
      if (!resolved) resolved = attacker;
    }
    assignLastAttacker(player, resolved);
    trackedFloat(player, 84, entity ? f(u32(entity + 200) + 16) : 0, 132, 296, entity ? u32(u32(entity + 200) + 16) : 0);
    trackedByte(player, 97, u8(u32(u32(player + 100) + 200) + 148), 148, 296);
    updateKillerName(player, resolved, frame);
    runtime.stackPointer.value = savedStack;
  }
  return Object.freeze({ 43: damage });
}
