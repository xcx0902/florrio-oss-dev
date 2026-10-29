/** Complete server initialization recovered from sp_server.wasm function656.
 * The original world/component ABI remains shared with explicit dependencies.
 * Ordered initialization, scratch frames and RNG consumption are observable.
 */
const f32 = Math.fround;

const WORLD = 22928, ENTITY_BASE = 419020, ENTITY_BYTES = 496, ENTITY_COUNT = 16384;

const RNG_MULTIPLIER = 6364136223846793005n;

const AREA_MIX = Object.freeze([ 0x1333334 * 2 ** -27, 0x1333334 * 2 ** -27, 0x133333 * 2 ** -24, 0x1333338 * 2 ** -28, 0x19999955555555 * 2 ** -57, 0x19999955555555 * 2 ** -57, 0x19999a * 2 ** -27, 0x19999a * 2 ** -27 ]);

export const functionIds = Object.freeze([ 656 ]);

export const initializationStatus = Object.freeze({
  id: 656,
  complete: true,
  registered: true
});

export const dependencyIds = Object.freeze([ 14, 15, 16, 20, 21, 24, 29, 31, 32, 35, 57, 74, 102, 103, 104, 126, 130, 140, 141, 187, 200, 201, 202, 203, 204, 214, 219, 247, 257, 259, 268, 371, 400, 407, 408, 409 ]);

