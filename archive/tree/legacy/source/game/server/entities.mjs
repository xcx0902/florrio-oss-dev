/** Recovered entity creation and health logic from the shipped sp_server.wasm.
 *
 * The entity/component ABI is retained because the remaining simulation still
 * shares this memory. Numbers in COMPONENTS are layout offsets, not game rules.
 * Family-specific AI setters remain explicit dependencies (see entities-map.json).
 */
const f32 = Math.fround;
const RNG_STATE = 8573024;
export const functionIds = Object.freeze([56, 216, 415, 417, ...Array.from({ length: 22 }, (_, index) => 697 + index)]);
const COMPONENTS = Object.freeze({
  spider: { slot: 112, pool: 136, list: 168, flag: 92, mask: 8, revision: 280 },
  square: { slot: 128, pool: 348, list: 380, flag: 93, mask: 1, revision: 320 },
  hornet: { slot: 180, pool: 1352, list: 1384, flag: 94, mask: 128, revision: 440 },
  antHole: { slot: 136, pool: 436, list: 468, flag: 93, mask: 4, revision: 336, stride: 12 },
  bee: { slot: 196, pool: 1688, list: 1720, flag: 95, mask: 16, revision: 480 },
  cactus: { slot: 176, pool: 1308, list: 1340, flag: 94, mask: 64, revision: 432 },
});

