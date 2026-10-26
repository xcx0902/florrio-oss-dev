/** Entity component declarations consumed by the original snapshot decoder1015.
 * This restores complete original functions1007/1008/1009, including both wire modes.
 * Component numbers and byte offsets are retained where a semantic name is unknown.
 * Artifact: client.wasm c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 */
export const functionIds = Object.freeze([1007, 1008, 1009]);

const add = (left, right) => (left + right) >>> 0;
// Constructors which remain in the original module. IDs are protocol component
// ordinals, not guessed feature names. Inline constructors below have no native body.
const constructors = Object.freeze({
  1: 670, 2: 493, 3: 682, 4: 781, 5: 755, 6: 478, 7: 758,
  10: 549, 12: 1007, 14: 757, 16: 477, 17: 679,
  19: 677, 20: 458, 21: 609, 22: 533, 23: 784,
  25: 809, 26: 467, 28: 756, 30: 491,
});
// [entity pointer offset, pool offset, active-vector offset, flag offset, flag bit]
const pooledComponents = Object.freeze({
  9: [80, 372, 404, 46, 1],
  11: [88, 460, 492, 46, 4],
  13: [96, 548, 580, 46, 16],
  18: [108, 1112, 1144, 47, 2],
  24: [132, 1376, 1408, 47, 128],
  29: [148, 1712, 1744, 48, 16],
});

