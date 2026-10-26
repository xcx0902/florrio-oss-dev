/** Complete pooled component allocation/attachment and population services.
 * Layout descriptors encode recovered ABI fields, not substitute game rules.
 */
const f32 = Math.fround;

const POOLS = Object.freeze({
  65: {
    stride: 52,
    blockRecords: 1024
  },
  68: {
    stride: 56,
    blockRecords: 1024
  },
  97: {
    stride: 120,
    blockRecords: 1024
  },
  106: {
    stride: 16,
    blockRecords: 128
  },
  128: {
    stride: 24,
    blockRecords: 128
  },
  148: {
    stride: 16,
    blockRecords: 1024
  }
});

const ATTACHMENTS = Object.freeze({
  64: {
    name: "physics",
    flagOffset: 95,
    flag: 2,
    vectorOffset: 1472,
    revision: 456
  },
  67: {
    name: "health",
    flagOffset: 94,
    flag: 8,
    vectorOffset: 1208,
    revision: 408
  },
  96: {
    name: "transform",
    flagOffset: 94,
    flag: 16,
    vectorOffset: 1252,
    revision: 416
  },
  147: {
    name: "component184",
    flagOffset: 95,
    flag: 1,
    vectorOffset: 1428,
    revision: 448
  }
});

export const functionIds = Object.freeze([ 64, 65, 67, 68, 96, 97, 106, 113, 114, 115, 128, 147, 148 ]);

export const dependencyIds = Object.freeze([ 14, 15, 16, 21, 34, 94, 102, 144, 161 ]);