export function createInitializationHooks(runtime) {
  let buffer, view;
  function access(pointer, size) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    if ((pointer >>> 0) + size > view.byteLength) throw new WebAssembly.RuntimeError('memory access out of bounds');
    return view;
  }
  const u8 = p => access(p, 1).getUint8(p >>> 0);
  const s8 = p => access(p, 1).getInt8(p >>> 0);
  const u32 = p => access(p, 4).getUint32(p >>> 0, true);
  const i32 = p => access(p, 4).getInt32(p >>> 0, true);
  const u64 = p => access(p, 8).getBigUint64(p >>> 0, true);
  const f = p => access(p, 4).getFloat32(p >>> 0, true);
  const d = p => access(p, 8).getFloat64(p >>> 0, true);
  const byte = (p, v) => access(p, 1).setUint8(p >>> 0, v);
  const short = (p, v) => access(p, 2).setUint16(p >>> 0, v, true);
  const uint = (p, v) => access(p, 4).setUint32(p >>> 0, v, true);
  const long = (p, v = 0n) => access(p, 8).setBigUint64(p >>> 0, BigInt.asUintN(64, v), true);
  const float = (p, v) => access(p, 4).setFloat32(p >>> 0, v, true);
  const double = (p, v) => access(p, 8).setFloat64(p >>> 0, v, true);
  const call = (id, ...args) => runtime.call(id, ...args);
  const zero = (p, n) => call(29, p, 0, n);
  const free = p => call(14, p);
  function unlink(node) {
    const list = u32(node);
    if (!list) return;
    uint(list, u32(list) - 1);
    let next = u32(node + 8);
    const previous = u32(node + 4);
    if (previous) {
      uint(previous + 8, next);
      next = u32(node + 8);
    } else uint(list + 4, next);
    uint(next ? next + 4 : list + 8, previous);
  }
  function appendList(node, list) {
    uint(list, u32(list) + 1);
    uint(node, list);
    const previous = u32(list + 8);
    uint(node + 8, 0);
    uint(node + 4, previous);
    if (!u32(list + 4)) uint(list + 4, node);
    if (previous) uint(previous + 8, node);
    uint(list + 8, node);
  }
  function invalidate(entity, created = false) {
    for (const offset of [ 264876, 264880 ]) {
      const address = u32(entity) + ((u32(entity + 16) & 16383) << 3) + offset;
      const cached = u32(address);
      uint(address, 0);
      if (cached) {
        free(u32(cached + 12));
        free(cached);
      }
    }
    const world = u32(entity), index = (u32(entity + 16) & 16383) << 2, revision = u32(world + 2140);
    uint(world + index + 68268, revision);
    uint(world + index + 133804, revision);
    if (created) uint(world + index + 199340, revision);
  }
  function mark(entity, entityRevision) {
    uint(entity + entityRevision, u32(u32(entity) + 2140));
    uint(entity + entityRevision + 4, u32(u32(entity) + 2140));
    invalidate(entity);
  }
  function pushPointer(vector, value, initial = 1024) {
    const count = u32(vector), required = count + 1 >>> 0;
    let capacity = u32(vector + 4), pointer = u32(vector + 8);
    if (capacity < required) {
      capacity = capacity ? capacity << 1 : initial;
      while (capacity >>> 0 < required) capacity <<= 1;
      const previous = pointer;
      pointer = call(16, capacity << 2);
      const copied = call(15, pointer, previous, count << 2);
      free(previous);
      uint(vector + 8, copied);
      uint(vector + 4, capacity);
    }
    uint(pointer + (count << 2), value);
    uint(vector, required);
  }
  function resetTracking() {
    for (const base of [ 8551040, 8555152 ]) {
      free(u32(base + 12));
      long(base + 8);
      long(base);
    }
  }
  function varuint(pointer, value) {
    let count = 0;
    do {
      const more = value >>> 0 > 127;
      byte(pointer + count++, value & 127 | more << 7);
      value >>>= 7;
      if (!more) return count;
    } while (true);
  }
  function markTracked(component, componentRevision, entityRevision) {
    const entity = u32(component);
    if (!entity) return;
    mark(entity, entityRevision);
    uint(component + componentRevision, u32(u32(u32(component)) + 2140));
  }
  function trackedInteger(component, offset, value, scratch) {
    if (u32(component + offset) === value >>> 0) return;
    resetTracking();
    let count = varuint(scratch, u32(component + offset));
    call(15, 8551056, scratch, count);
    uint(8551044, count);
    uint(component + offset, value);
    count = varuint(scratch, value);
    call(15, 8555168, scratch, count);
    uint(8555156, count);
    let different = u32(8551044) !== count;
    for (let i = 0; !different && i < count; i++) different = u8(8551056 + i) !== u8(8555168 + i);
    if (different) markTracked(component, 380, 376);
  }
  function trackedFloat(component, offset, source, revision) {
    if (f(component + offset) === f(source)) return;
    resetTracking();
    float(8551056, f(component + offset));
    uint(8551044, 4);
    float(component + offset, f(source));
    float(8555168, f(component + offset));
    uint(8555156, 4);
    let different = false;
    for (let i = 0; i < 4; i++) if (u8(8551056 + i) !== u8(8555168 + i)) different = true;
    if (different) markTracked(component, revision, 376);
  }
  /** Pool headers and static local-session storage, in original store order. */  function resetWorldDefaults() {
    long(22936, 0n);
    uint(22932, 128);
    long(22944, 0n);
    long(22952, 0n);
    long(22980, 0n);
    long(22972, 549755813888n);
    long(22964, 0n);
    long(22988, 0n);
    long(22996, 0n);
    long(23016, 549755813888n);
    long(23008, 0n);
    long(23040, 0n);
    long(23032, 0n);
    long(23024, 0n);
    long(23052, 0n);
    long(23060, 549755813888n);
    byte(22930, 0);
    short(22928, 0);
    long(23084, 0n);
    long(23076, 0n);
    long(23068, 0n);
    long(23096, 0n);
    long(23104, 549755813888n);
    long(23112, 0n);
    long(23120, 0n);
    long(23128, 0n);
    long(23140, 0n);
    long(23148, 549755813888n);
    long(23156, 0n);
    long(23164, 0n);
    long(23172, 0n);
    long(23184, 0n);
    long(23192, 549755813888n);
    long(23200, 0n);
    long(23208, 0n);
    long(23216, 0n);
    long(23272, 549755813888n);
    long(23264, 0n);
    long(23228, 0n);
    uint(23236, 0);
    long(23296, 0n);
    long(23288, 0n);
    long(23280, 0n);
    long(23316, 549755813888n);
    long(23308, 0n);
    long(23340, 0n);
    long(23332, 0n);
    long(23324, 0n);
    long(23360, 549755813888n);
    long(23352, 0n);
    long(23384, 0n);
    long(23376, 0n);
    long(23368, 0n);
    long(23404, 549755813888n);
    long(23396, 0n);
    long(23428, 0n);
    long(23420, 0n);
    long(23412, 0n);
    long(23448, 549755813888n);
    long(23440, 0n);
    long(23472, 0n);
    long(23464, 0n);
    long(23456, 0n);
    long(23492, 549755813888n);
    long(23484, 0n);
    long(23516, 0n);
    long(23508, 0n);
    long(23500, 0n);
    long(23960, 0n);
    uint(23968, 0);
    long(23544, 0n);
    long(23536, 0n);
    long(23528, 0n);
    uint(23972, 128);
    long(23992, 0n);
    long(23984, 0n);
    long(23976, 0n);
    long(24012, 549755813888n);
    long(24004, 0n);
    long(24036, 0n);
    long(24028, 0n);
    long(24020, 0n);
    long(24056, 549755813888n);
    long(24048, 0n);
    long(24080, 0n);
    long(24072, 0n);
    long(24064, 0n);
    long(24100, 4398046511104n);
    long(24092, 0n);
    long(24124, 0n);
    long(24116, 0n);
    long(24108, 0n);
    long(24144, 4398046511104n);
    long(24136, 0n);
    long(24168, 0n);
    long(24160, 0n);
    long(24152, 0n);
    long(24188, 549755813888n);
    long(24180, 0n);
    long(24212, 0n);
    long(24204, 0n);
    long(24196, 0n);
    long(24232, 549755813888n);
    long(24224, 0n);
    long(24256, 0n);
    long(24248, 0n);
    long(24240, 0n);
    long(24276, 549755813888n);
    long(24268, 0n);
    long(24300, 0n);
    long(24292, 0n);
    long(24284, 0n);
    long(24320, 4398046511104n);
    long(24312, 0n);
    long(24344, 0n);
    long(24336, 0n);
    long(24328, 0n);
    long(24364, 4398046511104n);
    long(24356, 0n);
    long(24388, 0n);
    long(24380, 0n);
    long(24372, 0n);
    long(24568, 549755813888n);
    long(24560, 0n);
    long(24400, 0n);
    uint(24408, 0);
    long(24592, 0n);
    long(24584, 0n);
    long(24576, 0n);
    long(24612, 549755813888n);
    long(24604, 0n);
    long(24636, 0n);
    long(24628, 0n);
    long(24620, 0n);
    long(24656, 549755813888n);
    long(24648, 0n);
    long(24680, 0n);
    long(24672, 0n);
    long(24664, 0n);
    long(24700, 549755813888n);
    long(24692, 0n);
    long(24724, 0n);
    long(24716, 0n);
    long(24708, 0n);
    long(24744, 549755813888n);
    long(24736, 0n);
    long(24768, 0n);
    long(24760, 0n);
    long(24752, 0n);
    long(24788, 549755813888n);
    long(24780, 0n);
    long(24812, 0n);
    long(24804, 0n);
    long(24796, 0n);
    long(24904, 0n);
    long(24844, 0n);
    long(24824, 0n);
    uint(24852, 0);
    byte(24839, 0);
    byte(24837, 0);
    uint(24832, 0);
    long(24888, 0n);
    long(24880, 0n);
    long(24872, 0n);
    long(24864, 0n);
    byte(24896, 0);
    uint(24952, 128);
    uint(24944, 24936);
    uint(24940, 24936);
    long(24928, 0n);
    byte(24948, 0);
    uint(24936, 0);
    byte(24920, 0);
    long(24972, 0n);
    long(24964, 0n);
    long(24956, 0n);
    long(25000, 4575657222473777152n);
    long(24992, 0n);
    uint(24984, 24952);
    uint(24988, 0);
    long(25016, 0n);
    long(25008, 0n);
    long(25056, 0n);
    uint(25040, 25032);
    uint(25036, 25032);
    byte(25066, 0);
    byte(25048, 0);
    uint(25032, 0);
    zero(25072, 76);
    zero(25660, 393216);
    long(418884, 0n);
    uint(418880, -1);
    long(418892, 0n);
    long(418900, 0n);
    long(418908, 0n);
    long(418916, 0n);
    long(418924, 0n);
    long(418944, 0n);
    short(418936, 1);
    long(418952, 0n);
    long(418960, 0n);
    long(418976, 0n);
    long(418968, 4294967296n);
    long(418984, 0n);
    long(418992, 0n);
    long(419000, 0n);
    uint(418932, 0);
    uint(419008, 0);
    uint(419016, 1);
  }
  /** Construct four entity records per pass, including the original untouched gaps. */  function initializeEntitySlots() {
    for (let group = ENTITY_BASE; group !== 8545484; group += 1984) {
      uint(group, 0);
      uint(group + 12, group + 4);
      uint(group + 8, group + 4);
      uint(group + 4, group);
      zero(group + 16, 81);
      zero(group + 100, 116);
      zero(group + 256, 244);
      uint(group + 508, group + 500);
      uint(group + 504, group + 500);
      uint(group + 500, group + 496);
      zero(group + 512, 81);
      zero(group + 596, 116);
      zero(group + 752, 244);
      uint(group + 1004, group + 996);
      uint(group + 1000, group + 996);
      uint(group + 996, group + 992);
      zero(group + 1008, 81);
      zero(group + 1092, 116);
      zero(group + 1248, 244);
      uint(group + 1500, group + 1492);
      uint(group + 1496, group + 1492);
      uint(group + 1492, group + 1488);
      zero(group + 1744, 240);
      zero(group + 1504, 81);
      zero(group + 1588, 116);
    }
    uint(25068, 1);
    for (let index = 0; index < ENTITY_COUNT; index++) {
      const record = ENTITY_BASE + index * ENTITY_BYTES, node = record + 20;
      unlink(node);
      appendList(node, 25076);
      let handle = index, generation;
      do {
        const state = BigInt.asUintN(64, u64(8569392) * RNG_MULTIPLIER + 1n);
        long(8569392, state);
        generation = Number(state >> 33n);
        handle = handle & 16383 | generation << 14;
      } while (!(generation & 262143));
      uint(record + 16, handle);
      uint(record, WORLD);
    }
    uint(418880, 0);
    unlink(419000);
    uint(419000, 25112);
    const previous = u32(25120);
    uint(419004, previous);
    uint(25112, u32(25112) + 1);
    uint(419008, 0);
    if (!u32(25116)) uint(25116, 419000);
    if (previous) uint(previous + 8, 419000);
    uint(25120, 419000);
  }
  /** Create the arena settings, player-directory and arena-count components. */  function initializeArenaComponents(scratch) {
    let entity = call(74, WORLD), world = u32(entity);
    if (s8(entity + 93) >= 0) {
      uint(world + 624, entity);
      byte(world + 1, 1);
      uint(world + 628, u32(world + 2140));
      zero(world + 632, 240);
      uint(scratch + 1848, 0);
      long(scratch + 1840);
      for (let target = world + 712, end = target + 120; target !== end; target += 12) {
        const source = scratch + 1840;
        if (target === source) continue;
        const length = u8(source + 11), heap = s8(source + 11) < 0;
        if (s8(target + 11) >= 0) {
          if (!heap) {
            long(target, u64(source));
            uint(target + 8, u32(source + 8));
          } else call(214, target, u32(source), u32(source + 4));
        } else call(268, target, heap ? u32(source) : source, heap ? u32(source + 4) : length);
      }
      if (s8(scratch + 1851) <= -1) free(u32(scratch + 1840));
      short(world + 872, 0);
      zero(world + 876, 101);
      for (const offset of [ 1020, 1012, 1004, 996, 988, 980 ]) long(world + offset);
      byte(entity + 93, u8(entity + 93) | 128);
      invalidate(entity, true);
      pushPointer(u32(entity) + 1032, world + 624);
      mark(entity, 376);
    }
    long(scratch + 1840, -4294967296n);
    trackedInteger(world + 624, 256, call(102, scratch + 1840), scratch + 1840);
    uint(scratch + 1840, u8(world + 873) === 1 ? 1178816512 : 1195593728);
    uint(scratch + 480, u8(world + 873) === 1 ? 1157234688 : 1165623296);
    trackedFloat(world + 624, 252, scratch + 1840, 376);
    trackedFloat(world + 624, 340, scratch + 480, 388);
    entity = call(74, WORLD);
    world = u32(entity);
    if (!(u8(entity + 95) & 4)) {
      uint(world + 1488, entity);
      byte(world + 2, 1);
      uint(world + 1568, 0);
      uint(world + 1552, 0);
      uint(world + 1492, u32(world + 2140));
      long(world + 1560);
      long(world + 1496);
      long(world + 1504);
      uint(world + 1512, 0);
      for (const offset of [ 1520, 1528, 1536, 1541, 1576, 1584, 1592, 1600, 1608, 1616 ]) long(world + offset);
      uint(world + 1624, 0);
      byte(entity + 95, u8(entity + 95) | 4);
      invalidate(entity, true);
      pushPointer(u32(entity) + 1632, world + 1488);
      mark(entity, 464);
    }
    entity = call(74, WORLD);
    world = u32(entity);
    if (s8(entity + 92) >= 0) {
      byte(world, 1);
      uint(world + 312, entity);
      long(world + 328);
      byte(world + 324, 0);
      uint(world + 320, 0);
      uint(world + 316, u32(world + 2140));
      byte(entity + 92, u8(entity + 92) | 128);
      invalidate(entity, true);
      pushPointer(u32(entity) + 336, world + 312);
      mark(entity, 312);
    }
  }
  /** Recover the mutable drop probabilities from rarity-band spawn weights. */  function initializeCatalog(scratch) {
    if (u8(8548272)) return;
    zero(scratch + 1840, 1472);
    for (let offset = 1832; offset >= 1776; offset -= 8) long(scratch + offset);
    for (let offset = 1734; offset >= 480; offset -= 33) byte(scratch + offset, 0);
    for (let species = 1; species < 23; species++) {
      const definition = call(103, species & 255);
      if (u8(definition + 109)) continue;
      for (let entry = definition + 36, end = entry + (u8(definition + 32) << 3); entry !== end; entry += 8) {
        const destinations = scratch + 480 + u8(entry) * 33, count = u8(destinations);
        byte(destinations + count + 1, species);
        byte(destinations, count + 1);
      }
    }
    for (let band = 0; band < 8; band++) {
      const mass = scratch + 1776 + (band << 3), histogram = scratch + 1840 + band * 184;
      const bandDefinition = 8548144 + (band << 4), count = u32(bandDefinition + 4);
      let total = d(mass);
      for (let entry = u32(bandDefinition + 12), end = entry + (count << 2); entry !== end; entry += 4) {
        const descriptor = u32(entry), species = u8(descriptor + 13), definition = call(103, species);
        const canonical = u8(definition + 109) || species;
        const probability = f32(f(descriptor) / f(bandDefinition));
        double(histogram + (canonical << 3), d(histogram + (canonical << 3)) + probability);
        total = d(mass) + probability;
        double(mass, total);
        // Summoned sub-populations contribute to the same canonical histogram.
                let children = 0, childCount = 0;
        if (species === 11) {
          children = call(16, 4096);
          childCount = 4;
          uint(children + 28, 1065353216);
          byte(children + 24, 10);
          uint(children + 20, 1104150528);
          byte(children + 16, 9);
          uint(children + 12, 1090519040);
          byte(children + 8, 8);
          uint(children + 4, 1084227584);
          byte(children, 7);
        } else if (species === 15 || species === 17) {
          children = call(16, 4096);
          childCount = 1;
          long(children, species === 15 ? 4690048650225647632n : 4690048650225647634n);
        }
        for (let child = children, end = children + (childCount << 3); child !== end; child += 8) {
          const subtype = u8(child), canonicalChild = u8(call(103, subtype) + 109) || subtype;
          const contribution = f32(probability * f(child + 4));
          double(histogram + (canonicalChild << 3), d(histogram + (canonicalChild << 3)) + contribution);
          total += contribution;
          double(mass, total);
        }
        free(children);
      }
      for (let species = 0; species < 23; species++) double(histogram + (species << 3), d(histogram + (species << 3)) / total);
    }
    zero(scratch + 288, 184);
    for (let species = 1; species < 23; species++) {
      const destination = scratch + 288 + (species << 3), histogram = scratch + 1840 + (species << 3);
      let weighted = d(destination);
      for (let band = 0; band < 8; band++) weighted += d(histogram + band * 184) * AREA_MIX[band];
      double(destination, weighted);
    }
    const referenceMass = d(scratch + 440);
    for (let petal = 1; petal < 39; petal++) {
      for (const offset of [ 280, 272, 264, 256 ]) long(scratch + offset);
      const definition = (petal - 1 & 255) > 37 ? 0 : 8545792 + petal * 52;
      let remaining = d(5120 + (u32(definition + 24) << 3)) * referenceMass;
      if (!(remaining > 1e-9)) continue;
      const sources = scratch + 480 + petal * 33, count = u8(sources);
      for (let iteration = 0; iteration < 64; iteration++) {
        const weights = zero(scratch, 256);
        if (!count) break;
        let available = remaining, totalWeight = 0, active = false;
        for (let index = 0; index < count; index++) {
          if (u8(weights + 256 + index)) continue;
          active = true;
          const species = u8(sources + index + 1), entity = call(103, species), weight = f(entity + 112);
          double(weights + (index << 3), weight);
          totalWeight += weight;
          const spawnMass = weights + 288 + (species << 3);
          for (let drop = entity + 36, end = drop + (u8(entity + 32) << 3); drop !== end; drop += 8) {
            if (u8(drop) !== (petal & 255)) continue;
            const previous = f(drop + 4), mass = d(spawnMass);
            uint(drop + 4, 0);
            available += mass * previous;
          }
        }
        remaining = available;
        for (let index = 0; index < count; index++) {
          const saturated = weights + 256 + index;
          if (u8(saturated)) continue;
          const species = u8(sources + index + 1), entity = call(103, species), spawnMass = weights + 288 + (species << 3);
          for (let drop = entity + 36, end = drop + (u8(entity + 32) << 3); drop !== end; drop += 8) {
            if (u8(drop) !== (petal & 255)) continue;
            const mass = d(spawnMass);
            let chance = f32(available * d(weights + (index << 3)) / (totalWeight * mass));
            if (chance > 0.9) chance = 1;
            if (chance < 0.00001) chance = 0;
            float(drop + 4, chance);
            if (chance >= 1) {
              uint(drop + 4, 1065353216);
              byte(saturated, 1);
              chance = 1;
            }
            remaining -= mass * chance;
          }
        }
        if (iteration === 63 || !active || !(remaining > 1e-9)) break;
      }
    }
    // Definitions that alias another species inherit its finalized drop table.
        for (let species = 1; species < 23; species++) {
      const target = call(103, species), alias = u8(target + 109);
      if (!alias) continue;
      const source = call(103, alias);
      if (source === target) continue;
      byte(target + 32, 0);
      const count = u8(source + 32);
      for (let offset = 0; offset < count << 3; offset += 8) long(target + 36 + offset, u64(source + 36 + offset));
      byte(target + 32, u8(source + 32));
    }
    for (let species = 1; species < 23; species++) {
      const definition = call(103, species), entries = definition + 36;
      let count = u8(definition + 32);
      for (let index = 0; index < (count & 255); ) {
        if (f(entries + (index << 3) + 4) < 0.00001) {
          for (let target = entries + (index << 3), next = target + 8, end = entries + ((count & 255) << 3); next !== end; target = next, 
          next += 8) {
            byte(target, u8(next));
            float(target + 4, f(target + 12));
          }
          byte(definition + 32, --count);
        } else index++;
      }
      call(247, entries, entries + ((count & 255) << 3));
    }
    byte(8548272, 1);
  }
  function literalUuidIsValid() {
    for (let index = 0; index < 36; index++) {
      if (index <= 23 && 1 << index & 8659200) continue;
      if (index === 14) continue;
      const digit = u8(3633 + index);
      if ((digit - 48 & 255) < 10 || (digit - 97 & 255) <= 5) continue;
      return false;
    }
    return true;
  }
  function guarded(address, action) {
    if (u8(address) & 1 || !call(32, address)) return;
    action();
    call(31, address);
  }
  function seedUuidGenerator(base, guard, index) {
    guarded(guard, (() => {
      let state = BigInt(call(130) >>> 0);
      long(base, state);
      for (let word = 1; word < 312; word++) {
        state = BigInt.asUintN(64, (state >> 62n ^ state) * RNG_MULTIPLIER + BigInt(word));
        long(base + (word << 3), state);
      }
      uint(index, 0);
    }));
  }
  /** Original C++ stream construction and formatting retain heap/stack effects. */  function generateUuid(connection, scratch) {
    guarded(8559280, (() => byte(8573032, 1)));
    guarded(8559284, (() => {
      const fileName = call(20, 16);
      uint(scratch + 64, fileName);
      long(scratch + 68, -9223371968135299060n);
      byte(fileName + 12, 0);
      uint(fileName + 8, u32(2676));
      long(fileName, u64(2668));
      call(219, scratch + 64);
      if (s8(scratch + 75) <= -1) free(u32(scratch + 64));
    }));
    for (const [base, guard, index] of [ [ 8559288, 8561792, 8561784 ], [ 8561800, 8564304, 8564296 ], [ 8564312, 8566816, 8566808 ], [ 8566824, 8569328, 8569320 ] ]) seedUuidGenerator(base, guard, index);
    let first = call(203, 8559288), second = call(203, 8561800), third = call(203, 8564312), fourth = call(203, 8566824);
    const stream = scratch + 128, stringBuffer = scratch + 76, output = scratch + 72;
    uint(scratch + 128, 8564);
    uint(scratch + 64, 8544);
    uint(scratch + 72, 8504);
    uint(scratch + 68, 0);
    uint(stream + 20, 0);
    uint(stream + 24, stringBuffer);
    uint(stream + 12, 0);
    long(stream + 4, 25769807874n);
    uint(stream + 16, stringBuffer === 0 ? 1 : 0);
    zero(stream + 32, 40);
    call(371, stream + 28);
    long(scratch + 200, -4294967296n);
    uint(scratch + 128, 8524);
    uint(scratch + 64, 8484);
    uint(scratch + 72, 8504);
    uint(stringBuffer, 7924);
    call(371, stringBuffer + 4);
    long(stringBuffer + 24);
    long(stringBuffer + 16);
    long(stringBuffer + 8);
    long(scratch + 108);
    long(scratch + 116);
    uint(scratch + 124, 24);
    uint(scratch + 76, 7988);
    let format = output + i32(u32(scratch + 72) - 12);
    uint(format + 4, u32(format + 4) & -75 | 8);
    format = output + i32(u32(scratch + 72) - 12);
    uint(format + 4, u32(format + 4) & -16385);
    uint(output + i32(u32(scratch + 72) - 12) + 76, 48);
    const width = value => uint(output + i32(u32(scratch + 72) - 12) + 12, value);
    width(8);
    first = BigInt.asUintN(64, first ^ second);
    let writer = call(141, output, Number(first >> 32n) | 0);
    const dash = () => {
      byte(scratch + 48, 45);
      writer = call(202, writer, scratch + 48);
    };
    dash();
    width(4);
    const low = Number(first & 0xffffffffn) >>> 0;
    writer = call(141, writer, low >>> 16);
    dash();
    width(4);
    writer = call(141, writer, low & 4095 | 16384);
    dash();
    width(4);
    first = BigInt.asUintN(64, third ^ fourth);
    writer = call(141, writer, Number(first >> 48n) & 16383 | 32768);
    dash();
    width(4);
    writer = call(141, writer, Number(first >> 32n) & 65535);
    width(8);
    call(141, writer, Number(first & 0xffffffffn) | 0);
    const text = scratch + 48, mode = u32(stringBuffer + 48);
    if (mode & 16) {
      let length = u32(stringBuffer + 44);
      if (length < u32(stringBuffer + 24)) {
        length = u32(stringBuffer + 24);
        uint(stringBuffer + 44, length);
      }
      call(187, text, u32(stringBuffer + 20), length);
    } else if (mode & 8) call(187, text, u32(stringBuffer + 8), u32(stringBuffer + 16)); else call(24, text);
    uint(scratch + 128, 8524);
    uint(scratch + 64, 8484);
    uint(scratch + 76, 7988);
    uint(scratch + 72, 8504);
    if (s8(scratch + 119) <= -1) free(u32(scratch + 108));
    call(201, stringBuffer);
    call(259, stream);
    call(200, connection + 76, s8(scratch + 59) < 0 ? u32(scratch + 48) : text);
    if (s8(scratch + 59) <= -1) free(u32(scratch + 48));
  }
  function queueUuidHandshake(connection, previousIndex, scratch) {
    uint(scratch + 72, 0);
    long(scratch + 64);
    if (scratch - 12 !== connection) {
      if (s8(connection + 87) >= 0) {
        uint(scratch + 72, u32(connection + 84));
        long(scratch + 64, u64(connection + 76));
      } else call(214, scratch + 64, u32(connection + 76), u32(connection + 80));
    }
    const packet = call(20, 4124);
    long(packet + 12);
    long(packet + 4);
    uint(packet, 5184);
    uint(packet + 16, 1);
    long(packet + 20);
    byte(packet + 28, 9);
    const heap = s8(scratch + 75) < 0, length = heap ? u32(scratch + 68) : u8(scratch + 75), size = length + 2 >>> 0;
    let storage = 0;
    if (size >= 4097) {
      let capacity = 4096;
      do {
        capacity <<= 1;
      } while (capacity >>> 0 < size);
      storage = call(16, capacity);
      byte(storage, u8(packet + 28));
      uint(packet + 24, storage);
      uint(packet + 20, capacity);
    }
    call(15, (storage || packet + 28) + 1, heap ? u32(scratch + 64) : scratch + 64, length + 1 >>> 0);
    uint(packet + 16, size);
    if (!previousIndex && !u8(418936)) {
      const payload = packet + 12, session = u32(25068);
      uint(packet + 4, u32(packet + 4) + 1);
      const count = u32(418912), required = count + 1 >>> 0;
      let capacity = u32(418916), entries = u32(418920);
      if (capacity < required) {
        capacity = capacity ? capacity << 1 : 256;
        while (capacity >>> 0 < required) capacity <<= 1;
        const previous = entries;
        entries = call(16, capacity << 4);
        for (let index = 0; index < count; index++) {
          const from = previous + (index << 4), to = entries + (index << 4);
          uint(to, u32(from));
          uint(to + 4, u32(from + 4));
          uint(to + 8, u32(from + 8));
          long(from + 4);
          byte(to + 12, u8(from + 12));
        }
        free(previous);
        uint(418920, entries);
        uint(418916, capacity);
      }
      const entry = entries + (count << 4);
      uint(entry + 4, payload);
      uint(entry, session);
      byte(entry + 12, 1);
      uint(entry + 8, packet);
      uint(418912, required);
    }
    const references = u32(packet + 4);
    uint(packet + 4, references - 1);
    if (!references) {
      runtime.indirect({
        parameters: [ 'i32' ],
        results: []
      }, u32(u32(packet) + 8), packet);
      call(35, packet);
    }
    if (s8(scratch + 75) <= -1) free(u32(scratch + 64));
  }
  function directoryChange(index, fieldRevision, slotRevision) {
    const entity = u32(24416);
    if (!entity) return;
    mark(entity, 464);
    const revision = u32(u32(u32(24416)) + 2140);
    uint(fieldRevision, revision);
    uint(slotRevision + (index << 2), revision);
  }
  function attachSessionHandle(entity, index, scratch) {
    const temporary = scratch + 64;
    uint(temporary + 8, temporary);
    let previous, next, value;
    if (!entity) {
      value = 0;
      uint(temporary, 0);
      previous = temporary;
      next = temporary;
    } else {
      value = u32(entity + 4);
      uint(temporary, value);
      next = u32(entity + 12);
      uint(temporary + 8, next);
      uint(next + 4, temporary);
      previous = entity + 4;
    }
    uint(temporary + 4, previous);
    uint(entity ? entity + 12 : temporary + 8, temporary);
    const target = 24936 + index * 12;
    if (target !== temporary) {
      const prior = u32(target + 4);
      uint(prior + 8, u32(target + 8));
      uint(u32(target + 8) + 4, prior);
      uint(target + 8, target);
      uint(target + 4, target);
      const preceding = u32(temporary + 4);
      uint(target, value);
      if (preceding === temporary) {
        uint(target + 4, target);
        uint(target + 8, target);
      } else {
        uint(target + 4, preceding);
        uint(target + 8, u32(temporary + 8));
        uint(preceding + 8, target);
        uint(u32(temporary + 8) + 4, target);
      }
      uint(temporary, 0);
      uint(temporary + 8, temporary);
      uint(temporary + 4, temporary);
      previous = temporary;
      next = temporary;
    } else next = u32(temporary + 8);
    uint(previous + 8, next);
    uint(u32(temporary + 8) + 4, previous);
  }
  /** Reuse a matching disconnected player, or acquire its complete component. */  function initializeSessionPlayer(index, token, name, scratch) {
    const count = u32(23184), entries = u32(23192);
    let selected = 0;
    for (let position = 0; position < count; position++) {
      const player = u32(entries + (position << 2));
      if (!u32(player + 172) || call(126, player + 176, token) || call(126, player + 216, name)) continue;
      const entity = u32(player);
      if (u32(entity + 32) || u8(player + 80) & 1) continue;
      uint(player + 172, index);
      attachSessionHandle(entity, index, scratch);
      selected = player;
      break;
    }
    if (selected) return;
    const entity = call(74, WORLD);
    let player = u32(entity + 120);
    if (!player) {
      const world = u32(entity), freeCount = u32(world + 240), heap = u32(world + 248);
      if (freeCount) {
        player = u32(heap);
        if (freeCount <= 1) uint(world + 240, freeCount - 1); else {
          const last = heap + (freeCount << 2) - 4;
          uint(heap, u32(last));
          uint(last, player);
          const remaining = freeCount - 1;
          if (freeCount !== 2) {
            let childIndex = 1, child = heap + 4;
            if (freeCount >= 4 && u32(child) < u32(child + 4)) {
              child += 4;
              childIndex = 2;
            }
            let childValue = u32(child), rootValue = u32(heap);
            if (childValue >= rootValue) {
              const lastParent = freeCount - 3 >>> 1;
              let parent = heap, placed = child;
              do {
                placed = child;
                uint(parent, childValue);
                if (childIndex > lastParent) break;
                const left = childIndex << 1 | 1, right = (childIndex << 1) + 2;
                childIndex = left;
                child = heap + (left << 2);
                if (remaining > right && u32(child) < u32(child + 4)) {
                  child += 4;
                  childIndex = right;
                }
                parent = placed;
                childValue = u32(child);
              } while (childValue >= rootValue);
              uint(placed, rootValue);
            }
          }
          uint(world + 240, remaining);
        }
      } else {
        const used = u32(world + 224);
        if (used <= 127) {
          player = u32(u32(world + 236) + (u32(world + 228) << 2) - 4) + used * 292;
          uint(world + 224, used + 1);
        } else {
          player = call(16, 37376);
          pushPointer(world + 228, player);
          uint(world + 224, 1);
        }
      }
      uint(entity + 120, player);
      uint(player, entity);
      const revision = u32(u32(entity) + 2140);
      long(player + 84);
      byte(player + 8, 0);
      uint(player + 4, revision);
      long(player + 12);
      long(player + 20);
      long(player + 28);
      short(player + 36, 0);
      for (const offset of [ 40, 48, 56, 64, 72 ]) long(player + offset);
      byte(player + 80, 0);
      uint(player + 108, player + 100);
      uint(player + 104, player + 100);
      uint(player + 100, 0);
      short(player + 96, 0);
      uint(player + 92, 1065353216);
      for (const offset of [ 152, 144, 136, 128, 120, 112 ]) long(player + offset);
      uint(player + 160, player + 156);
      uint(player + 164, player + 156);
      uint(player + 172, 0xffffffff);
      byte(player + 168, 0);
      zero(player + 176, 116);
      byte(entity + 92, u8(entity + 92) | 32);
      invalidate(entity, true);
      pushPointer(u32(entity) + 256, u32(entity + 120));
      mark(entity, 296);
      player = u32(entity + 120);
    }
    uint(player + 172, index);
    uint(scratch + 32, token);
    call(140, player + 176, 40, 2372, scratch + 32);
    uint(scratch + 16, name);
    call(140, player + 216, 60, 2372, scratch + 16);
    attachSessionHandle(u32(player), index, scratch);
  }
  function initializeLocalSession(scratch) {
    const node = u32(25116);
    if (!node) return -1;
    const randomUuid = !literalUuidIsValid();
    if (!randomUuid && !u8(418936) && !u8(418937)) {
      const length = s8(418967) < 0 ? u32(418960) : u8(418967);
      if (length === 36 && !call(57, s8(418967) < 0 ? u32(418956) : 418956, 3633, 36) && !u32(418880)) {
        uint(418940, 6);
        byte(418937, 1);
      }
    }
    unlink(node);
    uint(node + 8, 0);
    long(node);
    const record = node - 120, previousIndex = u32(record), connection = call(409, record), local = zero(record, 136);
    uint(connection + 52, 0);
    for (const offset of [ 44, 36, 28, 20, 12, 4 ]) long(connection + offset);
    long(connection + 64);
    byte(connection + 57, 0);
    long(connection + 72);
    long(connection + 80);
    long(connection + 96);
    long(connection + 88, 4294967296n);
    long(connection + 104);
    long(connection + 112);
    long(connection + 120);
    uint(connection + 128, 0);
    uint(local, previousIndex);
    byte(connection + 56, 0);
    call(204, connection + 64, 2706, 5);
    if (!randomUuid) call(204, connection + 76, 3633, 36); else generateUuid(connection, scratch);
    unlink(connection + 120);
    appendList(connection + 120, 25124);
    if (randomUuid) queueUuidHandshake(connection, previousIndex, scratch);
    const index = u32(local);
    byte(index + 24837, 0);
    if (u8(index + 24476) !== 1) {
      directoryChange(index, 24536, 24480);
      byte(index + 24476, 1);
    }
    const displayName = !index && !u8(418936) ? s8(418955) < 0 ? u32(418944) : 418944 : 0;
    const length = call(104, displayName), nameSlot = index * 12 + 24424;
    if (length !== (s8(nameSlot + 11) < 0 ? u32(nameSlot + 4) : u8(nameSlot + 11)) || call(257, nameSlot, displayName, length)) {
      directoryChange(index, 24516, 24436);
      call(200, nameSlot, displayName);
    }
    call(21, scratch + 64);
    const elapsed = call(408, scratch + 64), timeSlot = (index << 3) + 24488;
    if (elapsed !== d(timeSlot)) {
      directoryChange(index, 24540, 24496);
      double(timeSlot, elapsed);
    }
    uint(scratch + 68, index);
    uint(scratch + 64, 24456);
    const text = index * 12 + 24456;
    if ((s8(text + 11) < 0 ? u32(text + 4) : u8(text + 11)) || call(257, text, 4564, 0)) call(200, call(407, scratch + 64), 4564);
    call(21, scratch + 64);
    byte((index << 4) + 24920, 1);
    double((index << 4) + 24928, d(scratch + 72) + 60000);
    let token = 0, name = 0;
    if (!index && !u8(418936)) {
      token = s8(418967) < 0 ? u32(418956) : 418956;
      name = s8(418955) < 0 ? u32(418944) : 418944;
    }
    initializeSessionPlayer(index, token, name, scratch);
    byte(index + 25066, 0);
    return u32(local);
  }
  /** Deliver the initial response, respecting host changes made during callbacks. */  function flushInitializationOutput() {
    let end = 8545516 + (u8(8545512) << 2);
    for (let slot = 8545516; slot !== end; slot += 4) {
      const packet = u32(slot);
      runtime.host('a', 'd', u32(packet + 12) || packet + 16, u32(packet + 4));
    }
    runtime.host('a', 'c', 0, 0);
    end = 8545516 + (u8(8545512) << 2);
    for (let slot = 8545516; slot !== end; slot += 4) {
      const packet = u32(slot);
      uint(slot, 0);
      if (packet) {
        free(u32(packet + 12));
        free(packet);
      }
    }
    byte(8545512, 0);
  }
  function initializeServer(_data, _length) {
    const saved = runtime.stackPointer.value, frame = saved - 208 | 0;
    runtime.stackPointer.value = frame;
    if (!u8(8545776)) {
      resetWorldDefaults();
      initializeEntitySlots();
      const scratch = runtime.stackPointer.value - 3312 | 0;
      runtime.stackPointer.value = scratch;
      initializeArenaComponents(scratch);
      initializeCatalog(scratch);
      call(400);
      runtime.stackPointer.value = scratch + 3312;
      long(8545504);
      uint(8545488, 0xffffffff);
      byte(8545512, 0);
      byte(8545496, 0);
      const local = initializeLocalSession(frame);
      byte(8545776, 1);
      uint(8545488, local);
      long(frame, 4632233691727265792n);
      runtime.host('a', 'b', 22600, 4832, frame);
      if (!u8(8545776)) {
        runtime.stackPointer.value = frame + 208;
        return;
      }
    }
    flushInitializationOutput();
    runtime.stackPointer.value = frame + 208;
  }
  return {
    656: initializeServer
  };
}