export function createSnapshotDecoderHooks(runtime) {
  const call = (id, ...args) => runtime.call(id, ...args);
  function access(method, address, ...args) {
    try { return new DataView(runtime.memory.buffer)[method](address, ...args); }
    catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const uint = address => access('getUint32', address, true);
  const byte = address => access('getUint8', address);
  const put = (address, value) => access('setUint32', address, value, true);
  const putByte = (address, value) => access('setUint8', address, value);
  const putShort = (address, value) => access('setUint16', address, value, true);
  const float = address => access('getFloat32', address, true);
  const double = address => access('getFloat64', address, true);
  const putFloat = (address, value) => access('setFloat32', address, value, true);
  const long = address => access('getBigUint64', address, true);
  const putLong = (address, value) => access('setBigUint64', address, BigInt.asUintN(64, value), true);
  const zeroLong = address => access('setBigUint64', address, 0n, true);

  /** The original vector grows from 1024 entries and copies only its live prefix. */
  function appendPointer(vector, value) {
    const count = uint(vector), required = add(count, 1);
    let capacity = uint(vector + 4), entries;
    if (capacity >= required) entries = uint(vector + 8);
    else {
      let next = capacity ? capacity << 1 : 1024;
      do {
        capacity = next >>> 0;
        next = capacity << 1;
      } while (capacity < required);
      const previous = uint(vector + 8);
      entries = call(368, capacity << 2) >>> 0;
      const copied = call(363, entries, previous, count << 2) >>> 0;
      call(362, previous);
      put(vector + 8, copied);
      put(vector + 4, capacity);
    }
    put(add(entries, count << 2), value);
    put(vector, required);
  }

  /** func1007: allocate the 20-byte component12, preserving the pool's max heap. */
  function attachComponent12(entity) {
    entity >>>= 0;
    if (uint(entity + 92)) return;
    let state = uint(entity), component;
    const freeCount = uint(state + 520);
    if (freeCount) {
      const entries = uint(state + 528);
      component = uint(entries);
      if (freeCount > 1) {
        const last = add(entries, (freeCount << 2) - 4), replacement = uint(last);
        put(entries, replacement);
        put(last, component);
        if (freeCount !== 2) {
          const liveCount = freeCount - 1, lastParent = (freeCount - 3) >>> 1;
          let childIndex = 1, child = entries + 4;
          if (freeCount >= 4 && uint(entries + 4) < uint(entries + 8)) {
            childIndex = 2;
            child = entries + 8;
          }
          let childValue = uint(child);
          if (childValue >= replacement) {
            let hole = entries;
            for (;;) {
              const nextHole = child;
              put(hole, childValue);
              if (childIndex > lastParent) { hole = nextHole; break; }
              const left = childIndex << 1;
              childIndex = left | 1;
              child = add(entries, childIndex << 2);
              if (liveCount > left + 2 && uint(child) < uint(child + 4)) {
                child += 4;
                childIndex = left + 2;
              }
              hole = nextHole;
              childValue = uint(child);
              if (childValue < replacement) break;
            }
            put(hole, replacement);
          }
        }
      }
      put(state + 520, freeCount - 1);
    } else {
      const usedInBlock = uint(state + 504);
      if (usedInBlock <= 127) {
        const lastBlock = uint(add(uint(state + 516), (uint(state + 508) << 2) - 4));
        put(state + 504, usedInBlock + 1);
        component = add(lastBlock, usedInBlock * 20);
      } else {
        component = call(368, 2560) >>> 0;
        // The block is allocated before growing the block-pointer vector.
        const count = uint(state + 508), required = add(count, 1);
        let capacity = uint(state + 512), entries;
        if (capacity >= required) entries = uint(state + 516);
        else {
          let next = capacity ? capacity << 1 : 1024;
          do { capacity = next >>> 0; next = capacity << 1; } while (capacity < required);
          const previous = uint(state + 516);
          entries = call(368, capacity << 2) >>> 0;
          const copied = call(363, entries, previous, count << 2) >>> 0;
          call(362, previous);
          put(state + 516, copied);
          put(state + 512, capacity);
        }
        put(add(entries, count << 2), component);
        put(state + 504, 1);
        put(state + 508, required);
      }
    }
    put(entity + 92, component);
    put(component, entity);
    const sequence = uint(uint(entity) + 2276);
    putByte(component + 16, 0);
    putByte(component + 12, 0);
    put(component + 8, 0);
    put(component + 4, sequence);
    putByte(entity + 46, byte(entity + 46) | 8);
    const activeComponent = uint(entity + 92);
    state = uint(entity);
    appendPointer(state + 536, activeComponent);
  }

  function attachPooledComponent(entity, ordinal) {
    const [pointerOffset, poolOffset, vectorOffset, flagOffset, flag] = pooledComponents[ordinal];
    if (uint(entity + pointerOffset)) return;
    const component = call(ordinal === 11 ? 783 : 449, uint(entity) + poolOffset) >>> 0;
    put(entity + pointerOffset, component);
    put(component, entity);
    const state = uint(entity), sequence = uint(state + 2276);
    if (ordinal === 11) put(component + 8, 0);
    put(component + 4, sequence);
    putByte(entity + flagOffset, byte(entity + flagOffset) | flag);
    appendPointer(state + vectorOffset, component);
  }

  function attachComponent8(entity) {
    if (byte(entity + 45) & 128) return;
    let state = uint(entity);
    putByte(state, 1);
    const component = state + 312;
    put(component, entity);
    zeroLong(state + 336);
    put(state + 316, uint(state + 2276));
    zeroLong(state + 320);
    putByte(state + 328, 0);
    zeroLong(state + 348);
    putByte(state + 344, 0);
    putByte(entity + 45, byte(entity + 45) | 128);
    state = uint(entity);
    appendPointer(state + 360, component);
  }

  function attachComponent15(entity) {
    const flags = byte(entity + 46);
    if (flags & 64) return;
    const component = entity + 168, firstSentinel = entity + 176, secondSentinel = entity + 188;
    put(component, entity);
    const state = uint(entity), sequence = uint(state + 2276);
    zeroLong(entity + 200);
    put(entity + 196, secondSentinel);
    put(entity + 192, secondSentinel);
    put(entity + 188, 0);
    put(entity + 184, firstSentinel);
    put(entity + 180, firstSentinel);
    put(entity + 176, 0);
    put(entity + 172, sequence);
    putByte(entity + 46, flags | 64);
    appendPointer(state + 636, component);
  }

  function attachComponent27(entity) {
    if (byte(entity + 48) & 4) return;
    let state = uint(entity);
    put(state + 1512, entity);
    putByte(state + 2, 1);
    put(state + 1592, 0);
    put(state + 1576, 0);
    put(state + 1516, uint(state + 2276));
    zeroLong(state + 1584);
    zeroLong(state + 1520);
    zeroLong(state + 1528);
    put(state + 1536, 0);
    zeroLong(state + 1544);
    zeroLong(state + 1552);
    zeroLong(state + 1560);
    zeroLong(state + 1565);
    for (let offset = 1600; offset <= 1640; offset += 8) zeroLong(state + offset);
    put(state + 1648, 0);
    putByte(entity + 48, byte(entity + 48) | 4);
    const component = state + 1512;
    state = uint(entity);
    appendPointer(state + 1656, component);
  }

  function attachComponent(entity, ordinal) {
    if (pooledComponents[ordinal]) attachPooledComponent(entity, ordinal);
    else if (ordinal === 8) attachComponent8(entity);
    else if (ordinal === 15) attachComponent15(entity);
    else if (ordinal === 27) attachComponent27(entity);
    else call(constructors[ordinal] ?? 670, entity);
  }

  /** func1008: component declarations, either a 32-bit mask or XOR1 delta list.
   * The wire decoder intentionally preserves partial-varint and pending-byte
   * behavior, rather than introducing a new rejection policy for malformed input.
   */
  function decodeEntityComponentDeclarations(entity, reader, flags) {
    entity >>>= 0;
    reader >>>= 0;
    function alignedCursor() {
      let cursor = uint(reader + 8);
      if (uint(reader + 12)) {
        put(reader + 12, 0);
        cursor = add(cursor, 1);
        put(reader + 8, cursor);
      }
      return cursor;
    }
    if (flags & 1) {
      const cursor = alignedCursor();
      let mask = 0;
      if (add(uint(reader + 4), -cursor) >= 4) {
        mask = uint(add(uint(reader), cursor));
        put(reader + 8, add(cursor, 4));
      }
      for (let ordinal = 1; ordinal <= 30; ordinal++)
        if (mask & (1 << (ordinal - 1))) attachComponent(entity, ordinal);
      return;
    }
    let ordinal = 0;
    for (;;) {
      const data = uint(reader), length = uint(reader + 4);
      let cursor = alignedCursor(), value = 1;
      if (add(cursor, 1) <= length) {
        put(reader + 8, add(cursor, 1));
        let group = byte(add(data, cursor));
        value = group & 127;
        cursor = add(cursor, 1);
        for (let shift = 7; shift <= 28 && (group & 128) && cursor !== length; shift += 7) {
          group = 0;
          const next = add(cursor, 1);
          if (next <= length) {
            put(reader + 8, next);
            group = byte(add(data, cursor));
            cursor = next;
          }
          value |= (group & 127) << shift;
        }
        value = (value ^ 1) >>> 0;
        if (!value) return;
      }
      ordinal = add(ordinal, value);
      attachComponent(entity, ordinal);
    }
  }

  /** Defaults of the 496-byte event14 visual object, in original store order.
   * Raw integer/long constants preserve the original float bits and sentinel IDs.
   */
  function createEvent14Visual() {
    const object = call(382, call(371, 496), 0, 496) >>> 0;
    const stores = [
      [4, 76, 0], [4, 24, 1065353216],
      [8, 28, 0n], [8, 36, 0n], [8, 44, 0n], [8, 52, 0n], [8, 60, 0n],
      [4, 280, 0], [4, 232, 0], [8, 224, 0n], [4, 176, 0],
      [8, 168, 0n], [8, 116, 0n], [8, 108, 4294967295n], [1, 104, 0],
      [8, 96, 72339069014638592n], [8, 360, 4607182418800017408n],
      [8, 344, 0n], [8, 336, 4575657221408423936n], [8, 328, 1065353216n],
      [8, 312, 4575657221408423936n], [8, 304, 1065353216n],
      [2, 372, 1], [2, 352, 1], [2, 284, 256], [8, 392, 0n],
      [4, 368, 1167867904], [1, 354, 2], [8, 320, 0n], [1, 296, 1],
      [1, 288, 0], [4, 72, 33016], [1, 384, 0], [8, 376, 0n],
      [4, 400, -1], [1, 431, 0], [1, 416, 0], [1, 412, 0], [4, 408, 0],
      [8, 440, 4719772410523796111n], [4, 432, 16777215], [2, 436, 0],
      [1, 420, 0], [8, 448, 0n], [8, 456, 0n], [4, 464, -1],
      [1, 488, 0], [8, 480, 0n], [1, 472, 0],
    ];
    for (const [size, offset, value] of stores) {
      if (size === 8) putLong(object + offset, value);
      else if (size === 4) put(object + offset, value);
      else if (size === 2) putShort(object + offset, value);
      else putByte(object + offset, value);
    }
    return object;
  }

  /** func1009: complete type5 event opcode decoder. Opcodes9/11/14 have
   * distinct effects; reserved opcodes2..8,10,12,13 deliberately trap.
   */
  function decodeSnapshotEvent(state, reader, duplicate) {
    state >>>= 0;
    reader >>>= 0;
    const scratch = add(runtime.stackPointer.value, -48);
    runtime.stackPointer.value = scratch;
    const data = uint(reader), length = uint(reader + 4);
    let cursor = uint(reader + 8), firstAddress;
    if (uint(reader + 12)) {
      put(reader + 12, 0);
      put(reader + 8, add(cursor, 2));
      firstAddress = add(cursor, data) + 1;
      cursor = add(cursor, 2);
    } else {
      put(reader + 8, add(cursor, 1));
      firstAddress = add(cursor, data);
      cursor = add(cursor, 1);
    }
    // Unlike declaration1008, the opcode reader reads its first byte without
    // checking the declared length. Later continuation groups are bounds checked.
    let group = byte(firstAddress), opcode = group & 127;
    for (let shift = 7; shift <= 28 && (group & 128) && cursor !== length; shift += 7) {
      const next = add(cursor, 1);
      group = 0;
      if (next <= length) {
        put(reader + 8, next);
        group = byte(add(cursor, data));
        cursor = next;
      }
      opcode |= (group & 127) << shift;
    }
    opcode >>>= 0;
    const finish = () => { runtime.stackPointer.value = add(scratch, 48); };
    const trap = () => { throw new WebAssembly.RuntimeError('unreachable'); };
    function readFourBytes() {
      const end = add(cursor, 4);
      if (length < end) return 0;
      let value = 0;
      for (let index = 0; index < 4; index++) {
        put(reader + 8, add(cursor, index + 1));
        value |= byte(add(data, add(cursor, index))) << (index * 8);
      }
      cursor = end;
      return value >>> 0;
    }
    function readString() {
      const begin = add(data, cursor);
      let end = begin, scan = cursor;
      if (cursor < length) {
        for (;;) {
          put(reader + 8, add(scan, 1));
          if (!byte(add(scan, data))) break;
          end = add(end, 1);
          scan = add(scan, 1);
          if (scan === length) { end = add(data, length); break; }
        }
      }
      const size = add(end, -begin);
      if (size >= 0xFFFFFFF0) { call(398); trap(); }
      let destination;
      if (size <= 10) {
        putByte(scratch + 43, size);
        destination = scratch + 32;
      } else {
        const capacity = add(size, 16) & -16;
        destination = call(371, capacity) >>> 0;
        put(scratch + 40, capacity | 0x80000000);
        put(scratch + 32, destination);
        put(scratch + 36, size);
      }
      for (let index = 0; index < size; index++)
        putByte(add(destination, index), byte(add(begin, index)));
      putByte(add(destination, size), 0);
    }

    if (opcode >= 2 && opcode <= 14 && opcode !== 9 && opcode !== 11 && opcode !== 14) trap();
    if (opcode !== 9 && opcode !== 11 && opcode !== 14) {
      readString();
      if (byte(scratch + 43) & 128) call(362, uint(scratch + 32));
      finish();
      return;
    }
    if (opcode === 9) {
      put(scratch + 16, 0);
      zeroLong(scratch + 8);
      put(scratch + 27, 0);
      put(scratch + 24, 0);
      readString();
      put(scratch + 27, uint(scratch + 39));
      put(scratch + 24, uint(scratch + 36));
      put(scratch + 8, uint(scratch + 32));
      const flags = byte(scratch + 43);
      putByte(scratch + 19, flags);
      put(scratch + 12, uint(scratch + 24));
      put(scratch + 15, uint(scratch + 27));
      if (!duplicate) call(557, 17854, flags & 128 ? uint(scratch + 8) : scratch + 8);
      if ((duplicate ? flags : byte(scratch + 19)) & 128) call(362, uint(scratch + 8));
      finish();
      return;
    }

    const wireEntity = readFourBytes();
    const packedEntity = ((wireEntity << 14) | (wireEntity >>> 18)) >>> 0;
    if (opcode === 11) {
      if (!duplicate && packedEntity >= 16384) {
        const index = packedEntity & 16383, base = add(state, index * 448);
        if (((packedEntity ^ uint(base + 2944)) >>> 0) <= 16383) {
          if (uint(state + 256)) {
            const handle = uint(uint(state + 264));
            if (handle && uint(handle + 144) === base + 2928) {
              call(372, scratch + 32);
              putLong(state + 2208, long(scratch + 40));
              putLong(state + 2200, long(scratch + 32));
            }
          }
          const component = uint(add(state, index * 448) + 3064);
          if (component) {
            call(372, scratch + 32);
            putLong(component + 64, long(scratch + 40));
            putLong(component + 56, long(scratch + 32));
          }
        }
      }
      finish();
      return;
    }

    let eventIndex = 0;
    if (length >= add(cursor, 1)) {
      put(reader + 8, add(cursor, 1));
      eventIndex = byte(add(cursor, data));
    }
    if (duplicate) { finish(); return; }
    if (!(byte(7931360) & 1) && call(369, 7931360)) {
      call(426);
      call(370, 7931360);
    }
    const useAlternateState = byte(7931352), stateLocation = useAlternateState ? 7931292 : 4420;
    const activeState = uint(stateLocation);
    if (!uint(activeState + 256)) { finish(); return; }
    const handle = uint(uint(activeState + 264));
    if (!handle) { finish(); return; }
    const activeEntity = uint(handle + 144);
    if (!activeEntity) { finish(); return; }
    const slot = 395184 + (eventIndex << 2);
    if (uint(slot) || packedEntity < 16384) { finish(); return; }
    const target = add(activeState, (packedEntity & 16383) * 448);
    if (((uint(target + 2944) ^ packedEntity) >>> 0) > 16383) { finish(); return; }
    const reference = uint(activeEntity + 152), marked = uint(target + 2980);
    putByte(marked + 72, 1);
    const transform = uint(target + 3048);
    const visual = createEvent14Visual();
    put(scratch + 32, 0);
    call(416, slot, visual);
    call(416, scratch + 32, 0);
    const object = uint(395184 + (eventIndex << 2));
    put(object, eventIndex);
    const firstState = uint(stateLocation);
    let secondState = firstState, stillInvalid = false;
    if (!byte(transform + 144)) {
      call(409, transform);
      stillInvalid = !byte(transform + 144);
      secondState = uint(stateLocation);
    }
    const f32 = Math.fround;
    // These are the exact f32 WAT constants, not rounded pseudocode decimals.
    const heightFactor = f32(1 / 1080), widthFactor = f32(1 / 1920);
    function coordinate(owner, dimensionOffset, positionOffset, cameraOffset, scaleAddress) {
      const dimension = uint(owner + dimensionOffset) | 0;
      const height = f32(f32(uint(owner + 2164) | 0) * heightFactor);
      const width = f32(f32(uint(owner + 2160) | 0) * widthFactor);
      const fit = height > width ? height : width;
      const delta = f32(f32(double(transform + positionOffset)) - float(owner + cameraOffset));
      const projected = f32(f32(delta * float(owner + 2156)) * fit);
      return f32(f32(dimension * 0.5 + projected) / float(scaleAddress));
    }
    putFloat(object + 12, coordinate(firstState, 2160, 152, 2148, useAlternateState ? 7931304 : 4432));
    if (stillInvalid) call(409, transform);
    putFloat(object + 16, coordinate(secondState, 2164, 160, 2152, useAlternateState ? 7931308 : 4436));
    putByte(object + 20, byte(marked + 8));
    const tier = byte(reference + 168), limit = tier < 15 ? 5 : tier < 30 ? 6 : tier < 45 ? 7 : 8;
    const strength = limit > eventIndex
      ? f32(access('getUint16', reference + (eventIndex << 1) + 120, true) * (1 / 65535))
      : 1;
    putFloat(object + 24, strength);
    finish();
  }

  return { 1007: attachComponent12, 1008: decodeEntityComponentDeclarations, 1009: decodeSnapshotEvent };
}