/** Original ABI hooks; runtime.stackPointer is the module's mutable i32 global. */
export function createEntityHooks(runtime) {
  const view = () => new DataView(runtime.memory.buffer);
  const u8 = address => view().getUint8(address >>> 0);
  const u32 = address => view().getUint32(address >>> 0, true);
  const getFloat = address => view().getFloat32(address >>> 0, true);
  const byte = (address, value) => view().setUint8(address >>> 0, value);
  const uint = (address, value) => view().setUint32(address >>> 0, value, true);
  const short = (address, value) => view().setUint16(address >>> 0, value, true);
  const float = (address, value) => view().setFloat32(address >>> 0, value, true);
  const double = (address, value) => view().setFloat64(address >>> 0, value, true);
  const long = (address, value) => view().setBigUint64(address >>> 0, BigInt.asUintN(64, value), true);
  const call = (id, ...args) => runtime.call(id, ...args);

  function withStack(size, work) {
    const saved = runtime.stackPointer.value;
    const frame = (saved - size) | 0;
    runtime.stackPointer.value = frame;
    // Like a WASM trap, an exception deliberately leaves the current stack value.
    const result = work(frame);
    runtime.stackPointer.value = saved;
    return result;
  }

  /** The shipped minstd_rand generator, including unsigned i32 overflow. */
  function nextRandom() {
    const state = u32(RNG_STATE);
    const quotient = Math.floor(state / 44488) >>> 0;
    const product = Math.imul((state + Math.imul(quotient, -44488)) | 0, 48271) >>> 0;
    const correction = Math.imul(quotient, 3399) >>> 0;
    const next = ((product < correction ? 2147483647 : 0) + product - correction) >>> 0;
    uint(RNG_STATE, next);
    return next;
  }

  /** Invalidate both cached serializations and mark the entity's update epoch. */
  function invalidateEntity(entity, includeThirdEpoch = false) {
    for (const cacheOffset of [264876, 264880]) {
      const world = u32(entity), id = u32(entity + 16) & 16383;
      const address = (world + (id << 3) + cacheOffset) | 0;
      const packet = u32(address);
      uint(address, 0);
      if (packet) {
        call(14, u32(packet + 12));
        call(14, packet);
      }
    }
    const world = u32(entity), id = u32(entity + 16) & 16383, epoch = u32(world + 2140);
    uint(world + (id << 2) + 68268, epoch);
    uint(world + (id << 2) + 133804, epoch);
    if (includeThirdEpoch) uint(world + (id << 2) + 199340, epoch);
  }

  function growPointerArray(pointer, count, capacity, minimum) {
    let next = capacity ? capacity << 1 : 1024;
    while ((next >>> 0) < (minimum >>> 0)) next <<= 1;
    const allocated = call(16, next << 2);
    const copied = call(15, allocated, pointer, count << 2);
    call(14, pointer);
    return { pointer: copied >>> 0, capacity: next >>> 0 };
  }

  /** The 12-byte ant-hole pool; its free list is a maximum-address heap. */
  function takeAntHoleSlot(pool) {
    const freeCount = u32(pool + 16);
    if (freeCount) {
      const heap = u32(pool + 24), result = u32(heap);
      if (freeCount === 1) { uint(pool + 16, 0); return result; }
      const last = (heap + (freeCount << 2) - 4) | 0;
      uint(heap, u32(last));
      uint(last, result);
      const remaining = freeCount - 1;
      if (freeCount !== 2) {
        const root = u32(heap);
        let child = 1;
        if (freeCount >= 4 && u32(heap + 4) < u32(heap + 8)) child = 2;
        let value = u32(heap + (child << 2));
        if (value >= root) {
          const lastParent = (freeCount - 3) >> 1;
          let hole = 0;
          for (;;) {
            uint(heap + (hole << 2), value);
            hole = child;
            if (child > lastParent) break;
            child = (child << 1) | 1;
            if (remaining > child + 1 && u32(heap + (child << 2)) < u32(heap + ((child + 1) << 2))) child++;
            value = u32(heap + (child << 2));
            if (value < root) break;
          }
          uint(heap + (hole << 2), root);
        }
      }
      uint(pool + 16, remaining);
      return result;
    }
    const used = u32(pool);
    if (used <= 127) {
      const chunk = u32(u32(pool + 12) + (u32(pool + 4) << 2) - 4);
      uint(pool, used + 1);
      return (chunk + used * 12) >>> 0;
    }
    const chunk = call(16, 1536) >>> 0, count = u32(pool + 4), minimum = (count + 1) >>> 0;
    let capacity = u32(pool + 8), pointers = u32(pool + 12);
    if (capacity < minimum) {
      const grown = growPointerArray(pointers, count, capacity, minimum);
      pointers = grown.pointer; capacity = grown.capacity;
      uint(pool + 12, pointers); uint(pool + 8, capacity);
    }
    uint(pointers + (count << 2), chunk);
    uint(pool, 1); uint(pool + 4, minimum);
    return chunk;
  }

  function appendComponent(world, listOffset, component) {
    const list = (world + listOffset) | 0;
    const count = u32(list), minimum = (count + 1) >>> 0;
    let capacity = u32(list + 4), pointer = u32(list + 8);
    if (capacity < minimum) {
      const grown = growPointerArray(pointer, count, capacity, minimum);
      pointer = grown.pointer; capacity = grown.capacity;
      uint(list + 8, pointer); uint(list + 4, capacity);
    }
    uint(pointer + (count << 2), component);
    uint(list, minimum);
  }

  function ensureSpeciesComponent(entity, species) {
    const layout = COMPONENTS[species];
    let component = u32(entity + layout.slot);
    if (component) return component;
    let world = u32(entity);
    component = layout.stride === 12 ? takeAntHoleSlot(world + layout.pool) : call(116, world + layout.pool);
    uint(entity + layout.slot, component);
    uint(component, entity);
    world = u32(entity);
    const epoch = u32(world + 2140);
    if (layout.stride === 12) uint(component + 8, 0);
    uint(component + 4, epoch);
    byte(entity + layout.flag, u8(entity + layout.flag) | layout.mask);
    invalidateEntity(entity, true);
    world = u32(entity);
    appendComponent(world, layout.list, component);
    world = u32(entity);
    uint(entity + layout.revision, u32(world + 2140));
    uint(entity + layout.revision + 4, u32(world + 2140));
    invalidateEntity(entity);
    return u32(entity + layout.slot);
  }

  function ensureHealth(entity) {
    let health = u32(entity + 164);
    if (health) return health;
    health = call(68, u32(entity) + 1176);
    uint(entity + 164, health); uint(health, entity);
    const epoch = u32(u32(entity) + 2140);
    long(health + 48, 0n); byte(health + 40, 0); uint(health + 4, epoch);
    long(health + 8, 0n); long(health + 16, 0n); long(health + 24, 0n); byte(health + 32, 0);
    call(67, entity, u32(entity + 164));
    return u32(entity + 164);
  }

  function ensurePhysics(entity) {
    let physics = u32(entity + 188);
    if (physics) return physics;
    physics = call(65, u32(entity) + 1440);
    uint(entity + 188, physics); uint(physics, entity);
    const epoch = u32(u32(entity) + 2140);
    long(physics + 8, 0n); uint(physics + 4, epoch); byte(physics + 16, 0);
    long(physics + 20, 0n); long(physics + 28, 0n); uint(physics + 36, 0);
    uint(physics + 48, 16777217); long(physics + 40, 1065353216n);
    call(64, entity, u32(entity + 188));
    return u32(entity + 188);
  }

  /** Keep the current / maximum health ratio when the species is reconfigured. */
  function setMaximumHealth(health, maximum, scratch, ratioScratch) {
    float(scratch, maximum);
    const previousMaximum = getFloat(health + 12);
    if (previousMaximum <= 0) call(18, health + 8, scratch);
    else {
      float(ratioScratch, f32(f32(getFloat(health + 8) * maximum) / previousMaximum));
      call(18, health + 8, ratioScratch);
    }
    call(25, health + 12, scratch);
  }

  function setBody(physics, contactDamage, radius, scratch) {
    float(physics + 44, contactDamage);
    double(scratch, radius);
    call(26, physics + 8, scratch);
  }

  /** Family components have no additional initialized fields unless specified. */
  function familyComponent(entity, slot, pool, allocator, register, initialize = () => {}) {
    let component = u32(entity + slot);
    if (!component) {
      component = call(allocator, u32(entity) + pool);
      uint(entity + slot, component); uint(component, entity);
      const epoch = u32(u32(entity) + 2140);
      initialize(component);
      uint(component + 4, epoch);
      call(register, entity, u32(entity + slot));
      component = u32(entity + slot);
    }
    return component;
  }

  function initializeLadybug(entity, variant) {
    const component = familyComponent(entity, 144, 524, 116, 211);
    call(210, component, variant);
  }
  function initializeCentipede(entity, evil, isHead) {
    const component = familyComponent(entity, 172, 1264, 207, 206, pointer => {
      long(pointer + 12, 0n); short(pointer + 8, 0);
    });
    call(205, component, evil, isHead);
  }
  function initializeBeetle(entity, massive) {
    configureBeetle(familyComponent(entity, 152, 1044, 116, 416), massive);
  }
  function initializeAnt(entity, caste) {
    const component = familyComponent(entity, 132, 392, 106, 209, pointer => {
      uint(pointer + 12, 0); byte(pointer + 8, 0);
    });
    call(208, component, caste);
  }
  function initializeRock(entity, massive) {
    configureRock(familyComponent(entity, 108, 92, 116, 418), massive);
  }

  /** Original func417: randomize a rock/boulder's size and derived health. */
  function configureRock(component, massive) {
    withStack(16, frame => {
      const random = nextRandom();
      const radius = f32(f32((massive ? 40 : 20) / 2 ** 31 * f32((random - 1) >>> 0)) + (massive ? 60 : 20));
      const health = ensureHealth(u32(component));
      setMaximumHealth(health, f32((massive ? 2 : 1) * radius * 0.4), frame + 8, frame + 4);
      const physics = ensurePhysics(u32(component));
      setBody(physics, 10, radius, frame + 8);
      byte(physics + 48, 0);
    });
  }

  /** Original func415: beetle/massive-beetle body and AI profile. */
  function configureBeetle(component, massive) {
    withStack(96, frame => {
      const health = ensureHealth(u32(component));
      setMaximumHealth(health, massive ? 300 : 40, frame, frame + 92);
      setBody(ensurePhysics(u32(component)), massive ? 20 : 30, massive ? 80 : 40, frame);
      long(frame + 40, 0n); uint(frame + 47, 0); uint(frame + 40, 1162107259);
      long(frame + 32, 0n); byte(frame + 28, 0); float(frame + 8, 0.2);
      float(frame + 88, 1000); long(frame + 80, 1148846080n);
      float(frame + 72, 0); float(frame + 76, 500); long(frame + 64, 1069547520n);
      float(frame + 52, 1); float(frame + 56, 2.4);
      byte(frame + 16, 1); byte(frame + 4, 1); uint(frame, 0);
      float(frame + 20, 0.002); float(frame + 24, 2); float(frame + 12, massive ? 1.1 : 1);
      float(frame + 60, 600); byte(frame + 48, 1); float(frame + 44, 0.3);
      call(114, call(115, u32(component)), frame);
    });
  }

  // AI configuration is a 92-byte value copied by func114. Field names remain
  // offset-qualified where the consuming AI state machine is still unresolved.
  function writeDefaultAi(scratch) {
    long(scratch + 40, 0n); uint(scratch + 47, 0); long(scratch + 32, 0n); byte(scratch + 28, 0);
    long(scratch + 20, 4575657221408423936n); byte(scratch + 16, 0);
    float(scratch + 8, 0.2); float(scratch + 12, 0.2); byte(scratch + 4, 0); uint(scratch, 1039947569);
    float(scratch + 84, 0); float(scratch + 88, 1000);
    float(scratch + 76, 500); float(scratch + 80, 1000);
    long(scratch + 68, 0n); float(scratch + 60, 1000); float(scratch + 64, 1.5);
    float(scratch + 52, 1); float(scratch + 56, 2.4);
  }

  function initializeSpider(entity) {
    withStack(96, frame => {
      const species = ensureSpeciesComponent(entity, 'spider');
      setMaximumHealth(ensureHealth(u32(species)), 20, frame, frame + 92);
      setBody(ensurePhysics(u32(species)), 25, 25, frame);
      // Preserve the exact order/width of stores: padding is copied into the AI.
      long(frame + 40, 0n); uint(frame + 47, 0); uint(frame + 40, 1162107259);
      long(frame + 32, 0n); byte(frame + 28, 0);
      float(frame + 8, 0.2); float(frame + 12, 1);
      float(frame + 88, 1000); long(frame + 80, 1148846080n);
      float(frame + 72, 0); float(frame + 76, 500);
      long(frame + 64, 1069547520n);
      float(frame + 52, 1); float(frame + 56, 2.88);
      byte(frame + 16, 1); byte(frame + 4, 1); uint(frame, 0);
      float(frame + 60, 600); float(frame + 20, 0.002); float(frame + 24, 2);
      float(frame + 44, 0.45); byte(frame + 48, 1);
      call(114, call(115, u32(species)), frame);
    });
  }

  function initializeSquare(entity) {
    withStack(96, frame => {
      const species = ensureSpeciesComponent(entity, 'square');
      let owner = u32(species), name = u32(owner + 160);
      if (!name) {
        name = call(128, u32(owner) + 1132);
        uint(owner + 160, name); uint(name, owner);
        const epoch = u32(u32(owner) + 2140);
        long(name + 8, 0n); uint(name + 4, epoch); long(name + 16, 0n);
        call(266, owner, u32(owner + 160)); name = u32(owner + 160);
      }
      byte(frame + 11, 6); byte(frame + 6, 0);
      uint(frame, u32(1200 + 2008)); short(frame + 4, view().getUint16(1200 + 2012, true));
      call(265, name + 8, frame);
      if (view().getInt8(frame + 11) < 0) call(14, u32(frame));
      owner = u32(species);
      setMaximumHealth(ensureHealth(owner), 15, frame, frame + 92);
      setBody(ensurePhysics(u32(species)), 10, 30, frame);
      const ai = call(115, u32(species));
      writeDefaultAi(frame);
      call(114, ai, frame);
    });
  }

  function randomDelay(random) {
    // WAT 0x1.388p-19 is 5000 / 2^31; the decompiler rounds it to 0.000002.
    return f32(f32(f32((random - 1) >>> 0) * (5000 / 2 ** 31)) + 5000);
  }

  function initializeBee(entity) {
    withStack(96, frame => {
      const species = ensureSpeciesComponent(entity, 'bee');
      setMaximumHealth(ensureHealth(u32(species)), 15, frame, frame + 92);
      setBody(ensurePhysics(u32(species)), 50, 25, frame);
      uint(frame + 44, 0); uint(frame + 47, 0);
      const random = nextRandom();
      float(frame + 8, 0.2); float(frame + 12, 1);
      float(frame + 84, 0); float(frame + 88, 1000);
      float(frame + 76, 500); float(frame + 80, 1000);
      long(frame + 68, 0n); float(frame + 60, 1000); float(frame + 64, 1.5);
      float(frame + 52, 1); float(frame + 56, 2.4);
      byte(frame + 28, 1); byte(frame + 4, 1); uint(frame, 0);
      float(frame + 32, 0.002); float(frame + 36, 0.5);
      // The original constant is not exactly 0.002872: retain its float32 bits.
      uint(frame + 20, 993803864); float(frame + 24, 0.5); byte(frame + 16, 1);
      float(frame + 40, randomDelay(random));
      call(114, call(115, u32(species)), frame);
    });
  }

  function initializeHornet(entity) {
    withStack(112, frame => {
      const species = ensureSpeciesComponent(entity, 'hornet');
      setMaximumHealth(ensureHealth(u32(species)), 40, frame + 8, frame + 104);
      setBody(ensurePhysics(u32(species)), 50, 25, frame + 8);
      short(frame + 56, 0); byte(frame + 56, 1);
      const delayRandom = nextRandom(), aggressionRandom = nextRandom(), turnRandom = nextRandom();
      float(frame + 16, 0.2); float(frame + 20, 0.7);
      float(frame + 96, 1000); long(frame + 88, 1148846080n);
      float(frame + 80, 0); float(frame + 84, 500);
      float(frame + 72, 1.5); float(frame + 64, 2.4);
      byte(frame + 36, 1); byte(frame + 12, 1); uint(frame + 8, 0);
      float(frame + 40, 0.002); float(frame + 44, 0.5);
      uint(frame + 28, 993803864); float(frame + 32, 0.5);
      byte(frame + 24, 1); float(frame + 52, 0.6);
      float(frame + 48, randomDelay(delayRandom));
      byte(frame + 58, f32(f32((aggressionRandom - 1) >>> 0) / 2 ** 31) < 0.2);
      float(frame + 76, 500); float(frame + 68, 600);
      float(frame + 60, f32(f32(f32((turnRandom - 1) >>> 0) * f32(0.19999998807907104 / 2 ** 31)) + 0.5));
      long(frame + 104, 4294967296n);
      const sign = call(102, frame + 104);
      float(frame + 96, 2000); uint(frame + 92, 74);
      float(frame + 80, sign === 1 ? 0.4 : -0.4);
      call(114, call(115, u32(species)), frame + 8);
    });
  }

  function initializeAntHole(entity) {
    withStack(16, frame => {
      const species = ensureSpeciesComponent(entity, 'antHole');
      setMaximumHealth(ensureHealth(u32(species)), 300, frame + 8, frame + 4);
      const physics = ensurePhysics(u32(species));
      double(frame + 8, 40); call(26, physics + 8, frame + 8);
      byte(physics + 51, 0); byte(physics + 48, 0); float(physics + 44, 15);
      for (const caste of [0, 0, 0, 1, 1, 2]) call(143, species, caste);
    });
  }

  function initializeCactus(entity) {
    withStack(16, frame => {
      const species = ensureSpeciesComponent(entity, 'cactus');
      const random = nextRandom();
      const radius = f32(f32(f32((random - 1) >>> 0) * (20 / 2 ** 31)) + 40);
      const health = ensureHealth(u32(species));
      const maximum = f32(radius * 0.7);
      setMaximumHealth(health, maximum, frame + 8, frame + 4);
      const physics = ensurePhysics(u32(species));
      setBody(physics, 30, radius, frame + 8);
      byte(physics + 48, 0);
    });
  }

  /** Original func56: build one 116-byte species definition from input lists. */
  function initializeEntityDefinition(output, name, descriptionSpan, rarity, field28, drops, initializer) {
    uint(output, name);
    const descriptionPointer = u32(descriptionSpan), descriptionCount = u32(descriptionSpan + 4);
    byte(output + 4, descriptionCount);
    // Forward, word-at-a-time copy preserves the original overlapping behavior.
    for (let index = 0; index < descriptionCount; index++) {
      uint(output + 8 + (index << 2), u32(descriptionPointer + (index << 2)));
    }
    byte(output + 32, 0); float(output + 28, field28); uint(output + 24, rarity);
    let dropCount = u8(drops);
    for (let index = 0; index < dropCount; index++) {
      long(output + 36 + (index << 3), view().getBigUint64((drops + 4 + (index << 3)) >>> 0, true));
    }
    if (dropCount) dropCount = u8(drops);
    uint(output + 112, 1065353216); byte(output + 110, 0); short(output + 108, 1);
    uint(output + 104, 0); uint(output + 100, initializer); byte(output + 32, dropCount);
  }

  /** Original func216: apply healing only when behavior/owner rules permit it. */
  function healEntity(health, amount) {
    withStack(16, frame => {
      if (!(getFloat(health + 8) > 0)) return;
      const entity = u32(health), behaviors = u32(entity + 192);
      if (behaviors) {
        for (const [countOffset, pointerOffset] of [[16, 24], [28, 36]]) {
          const count = u32(behaviors + countOffset);
          if (!count) continue;
          let pointer = u32(behaviors + pointerOffset);
          const end = (pointer + (count << 2)) | 0;
          do {
            const behavior = u32(pointer), virtualTable = u32(behavior);
            if (runtime.table.get(u32(virtualTable + 16))(behavior)) return;
            pointer = (pointer + 4) | 0;
          } while (pointer !== end);
        }
      }
      let owner = u32(health);
      if (u32(owner + 200)) {
        for (;;) {
          if (u8(owner + 92) & 32) break;
          const flags = u8(owner + 93), linked = (flags & 64) ? u32(owner + 236) : 0;
          if (!linked && !(flags & 64)) return;
          owner = linked || u32(owner + 224);
          if (!owner) return;
        }
        if (!u32(owner + 120)) return;
      }
      const current = getFloat(health + 8);
      let next = f32(current + f32(amount));
      float(frame + 12, next);
      if (current <= 0) return;
      if (next < 0) { uint(frame + 12, 0); next = 0; }
      const maximum = getFloat(health + 12);
      float(frame + 8, maximum);
      call(18, health + 8, next > maximum ? frame + 8 : frame + 12);
    });
  }

  return Object.freeze({
    56: initializeEntityDefinition,
    216: healEntity,
    415: configureBeetle,
    417: configureRock,
    697: initializeSpider,
    698: entity => initializeLadybug(entity, 2),
    699: entity => initializeLadybug(entity, 1),
    700: initializeSquare,
    701: entity => initializeCentipede(entity, 1, 0),
    702: entity => initializeCentipede(entity, 1, 1),
    703: entity => initializeCentipede(entity, 0, 0),
    704: entity => initializeCentipede(entity, 0, 1),
    705: initializeHornet,
    706: entity => initializeBeetle(entity, 1),
    707: entity => initializeBeetle(entity, 0),
    708: initializeAntHole,
    709: entity => initializeAnt(entity, 3),
    710: entity => initializeAnt(entity, 2),
    711: entity => initializeAnt(entity, 1),
    712: entity => initializeAnt(entity, 0),
    713: initializeBee,
    714: entity => initializeLadybug(entity, -1),
    715: entity => initializeLadybug(entity, 0),
    716: initializeCactus,
    717: entity => initializeRock(entity, 1),
    718: entity => initializeRock(entity, 0),
  });
}