export function createComponentHooks(runtime) {
  let buffer, view;
  function address(base, offset, size) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    const pointer = (base >>> 0) + offset;
    if (pointer + size > view.byteLength) throw new WebAssembly.RuntimeError("memory access out of bounds");
    return pointer;
  }
  const add = (base, offset) => base + offset | 0;
  const u8 = (p, o = 0) => {
    const a = address(p, o, 1);
    return view.getUint8(a);
  };
  const u32 = (p, o = 0) => {
    const a = address(p, o, 4);
    return view.getUint32(a, true);
  };
  const f = (p, o = 0) => {
    const a = address(p, o, 4);
    return view.getFloat32(a, true);
  };
  const d = (p, o = 0) => {
    const a = address(p, o, 8);
    return view.getFloat64(a, true);
  };
  const u64 = (p, o = 0) => {
    const a = address(p, o, 8);
    return view.getBigUint64(a, true);
  };
  const byte = (p, v, o = 0) => {
    const a = address(p, o, 1);
    view.setUint8(a, v);
  };
  const uint = (p, v, o = 0) => {
    const a = address(p, o, 4);
    view.setUint32(a, v, true);
  };
  const long = (p, v = 0n, o = 0) => {
    const a = address(p, o, 8);
    view.setBigUint64(a, BigInt.asUintN(64, v), true);
  };
  const float = (p, v, o = 0) => {
    const a = address(p, o, 4);
    view.setFloat32(a, v, true);
  };
  const double = (p, v, o = 0) => {
    const a = address(p, o, 8);
    view.setFloat64(a, v, true);
  };
  const call = (id, ...args) => runtime.call(id, ...args)
  /** Move the last free pointer down a max heap; equal children favor the left. */;
  function popFreeRecord(base, offset, count) {
    const heap = u32(base, offset + 24), result = u32(heap);
    // The emitted comparisons on free counts and child indices are signed.
        if ((count | 0) <= 1) {
      uint(base, count - 1, offset + 16);
      return result | 0;
    }
    const last = add(heap, (count << 2) - 4);
    uint(heap, u32(last));
    uint(last, result);
    const remaining = count - 1 | 0;
    if (count !== 2) {
      let child = 1, pointer = add(heap, 4);
      if ((count | 0) >= 4 && u32(heap, 4) < u32(heap, 8)) {
        child = 2;
        pointer = add(heap, 8);
      }
      let value = u32(pointer), root = u32(heap);
      if (value >= root) {
        const finalParent = count - 3 >>> 1;
        let parent = heap, placed = pointer;
        for (;;) {
          placed = pointer;
          uint(parent, value);
          if ((child | 0) > (finalParent | 0)) break;
          const left = child << 1 | 1, right = (child << 1) + 2;
          child = left;
          pointer = add(heap, left << 2);
          if (remaining > (right | 0) && u32(pointer) < u32(pointer, 4)) {
            pointer = add(pointer, 4);
            child = right;
          }
          parent = placed;
          value = u32(pointer);
          if (value < root) break;
        }
        uint(placed, root);
      }
    }
    uint(base, remaining, offset + 16);
    return result | 0;
  }
  /** Pool fields: used, chunkCount, chunkCapacity, chunks, freeCount, freeCapacity, freeHeap. */  function takeRecord(base, descriptor, offset = 0) {
    const freeCount = u32(base, offset + 16);
    if (freeCount) return popFreeRecord(base, offset, freeCount);
    const used = u32(base, offset);
    if (used < descriptor.blockRecords) {
      const chunk = u32(add(u32(base, offset + 12), (u32(base, offset + 4) << 2) - 4));
      uint(base, used + 1, offset);
      return add(chunk, Math.imul(used, descriptor.stride));
    }
    // Original order allocates the record chunk before growing its pointer vector.
        const chunk = call(16, descriptor.blockRecords * descriptor.stride), count = u32(base, offset + 4), required = count + 1 >>> 0;
    let capacity = u32(base, offset + 8), chunks;
    if (capacity >= required) chunks = u32(base, offset + 12); else {
      capacity = capacity ? capacity << 1 : 1024;
      while (capacity >>> 0 < required) capacity <<= 1;
      const previous = u32(base, offset + 12);
      chunks = call(16, capacity << 2);
      const copied = call(15, chunks, previous, count << 2);
      call(14, previous);
      uint(base, copied, offset + 12);
      uint(base, capacity, offset + 8);
    }
    uint(add(chunks, count << 2), chunk);
    uint(base, 1, offset);
    uint(base, required, offset + 4);
    return chunk | 0;
  }
  function clearCaches(entity) {
    for (const offset of [ 264876, 264880 ]) {
      const slot = add(u32(entity), ((u32(entity, 16) & 16383) << 3) + offset), cached = u32(slot);
      uint(slot, 0);
      if (cached) {
        call(14, u32(cached, 12));
        call(14, cached);
      }
    }
  }
  function invalidate(entity, created = false) {
    clearCaches(entity);
    const world = u32(entity), index = (u32(entity, 16) & 16383) << 2, revision = u32(world, 2140);
    uint(add(world, index + 68268), revision);
    uint(add(world, index + 133804), revision);
    if (created) uint(add(world, index + 199340), revision);
  }
  function appendComponent(world, offset, component) {
    const count = u32(world, offset), required = count + 1 >>> 0;
    let capacity = u32(world, offset + 4), entries;
    if (capacity >= required) entries = u32(world, offset + 8); else {
      capacity = capacity ? capacity << 1 : 1024;
      while (capacity >>> 0 < required) capacity <<= 1;
      const previous = u32(world, offset + 8);
      entries = call(16, capacity << 2);
      const copied = call(15, entries, previous, count << 2);
      call(14, previous);
      uint(world, copied, offset + 8);
      uint(world, capacity, offset + 4);
    }
    uint(add(entries, count << 2), component);
    uint(world, required, offset);
  }
  /** Register one complete component, setting its flag and all change epochs. */  function attachComponent(entity, component, descriptor) {
    byte(entity, u8(entity, descriptor.flagOffset) | descriptor.flag, descriptor.flagOffset);
    invalidate(entity, true);
    appendComponent(u32(entity), descriptor.vectorOffset, component);
    const world = u32(entity);
    uint(entity, u32(world, 2140), descriptor.revision);
    uint(entity, u32(world, 2140), descriptor.revision + 4);
    invalidate(entity);
  }
  function nextRandomValue(state) {
    const quotient = Math.floor((state >>> 0) / 44488) >>> 0, product = Math.imul(state + Math.imul(quotient, -44488) | 0, 48271) >>> 0, correction = Math.imul(quotient, 3399) >>> 0;
    return (product < correction ? 2147483647 : 0) + product - correction >>> 0;
  }
  function nextRandom() {
    const state = nextRandomValue(u32(8573024));
    uint(8573024, state);
    return state;
  }
  const randomFraction = state => f32(f32(state - 1 >>> 0) * 2 ** -31)
  /** Original113: weighted species selection and up to100 clear-position trials. */;
  function spawnPopulationBand(band) {
    band |= 0;
    const saved = runtime.stackPointer.value, scratch = add(saved, -32);
    runtime.stackPointer.value = scratch;
    const bandOffset = band << 4, total = f(add(8548144, bandOffset)), choice = nextRandom(), count = u32(add(8548148, bandOffset));
    let result = 0;
    if (count) {
      let pointer = u32(add(8548156, bandOffset)), end = add(pointer, count << 2), remaining = f32(total * randomFraction(choice)), selected = null;
      for (;;) {
        const entry = u32(pointer), weight = f(entry);
        if (remaining < weight) {
          selected = entry;
          break;
        }
        remaining = f32(remaining - weight);
        pointer = add(pointer, 4);
        if (pointer === end) break;
      }
      if (selected !== null) {
        const fallback = band >>> 0 > 6 ? 1 : f32(.15), previous = band - 1 | 0, signedByte = previous << 24 >> 24, tableOffset = signedByte << 2, outside = (previous & 255) > 6;
        for (let trial = 0; trial < 100; trial++) {
          const lower = outside ? 0 : f(add(6984, tableOffset)), upper = outside ? fallback : f(add(7012, tableOffset));
          const first = nextRandomValue(u32(8573024)), fraction = randomFraction(first);
          const x = f32(f(23804) * f32(f32(lower + f32(f32(upper - lower) * fraction)) + -.5));
          float(scratch, x, 12);
          const height = f(23892), second = nextRandomValue(first);
          uint(8573024, second);
          const y = f32(height * f32(randomFraction(second) + -.5));
          float(scratch, y, 8);
          uint(scratch, add(scratch, 8), 4);
          uint(scratch, add(scratch, 12));
          long(scratch, 4942137642236379136n, 24);
          float(scratch, f32(y + -600), 20);
          float(scratch, f32(x + -600), 16);
          if (!call(161, 24984, add(scratch, 16), scratch)) {
            result = call(144, 24864, u8(selected, 13), f(scratch, 12), f(scratch, 8), band) !== 0 ? 1 : 0;
            break;
          }
        }
      }
    }
    runtime.stackPointer.value = add(scratch, 32);
    return result;
  }
  /** Original114: replace behavior settings, timer, random choice and orientation. */  function configureBehavior(component, settings) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -48);
    runtime.stackPointer.value = scratch;
    call(15, add(component, 60), settings, 92);
    call(21, add(scratch, 32));
    long(component, u64(scratch, 40), 24);
    long(component, u64(scratch, 32), 16);
    const position = u32(u32(component), 168), angleScale = f32(26353590 * 2 ** -53);
    float(component, f32(f32(nextRandom() - 1 >>> 0) * angleScale), 52);
    long(scratch, 4294967296n, 32);
    byte(component, call(102, add(scratch, 32)) === 1 ? 1 : 0, 48);
    if (f(component, 100) > 0) {
      call(21, add(scratch, 32));
      const now = d(scratch, 40);
      byte(component, 1, 32);
      double(component, now + f(component, 100), 40);
    }
    const sameAngle = !!u8(component, 64), angle = sameAngle ? f(component, 52) : f32(f32(nextRandom() - 1 >>> 0) * angleScale);
    if (u8(position, 80)) {
      byte(position, 0, 80);
      let child = u32(u32(position), 84);
      while (child) {
        const next = u32(child, 8);
        call(34, child);
        child = next;
      }
    }
    const argumentsPointer = sameAngle ? add(scratch, 16) : scratch;
    long(argumentsPointer, 4618760256179416344n, 8);
    double(argumentsPointer, angle);
    double(scratch, runtime.host("a", "a", 22903, 6924, argumentsPointer), 32);
    call(94, add(position, 8), add(scratch, 32));
    runtime.stackPointer.value = add(scratch, 48);
  }
  /** Original115: lazily construct and register the192-byte behavior component. */  function ensureBehavior(entity) {
    const existing = u32(entity, 104);
    if (existing) return existing | 0;
    const component = takeRecord(u32(entity), {
      stride: 192,
      blockRecords: 128
    }, 48);
    uint(entity, component, 104);
    uint(component, entity);
    const revision = u32(u32(entity), 2140);
    byte(component, 0, 88);
    long(component, 4575657221408423936n, 80);
    byte(component, 0, 76);
    long(component, 4489188110467124429n, 68);
    byte(component, 0, 64);
    uint(component, 1039947569, 60);
    long(component, 0n, 52);
    byte(component, 0, 48);
    long(component, 0n, 40);
    byte(component, 0, 32);
    long(component, 0n, 24);
    byte(component, 0, 16);
    uint(component, 0, 12);
    byte(component, 0, 8);
    uint(component, revision, 4);
    uint(component, 0, 107);
    long(component, 0n, 100);
    long(component, 0n, 92);
    byte(component, 0, 184);
    byte(component, 0, 176);
    uint(component, add(component, 164), 172);
    uint(component, add(component, 164), 168);
    uint(component, 0, 164);
    uint(component, add(component, 152), 160);
    uint(component, add(component, 152), 156);
    uint(component, 0, 152);
    long(component, 4934256341737799680n, 144);
    long(component, 4934256342878257152n, 136);
    long(component, 0n, 128);
    long(component, 4593671621066752000n, 120);
    long(component, 4618891780614520832n, 112);
    attachComponent(entity, component, {
      flagOffset: 92,
      flag: 2,
      vectorOffset: 80,
      revision: 264
    });
    return u32(entity, 104) | 0;
  }
  const hooks = {
    113: spawnPopulationBand,
    114: configureBehavior,
    115: ensureBehavior
  };
  for (const [id, descriptor] of Object.entries(POOLS)) hooks[id] = base => takeRecord(base | 0, descriptor);
  for (const [id, descriptor] of Object.entries(ATTACHMENTS)) hooks[id] = (entity, component) => attachComponent(entity | 0, component | 0, descriptor);
  return hooks;
}
