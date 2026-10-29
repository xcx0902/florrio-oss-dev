/** Entity snapshot protocol, reconstructed from complete original function1015.
 * Preserves wire framing, shared memory, C++ ownership and trap behavior.
 * Source artifact SHA256: c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 */
export const functionIds = Object.freeze([1015]);
const add = (left, right) => (left + right) >>> 0;
const rotateHandle = value => ((value << 14) | (value >>> 18)) >>> 0;

export function createEntitySnapshotHooks(runtime) {
  const call = (id, ...args) => runtime.call(id, ...args);
  const memory = runtime.memory;
  let buffer = memory.buffer, view = new DataView(buffer);
  function access(method, address, ...args) {
    if (buffer !== memory.buffer) { buffer = memory.buffer; view = new DataView(buffer); }
    try { return view[method](address, ...args); }
    catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const uint = address => access('getUint32', address, true);
  const byte = address => access('getUint8', address);
  const float = address => access('getFloat32', address, true);
  const double = address => access('getFloat64', address, true);
  const long = address => access('getBigUint64', address, true);
  const put = (address, value) => access('setUint32', address, value, true);
  const putByte = (address, value) => access('setUint8', address, value);
  const putShort = (address, value) => access('setUint16', address, value, true);
  const putFloat = (address, value) => access('setFloat32', address, value, true);
  const putDouble = (address, value) => access('setFloat64', address, value, true);
  const putLong = (address, value) => access('setBigUint64', address, BigInt.asUintN(64, value), true);
  const zeroLong = address => putLong(address, 0n);
  const trap = () => { throw new WebAssembly.RuntimeError('unreachable'); };

  function createReader(reader) {
    const cursor = () => uint(reader + 8);
    const align = () => {
      let index = cursor();
      if (uint(reader + 12)) {
        put(reader + 12, 0);
        index = add(index, 1);
        put(reader + 8, index);
      }
      return index;
    };
    function readByte(aligned = true) {
      const index = aligned ? align() : cursor(), end = add(index, 1);
      if (end > uint(reader + 4)) return 0;
      put(reader + 8, end);
      return byte(add(uint(reader), index));
    }
    function readBit() {
      const index = cursor(), end = add(index, 1);
      if (end > uint(reader + 4)) return 0;
      const value = byte(add(uint(reader), index)), bit = uint(reader + 12), next = add(bit, 1);
      put(reader + 12, next);
      const result = (value >>> (bit & 31)) & 1;
      if (next === 8) { put(reader + 12, 0); put(reader + 8, end); }
      return result;
    }
    function varint(defaultValue = 0, delta = false, aligned = true) {
      let index = aligned ? align() : cursor();
      const length = uint(reader + 4), data = uint(reader);
      if (add(index, 1) > length) return defaultValue;
      let value = 0;
      for (let shift = 0; shift <= 28; shift += 7) {
        const next = add(index, 1);
        let group = 0;
        if (next <= length) {
          put(reader + 8, next);
          group = byte(add(data, index));
          index = next;
        }
        value |= (group & 127) << shift;
        if (!(group & 128) || index === length) break;
      }
      return (delta ? value ^ 1 : value) >>> 0;
    }
    function integer(size = 4, aligned = true) {
      const index = aligned ? align() : cursor(), end = add(index, size), data = uint(reader);
      if (end > uint(reader + 4)) return 0;
      let value = 0;
      for (let offset = 0; offset < size; offset++) {
        put(reader + 8, add(index, offset + 1));
        value |= byte(add(data, add(index, offset))) << (offset * 8);
      }
      return value >>> 0;
    }
    function floating(size = 4, aligned = true) {
      const index = aligned ? align() : cursor(), end = add(index, size), data = uint(reader);
      if (end > uint(reader + 4)) return 0;
      const address = add(data, index);
      if (size === 4) {
        const value = float(address), bits = uint(address);
        put(reader + 8, end);
        return ((bits + 0x800000) & 0x7F000000) ? value : 0;
      }
      const value = double(address), bits = long(address);
      put(reader + 8, end);
      return (BigInt.asUintN(64, bits + 0x10000000000000n) & 0x7FE0000000000000n) ? value : 0;
    }
    function string(destination, scratch) {
      const index = align(), data = uint(reader), length = uint(reader + 4), begin = add(data, index);
      let end = begin, scan = index;
      if (index < length) {
        for (;;) {
          put(reader + 8, add(scan, 1));
          if (!byte(add(data, scan))) break;
          end = add(end, 1);
          scan = add(scan, 1);
          if (scan === length) { end = add(data, length); break; }
        }
      }
      const count = add(end, -begin);
      if (count >= 0xFFFFFFF0) { call(398); trap(); }
      let storage;
      if (count <= 10) { putByte(scratch + 27, count); storage = scratch + 16; }
      else {
        const capacity = add(count, 16) & -16;
        storage = call(371, capacity) >>> 0;
        put(scratch + 24, capacity | 0x80000000);
        put(scratch + 16, storage);
        put(scratch + 20, count);
      }
      for (let offset = 0; offset < count; offset++) putByte(add(storage, offset), byte(add(begin, offset)));
      putByte(add(storage, count), 0);
      if (byte(destination + 11) & 128) call(362, uint(destination));
      putLong(destination, long(scratch + 16));
      put(destination + 8, uint(scratch + 24));
    }
    return { reader, cursor, align, byte: readByte, bit: readBit, varint, integer, floating, string };
  }

  function appendPointer(vector, pointer) {
    const count = uint(vector), required = add(count, 1);
    let capacity = uint(vector + 4), entries;
    if (capacity >= required) entries = uint(vector + 8);
    else {
      let next = capacity ? capacity << 1 : 1024;
      do { capacity = next >>> 0; next = capacity << 1; } while (capacity < required);
      const previous = uint(vector + 8);
      entries = call(368, capacity << 2) >>> 0;
      const copied = call(363, entries, previous, count << 2);
      call(362, previous);
      put(vector + 8, copied);
      put(vector + 4, capacity);
    }
    put(add(entries, count << 2), pointer);
    put(vector, required);
  }
  function ensureInline8(entity) {
    let state = uint(entity);
    if (!(byte(entity + 45) & 128)) {
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
      appendPointer(uint(entity) + 360, component);
    }
    return state + 312;
  }
  function ensureInline15(entity) {
    const flags = byte(entity + 46);
    if (!(flags & 64)) {
      put(entity + 168, entity);
      const state = uint(entity), sequence = uint(state + 2276);
      zeroLong(entity + 200);
      put(entity + 196, entity + 188); put(entity + 192, entity + 188); put(entity + 188, 0);
      put(entity + 184, entity + 176); put(entity + 180, entity + 176); put(entity + 176, 0);
      put(entity + 172, sequence);
      putByte(entity + 46, flags | 64);
      appendPointer(state + 636, entity + 168);
    }
    return entity + 168;
  }
  function ensureInline27(entity) {
    let state = uint(entity);
    if (!(byte(entity + 48) & 4)) {
      put(state + 1512, entity); putByte(state + 2, 1);
      put(state + 1592, 0); put(state + 1576, 0); put(state + 1516, uint(state + 2276));
      zeroLong(state + 1584); zeroLong(state + 1520); zeroLong(state + 1528); put(state + 1536, 0);
      zeroLong(state + 1544); zeroLong(state + 1552); zeroLong(state + 1560); zeroLong(state + 1565);
      for (let offset = 1600; offset <= 1640; offset += 8) zeroLong(state + offset);
      put(state + 1648, 0); putByte(entity + 48, byte(entity + 48) | 4);
      appendPointer(uint(entity) + 1656, state + 1512);
    }
    return state + 1512;
  }

  function stamp(target, scratch) {
    call(372, scratch + 16);
    putLong(target + 8, long(scratch + 24));
    putLong(target, long(scratch + 16));
  }
  function interpolate(component, current, previous, timestamp, scratch) {
    call(372, scratch + 16);
    const elapsed = !byte(scratch + 16) ? Infinity : !byte(component + timestamp) ? -Infinity
      : (double(scratch + 24) - double(component + timestamp + 8)) * (1 / 120);
    const fraction = Math.min(Math.max(elapsed, 0), 1), old = float(component + previous);
    return Math.fround(fraction * Math.fround(float(component + current) - old) + old);
  }
  function readInterpolated(component, current, previous, timestamp, input, scratch, full) {
    if (!full || byte(component + timestamp)) {
      putFloat(component + previous, byte(component + timestamp)
        ? interpolate(component, current, previous, timestamp, scratch) : float(component + current));
      stamp(component + timestamp, scratch);
    }
    putFloat(component + current, input.floating());
    if (full && !byte(component + timestamp)) {
      stamp(component + timestamp, scratch);
      putFloat(component + previous, float(component + current));
    }
  }
  function moveReference(destination, input, scratch, state) {
    put(scratch + 8, rotateHandle(input.integer()));
    call(575, scratch + 16, state, scratch + 8);
    const temporary = scratch + 16;
    let first, last;
    if (destination === temporary) { first = uint(scratch + 20); last = uint(scratch + 24); }
    else {
      first = uint(destination + 4); last = uint(destination + 8);
      put(first + 8, last); put(last + 4, first);
      first = uint(scratch + 20);
      put(destination, uint(scratch + 16));
      if (first === temporary) {
        put(destination + 4, destination);
        put(destination + 8, destination);
      } else {
        put(destination + 4, first); put(destination + 8, uint(scratch + 24));
        put(first + 8, destination); put(uint(scratch + 24) + 4, destination);
      }
      put(scratch + 16, 0); put(scratch + 24, temporary); put(scratch + 20, temporary);
      first = temporary; last = temporary;
    }
    put(first + 8, last); put(uint(scratch + 24) + 4, first);
  }

  const byteFields = {
    1: [478, 8], 2: [491, 8], 9: [755, 8], 11: [477, 248], 12: [477, 249],
    14: [756, 8], 17: [549, 8], 20: [478, 104], 22: [670, 8], 26: [491, 9],
    31: [491, 10], 34: [478, 140], 36: [493, 8], 38: [809, 8], 43: [757, 8],
    46: [477, 352], 47: [478, 141], 50: [758, 8], 54: [670, 9], 62: [491, 168], 63: [491, 169],
  };
  const floatFields = { 19: [477, 252], 21: [478, 108], 32: [478, 136], 42: [477, 340], 53: [458, 8], 55: [458, 12] };
  const interpolatedFields = {
    5: [478, 16, 20, 24], 7: [467, 8, 12, 16], 13: [0, 8, 12, 16],
    24: [478, 112, 116, 120], 28: [609, 40, 44, 48], 49: [609, 64, 68, 72], 59: [491, 16, 20, 24],
  };
  // [constructor, offset, element kind, dense element count, sparse first-index adjustment]
  const arrayFields = {
    3: [477, 8, 'handle', 10], 4: [0, 8, 'string', 1], 10: [477, 88, 'string', 10],
    16: [478, 52, 'byte', 10], 25: [0, 40, 'string', 1], 33: [0, 60, 'bit', 1],
    35: [0, 72, 'double', 1], 39: [477, 260, 'varint', 10],
    60: [491, 40, 'byte', 16], 61: [491, 120, 'short', 8],
  };
  function readField(field, entity, input, scratch, full = false, existing = 0) {
    if (field < 1 || field > 63) field = 1;
    const component = constructor => full ? existing : call(constructor, entity) >>> 0;
    if (byteFields[field]) {
      const [constructor, offset] = byteFields[field];
      const target = component(constructor);
      putByte(target + offset, input.byte());
      return;
    }
    if (floatFields[field]) {
      const [constructor, offset] = floatFields[field];
      const target = component(constructor);
      putFloat(target + offset, input.floating());
      return;
    }
    if (interpolatedFields[field]) {
      const [constructor, current, previous, timestamp] = interpolatedFields[field];
      const target = constructor ? component(constructor) : full ? existing : ensureInline8(entity);
      readInterpolated(target, current, previous, timestamp, input, scratch, full);
      return;
    }
    if (arrayFields[field]) {
      const [constructor, offset, kind, count] = arrayFields[field];
      const target = constructor ? component(constructor) : full ? existing : ensureInline27(entity);
      const stride = { handle: 4, string: 12, byte: 1, bit: 1, double: 8, varint: 4, short: 2 }[kind];
      function element(index) {
        const address = add(target, offset + index * stride);
        if (kind === 'string') input.string(address, scratch);
        else if (kind === 'handle') put(address, rotateHandle(input.integer()));
        else if (kind === 'byte') putByte(address, input.byte());
        else if (kind === 'bit') putByte(address, input.bit());
        else if (kind === 'double') putDouble(address, input.floating(8));
        else if (kind === 'short') putShort(address, input.varint());
        else put(address, input.varint());
      }
      if (full) for (let index = 0; index < count; index++) element(index);
      else {
        let index = 0;
        for (;;) {
          const delta = input.varint(1, true);
          if (!delta) break;
          index = add(index, delta);
          element(add(index, -1));
        }
      }
      return;
    }
    if (field === 6 || field === 48) {
      const target = component(field === 6 ? 478 : 677);
      input.string(target + (field === 6 ? 40 : 8), scratch);
      return;
    }
    if (field === 8) {
      const target = component(609);
      if (!full || byte(target + 24)) {
        putDouble(target + 16, call(705, target + 8));
        stamp(target + 24, scratch);
      }
      putDouble(target + 8, input.integer(2) * (2 * Math.PI / 65535));
      if (full && !byte(target + 24)) {
        stamp(target + 24, scratch);
        putDouble(target + 16, double(target + 8));
      }
      return;
    }
    if (field === 23 || field === 57 || field === 56) {
      const target = field === 56 ? component(478) : full ? existing : ensureInline15(entity);
      const state = uint(uint(target));
      moveReference(target + (field === 56 ? 144 : field === 23 ? 8 : 20), input, scratch, state);
      return;
    }
    if (field === 29 || field === 40 || field === 37) {
      const target = field === 37 ? full ? existing : ensureInline8(entity) : component(533);
      putByte(target + (field === 37 ? 32 : field === 29 ? 8 : 9), input.bit());
      return;
    }
    if (field === 30 || field === 52 || field === 58) {
      const target = component(field === 58 ? 491 : 477), value = input.varint();
      if (field === 58) putShort(target + 12, value);
      else put(target + (field === 30 ? 256 : 356), value);
      return;
    }
    if (field === 45) {
      const target = component(477);
      putDouble(target + 344, input.floating());
      return;
    }
    const target = full ? existing : ensureInline27(entity);
    if (field === 18) putDouble(target + 32, input.floating(8));
    else if (field === 27) putFloat(target + 56, input.floating());
    else if (field === 15 || field === 41 || field === 44 || field === 51)
      put(target + ({ 15: 24, 41: 88, 44: 92, 51: 96 }[field]), input.varint());
    else throw new Error(`Unimplemented snapshot field ${field}`);
  }

  function readDenseFields(entity, flags, input, scratch) {
    const groups = [
      [52, [22, 54]], [56, [36]], [68, [9]],
      [72, [1, 5, 6, 16, 20, 21, 24, 32, 34, 47, 56]], [76, [50]],
      [-8, [13, 37]], [84, [17]], [100, [43]], [-15, [23, 57]],
      [-16, [3, 10, 11, 12, 19, 30, 39, 42, 45, 46, 52]],
      [112, [48]], [116, [53, 55]], [120, [8, 28, 49]], [124, [29, 40]],
      [136, [38]], [140, [7]], [-27, [4, 15, 18, 25, 27, 33, 35, 41, 44, 51]],
      [144, [14]], [152, flags & 64 ? [2, 26, 31, 58, 59, 60, 61, 62, 63] : [2, 26, 31]],
    ];
    for (const [offset, fields] of groups) {
      const state = uint(entity);
      const target = offset === -8 ? byte(entity + 45) & 128 ? state + 312 : 0
        : offset === -15 ? byte(entity + 46) & 64 ? entity + 168 : 0
        : offset === -16 ? byte(entity + 46) & 128 ? state + 648 : 0
        : offset === -27 ? byte(entity + 48) & 4 ? state + 1512 : 0
        : uint(entity + offset);
      if (target) for (const field of fields) readField(field, entity, input, scratch, true, target);
    }
  }

  function unlinkReference(reference) {
    const next = uint(reference + 4), previous = uint(reference + 8);
    put(next + 8, previous); put(previous + 4, next);
  }
  function unlinkMembership(node) {
    const list = uint(node);
    if (!list) return;
    put(list, uint(list) - 1);
    const next = uint(node + 8), previous = uint(node + 4);
    if (previous) put(previous + 8, next); else put(list + 4, next);
    put(next ? next + 4 : list + 8, previous);
  }
  function moveReferenceGroup(destination, source) {
    put(destination, uint(source));
    unlinkReference(destination + 4);
    const from = source + 4, to = destination + 4, next = uint(source + 8);
    put(to, uint(from));
    if (next === from) { put(destination + 8, to); put(destination + 12, to); }
    else {
      put(destination + 8, next); put(destination + 12, uint(source + 12));
      put(next + 8, to); put(uint(source + 12) + 4, to);
    }
    put(from, 0); put(source + 8, from); put(source + 12, from);
  }
  function retireEntity(state, packed, scratch, retiredCount) {
    if (packed < 16384) return retiredCount;
    const base = add(state, (packed & 16383) * 448), entity = base + 2928;
    let oldPacked = uint(entity + 16);
    if (((oldPacked ^ packed) >>> 0) > 16383) return retiredCount;
    if (uint(entity + 20) !== state + 2284) {
      const spatialObject = uint(entity + 140);
      if (spatialObject) {
        const tree = uint(spatialObject + 56);
        if (tree) {
          const count = uint(tree + 24), entries = uint(tree + 32), end = add(entries, count << 2);
          let slot = entries;
          for (; slot !== end; slot += 4) if (uint(slot) === spatialObject) break;
          if (slot !== end) {
            const saved = uint(slot), last = end - 4;
            put(slot, uint(last)); put(last, saved); put(tree + 24, count - 1);
            put(spatialObject + 56, 0); oldPacked = uint(entity + 16);
          }
        }
      }
      const sentinel = entity + 4, nextField = entity + 8, lastField = entity + 12;
      if (sentinel !== uint(nextField)) {
        const value = uint(sentinel), previous = uint(lastField), temporary = scratch + 36;
        put(previous + 4, scratch); put(lastField, scratch);
        let savedPacked = uint(entity + 16);
        put(scratch + 36, value); put(scratch + 32, savedPacked);
        if (sentinel !== scratch) {
          put(scratch + 44, previous); put(scratch + 40, sentinel); put(lastField, temporary);
          put(previous + 4, temporary);
        } else { put(scratch + 40, temporary); put(scratch + 44, temporary); }
        put(scratch, 0); put(scratch + 8, scratch); put(scratch + 4, scratch);
        const count = uint(state + 2404), required = add(count, 1);
        let entries = uint(state + 2412);
        if (required > (entries ? uint(state + 2408) : 32)) {
          call(1011, state + 2404, required);
          savedPacked = uint(scratch + 32); entries = uint(state + 2412);
        }
        const group = add(entries || state + 2416, count << 4), to = group + 4;
        put(group + 4, 0); put(group, savedPacked); put(group + 12, to); put(group + 8, to);
        const first = uint(scratch + 40);
        put(group + 4, uint(scratch + 36));
        if (first === temporary) put(group + 8, to);
        else {
          put(group + 8, first); put(group + 12, uint(scratch + 44));
          put(first + 8, to); put(uint(scratch + 44) + 4, to);
        }
        put(state + 2404, required);
        unlinkReference(scratch);
      }
      call(1010, entity);
      let reference = sentinel;
      do { put(reference, 0); reference = uint(reference + 8); } while (reference !== sentinel);
      unlinkMembership(entity + 32);
      const index = oldPacked & 16383;
      unlinkMembership(entity + 20);
      unlinkReference(sentinel);
      put(sentinel, entity); put(nextField, sentinel); put(lastField, sentinel);
      call(382, entity + 208, 0, 240);
      zeroLong(entity + 42); zeroLong(entity + 36); zeroLong(entity + 28); zeroLong(entity + 20);
      call(382, entity + 52, 0, 116);
      put(entity, state); put(entity + 16, index); putByte(entity + 44, 0);
      retiredCount = uint(state + 2372);
    }
    retiredCount = add(retiredCount, 1);
    put(state + 2372, retiredCount);
    return retiredCount;
  }
  function activateEntity(state, packed) {
    const entity = add(state, (packed & 16383) * 448) + 2928, membership = entity + 20;
    const active = state + 2296;
    if (uint(membership) === active) {
      putByte(state + 2376, 0); put(state + 2368, uint(state + 2368) + 1);
      return entity;
    }
    putByte(state + 2376, 1); put(state + 2364, uint(state + 2364) + 1); put(entity + 16, packed);
    unlinkMembership(membership);
    put(state + 2296, uint(state + 2296) + 1); put(membership, active);
    const previous = uint(state + 2304);
    put(entity + 28, 0); put(entity + 24, previous);
    if (!uint(state + 2300)) put(state + 2300, membership);
    if (previous) put(previous + 8, membership);
    put(state + 2304, membership);
    const count = uint(state + 2404), entries = uint(state + 2412) || state + 2416;
    const end = add(entries, count << 4);
    for (let group = entries; group !== end; group += 16) {
      if (uint(group) !== packed) continue;
      const entitySentinel = entity + 4, groupSentinel = group + 4;
      let node = groupSentinel;
      do { put(node, uint(entitySentinel)); node = uint(node + 8); } while (node !== groupSentinel);
      const last = uint(group + 12);
      put(entity + 12, last); put(last + 4, entitySentinel);
      put(entity + 8, groupSentinel); put(group + 12, entitySentinel);
      for (let source = group + 16; source !== end; source += 16) moveReferenceGroup(source - 16, source);
      const remaining = uint(state + 2404) - 1;
      put(state + 2404, remaining);
      unlinkReference(add(uint(state + 2412) || state + 2416, remaining << 4) + 4);
      break;
    }
    return entity;
  }
  function releaseReliableOwner(owner) {
    if (!owner) return;
    const count = uint(owner + 4);
    put(owner + 4, count - 1);
    // C++ shared ownership stores strong owners minus one.
    if (count !== 0) return;
    runtime.indirect({ parameters: ['i32'], results: [] }, uint(uint(owner) + 8), owner);
    call(436, owner);
  }
  function acknowledgeReliablePackets(state, acknowledgement) {
    put(state + 2356, acknowledgement);
    const entries = uint(state + 2344), count = uint(state + 2336);
    let first = 0, length = count;
    while (length) {
      const half = length >>> 1, middle = first + half;
      if (uint(add(entries, middle << 4)) > acknowledgement) length = half;
      else { first = middle + 1; length = length - half - 1; }
    }
    if (first === count) {
      for (let index = 0; index < count; index++) releaseReliableOwner(uint(add(entries, (index << 4) + 8)));
      call(362, entries); zeroLong(state + 2336); put(state + 2344, 0);
      return;
    }
    if (!first) return;
    const remaining = count - first;
    for (let index = 0; index < remaining; index++) {
      const target = add(entries, index << 4), source = add(entries, (index + first) << 4);
      put(target, uint(source));
      const owner = uint(source + 8), packet = uint(source + 4);
      zeroLong(source + 4); put(target + 4, packet);
      const previousOwner = uint(target + 8);
      put(target + 8, owner); releaseReliableOwner(previousOwner);
      putByte(target + 12, byte(source + 12));
    }
    for (let index = remaining; index < count; index++) releaseReliableOwner(uint(add(entries, (index << 4) + 8)));
    put(state + 2336, uint(state + 2336) - first);
  }

  function appendLoginEvent(state, scratch) {
    if (byte(state + 1933)) return;
    call(495, scratch + 32, 13321);
    if (!byte(scratch + 44)) return;
    putByte(state + 1933, 1);
    put(scratch + 24, uint(scratch + 40));
    const stringPrefix = long(scratch + 32);
    putByte(scratch + 32, 0); putByte(scratch + 43, 0); putLong(scratch + 16, stringPrefix);
    const packet = call(371, 4112) >>> 0;
    zeroLong(packet); zeroLong(packet + 8);
    const inline = packet + 16;
    putByte(inline, 5); put(packet + 4, 1);
    const flags = byte(scratch + 27), allocated = !!(flags & 128);
    const stringLength = allocated ? uint(scratch + 20) : flags, source = uint(scratch + 16);
    const count = add(stringLength, 2);
    let storage = 0;
    if (count >= 4097) {
      let capacity = 4096;
      do { capacity = (capacity << 1) >>> 0; } while (capacity < count);
      storage = call(368, capacity) >>> 0;
      putByte(storage, 5); put(packet + 12, storage); put(packet + 8, capacity);
    }
    call(363, (storage || inline) + 1, allocated ? source : scratch + 16, add(stringLength, 1));
    put(packet + 4, count);
    const sequence = uint(state + 2348);
    put(state + 2348, sequence + 1);
    const owner = call(371, 16) >>> 0;
    zeroLong(owner + 4); put(owner + 12, packet); put(owner, 33124);
    const oldCount = uint(state + 2336), required = add(oldCount, 1);
    let capacity = uint(state + 2340), entries;
    if (capacity >= required) entries = uint(state + 2344);
    else {
      let next = capacity ? capacity << 1 : 256;
      do { capacity = next >>> 0; next = capacity << 1; } while (capacity < required);
      const previous = uint(state + 2344);
      entries = call(368, capacity << 4) >>> 0;
      for (let index = 0; index < oldCount; index++) {
        const from = add(previous, index << 4), to = add(entries, index << 4);
        put(to, uint(from)); put(to + 4, uint(from + 4)); put(to + 8, uint(from + 8));
        zeroLong(from + 4); putByte(to + 12, byte(from + 12));
      }
      call(362, previous); put(state + 2344, entries); put(state + 2340, capacity);
    }
    const entry = add(entries, oldCount << 4);
    put(entry + 4, packet); put(entry, sequence); putByte(entry + 12, 1); put(entry + 8, owner);
    put(state + 2336, required);
    if (allocated) call(362, source);
    if (byte(scratch + 44) && (byte(scratch + 43) & 128)) call(362, uint(scratch + 32));
  }
  function pruneEmptyReferenceGroups(state) {
    let storage = uint(state + 2412), entries = storage || state + 2416;
    const oldCount = uint(state + 2404), oldEnd = add(entries, oldCount << 4);
    let current = entries, end = oldEnd;
    if (oldCount) {
      for (;;) {
        const sentinel = current + 4;
        if (uint(current + 8) !== sentinel) current += 16;
        else {
          const last = end - 16;
          if (last === current) { end = current; break; }
          put(current, uint(last));
          put(uint(current + 12) + 4, sentinel);
          put(current + 12, sentinel); put(current + 8, sentinel); put(current + 4, 0);
          const fromSentinel = last + 4, next = uint(last + 8);
          put(current + 4, uint(fromSentinel));
          if (next === fromSentinel) {
            put(current + 12, sentinel); put(current + 8, sentinel);
            put(fromSentinel, 0); put(last + 8, fromSentinel);
          } else {
            put(current + 8, next); put(current + 12, uint(last + 12));
            put(uint(last + 8) + 8, sentinel); put(uint(last + 12) + 4, sentinel);
            put(fromSentinel, 0); put(last + 8, fromSentinel);
          }
          put(last + 12, fromSentinel);
          // Recheck the moved group: it may also be empty.
          end = last;
        }
        if (current === end) break;
      }
      storage = uint(state + 2412); entries = storage || state + 2416;
    }
    const trailingEnd = add(entries, uint(state + 2404) << 4);
    for (let group = end; group !== trailingEnd; group += 16) unlinkReference(group + 4);
    put(state + 2404, (end - entries) >> 4);
  }

  function decodeEntitySnapshot(state, reader) {
    state >>>= 0; reader >>>= 0;
    const scratch = add(runtime.stackPointer.value, -48);
    runtime.stackPointer.value = scratch;
    const input = createReader(reader), data = uint(reader), length = uint(reader + 4), previousSequence = uint(state + 2276);
    const sequence = input.varint(), fresh = sequence > previousSequence;
    put(state + 2280, sequence); put(state + 2276, fresh ? sequence : previousSequence);
    const encryptedStart = add(input.cursor(), data), encryptedLength = add(length, -input.cursor());
    for (let index = 0; index < encryptedLength; index++)
      putByte(add(encryptedStart, index), byte(add(encryptedStart, index)) ^ byte(32272 + (index & 255)));
    acknowledgeReliablePackets(state, input.varint());
    const entityBlockLength = input.varint();
    if (fresh) {
      put(state + 2372, 0); zeroLong(state + 2364);
      const removals = input.varint();
      put(reader + 8, add(input.cursor(), 2));
      let retiredCount = 0;
      for (let index = 0; index < removals; index++)
        retiredCount = retireEntity(state, rotateHandle(input.integer()), scratch, retiredCount);
      put(reader + 8, add(input.cursor(), 2));
      for (;;) {
        const packed = rotateHandle(input.integer());
        if (!packed) break;
        const flags = input.byte(false) ^ 54, entity = activateEntity(state, packed);
        if (flags & 128) putByte(entity + 44, byte(entity + 44) | 1);
        const fieldScratch = add(runtime.stackPointer.value, -32);
        runtime.stackPointer.value = fieldScratch;
        if (!(flags & 2)) call(1008, entity, reader, flags & 255);
        if (flags & 8) readDenseFields(entity, flags, input, fieldScratch);
        else {
          let field = 0;
          for (;;) {
            const delta = input.varint(1, true);
            if (!delta) break;
            field = add(field, delta);
            readField(field, entity, input, fieldScratch);
          }
        }
        runtime.stackPointer.value = add(fieldScratch, 32);
      }
    } else put(reader + 8, add(input.cursor(), entityBlockLength));
    put(reader + 8, add(input.cursor(), 1));
    for (;;) {
      const index = input.varint();
      if (!index) break;
      call(1009, state, reader, index === 1 ? 0 : Number(add(index, -1) <= previousSequence));
    }
    // The terminating event index is followed by one framing byte and an ignored
    // varint. The original consumes its first framing byte even when truncated.
    put(reader + 8, add(input.cursor(), 1));
    input.varint(0, false, false);
    const encryptedEnd = add(input.cursor(), uint(reader));
    const restoreLength = add(encryptedEnd, -encryptedStart);
    for (let index = 0; index < restoreLength; index++)
      putByte(add(encryptedStart, index), byte(add(encryptedStart, index)) ^ byte(32272 + (index & 255)));
    call(372, scratch);
    appendLoginEvent(state, scratch);
    pruneEmptyReferenceGroups(state);
    putLong(state + 2320, long(scratch)); putLong(state + 2328, long(scratch + 8));
    runtime.stackPointer.value = add(scratch, 48);
  }

  return { 1015: decodeEntitySnapshot };
}
