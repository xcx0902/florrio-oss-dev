/** Complete server input decoding and command dispatch from original655.
 * World/component storage, parser cursor and stack residues retain the WASM ABI.
 */
const f32 = Math.fround;

const TAU = 0x1921fb54442d18 * 2 ** -50;

const DIRECTION_SCALE = 0x144ad13d5bfeba * 2 ** -47;

export const functionIds = Object.freeze([ 388, 655 ]);

export const inputStatus = Object.freeze({
  id: 655,
  complete: true,
  registered: true
});

export const dependencyIds = Object.freeze([ 14, 15, 16, 18, 20, 21, 25, 26, 29, 34, 43, 44, 47, 57, 58, 64, 65, 67, 68, 73, 74, 96, 97, 105, 106, 125, 128, 140, 145, 147, 148, 160, 213, 215, 261, 262, 265, 266, 269, 387, 397, 419, 420, 421, 425, 427 ]);

export function createInputHooks(runtime) {
  let buffer, view;
  function access(p, n) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    if ((p >>> 0) + n > view.byteLength) throw new WebAssembly.RuntimeError('memory access out of bounds');
    return view;
  }
  const u8 = p => access(p, 1).getUint8(p >>> 0), s8 = p => access(p, 1).getInt8(p >>> 0), u16 = p => access(p, 2).getUint16(p >>> 0, true), u32 = p => access(p, 4).getUint32(p >>> 0, true);
  const u64 = p => access(p, 8).getBigUint64(p >>> 0, true), f = p => access(p, 4).getFloat32(p >>> 0, true), d = p => access(p, 8).getFloat64(p >>> 0, true);
  const byte = (p, v) => access(p, 1).setUint8(p >>> 0, v), short = (p, v) => access(p, 2).setUint16(p >>> 0, v, true), uint = (p, v) => access(p, 4).setUint32(p >>> 0, v, true);
  const long = (p, v = 0n) => access(p, 8).setBigUint64(p >>> 0, BigInt.asUintN(64, v), true), float = (p, v) => access(p, 4).setFloat32(p >>> 0, v, true), double = (p, v) => access(p, 8).setFloat64(p >>> 0, v, true);
  const call = (id, ...args) => runtime.call(id, ...args), free = p => call(14, p), zero = (p, n) => call(29, p, 0, n);
  function resetTracking() {
    for (const base of [ 8551040, 8555152 ]) {
      free(u32(base + 12));
      long(base + 8);
      long(base);
    }
  }
  function invalidate(entity, created = false) {
    for (const offset of [ 264876, 264880 ]) {
      const address = u32(entity) + ((u32(entity + 16) & 16383) << 3) + offset, cached = u32(address);
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
  function mark(entity, revision) {
    uint(entity + revision, u32(u32(entity) + 2140));
    uint(entity + revision + 4, u32(u32(entity) + 2140));
    invalidate(entity);
  }
  function trackedByte(component, offset, value, revision) {
    const target = component + offset;
    if (u8(target) === value >>> 0) return;
    resetTracking();
    byte(8551056, u8(target));
    uint(8551044, 1);
    byte(target, value);
    byte(8555168, value);
    uint(8555156, 1);
    if (u8(8551056) !== u8(8555168)) {
      const entity = u32(component);
      if (entity) {
        mark(entity, 488);
        uint(component + revision, u32(u32(u32(component)) + 2140));
      }
    }
  }
  function clearTrackedPlayerByte(target, notify) {
    if (!u8(target)) return;
    resetTracking();
    byte(8551056, u8(target));
    uint(8551044, 1);
    byte(target, 0);
    byte(8555168, 0);
    uint(8555156, 1);
    call(notify, target);
  }
  function pushPointer(vector, value) {
    const count = u32(vector), required = count + 1 >>> 0;
    let capacity = u32(vector + 4), pointer = u32(vector + 8);
    if (capacity < required) {
      capacity = capacity ? capacity << 1 : 1024;
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
  /** Original388: unsigned LEB128, with the original pending-byte alignment. */  function readVarUint(reader) {
    let cursor = u32(reader + 8);
    const length = u32(reader + 4), data = u32(reader);
    if (u32(reader + 12)) {
      uint(reader + 12, 0);
      cursor = cursor + 1 >>> 0;
      uint(reader + 8, cursor);
    }
    let value = 0;
    for (let shift = 0; shift <= 28; shift += 7) {
      const next = cursor + 1 >>> 0;
      if (next > length) return value | 0;
      uint(reader + 8, next);
      const part = u8(data + cursor);
      value |= (shift === 28 ? part : part & 127) << shift;
      if (!(part & 128) || next === length) return value | 0;
      cursor = next;
    }
    return value | 0;
  }
  function readByte(reader) {
    const cursor = u32(reader + 8), next = cursor + 1 >>> 0;
    if (next > u32(reader + 4)) return 0;
    uint(reader + 8, next);
    return u8(u32(reader) + cursor);
  }
  function alignString(reader) {
    if (u32(reader + 12)) {
      uint(reader + 12, 0);
      uint(reader + 8, u32(reader + 8) + 1);
    }
  }
  /** Construct libc++ strings without replacing their stack/heap side effects. */  function readString(reader, target, storeLength = true) {
    alignString(reader);
    const start = u32(reader + 8), data = u32(reader), length = u32(reader + 4);
    let cursor = start;
    while (cursor < length) {
      uint(reader + 8, cursor + 1);
      if (!u8(data + cursor)) break;
      cursor++;
    }
    const size = cursor - start >>> 0;
    if (size >= 0xfffffff0) {
      call(58);
      throw new WebAssembly.RuntimeError('unreachable');
    }
    let storage = target;
    if (size <= 10) byte(target + 11, size); else {
      const capacity = size + 16 & -16;
      storage = call(20, capacity);
      uint(target + 8, capacity | -2147483648);
      uint(target, storage);
      if (storeLength) uint(target + 4, size);
    }
    for (let index = 0; index < size; index++) byte(storage + index, u8(data + start + index));
    byte(storage + size, 0);
  }
  function discardStrings(reader, scratch, count, prefix = false) {
    if (prefix) readByte(reader);
    let prior = [];
    for (let index = 0; index < count; index++) {
      readString(reader, scratch + 136, index < count - 1 || count === 1);
      if (index < count - 1) prior.push([ s8(scratch + 147), u32(scratch + 136) ]);
    }
    if (s8(scratch + 147) < 0) free(u32(scratch + 136));
    for (let index = prior.length - 1; index >= 0; index--) if (prior[index][0] < 0) free(prior[index][1]);
  }
  function nextRandomValue(state) {
    const quotient = Math.floor((state >>> 0) / 44488) >>> 0, product = Math.imul(state + Math.imul(quotient, -44488) | 0, 48271) >>> 0, correction = Math.imul(quotient, 3399) >>> 0;
    return (product < correction ? 2147483647 : 0) + product - correction >>> 0;
  }
  const randomFraction = state => f32(f32(state - 1 >>> 0) * 2 ** -31);
  function nextRandom() {
    const value = nextRandomValue(u32(8573024));
    uint(8573024, value);
    return value;
  }
  /** Shared maximum-address free heap, then 128-record chunk allocation. */  function acquireComponent(pool, stride) {
    const count = u32(pool + 16), heap = u32(pool + 24);
    if (count) {
      const result = u32(heap);
      if (count === 1) {
        uint(pool + 16, 0);
        return result;
      }
      const last = heap + (count << 2) - 4;
      uint(heap, u32(last));
      uint(last, result);
      const remaining = count - 1;
      if (count !== 2) {
        const root = u32(heap);
        let child = 1;
        if (count >= 4 && u32(heap + 4) < u32(heap + 8)) child = 2;
        let value = u32(heap + (child << 2));
        if (value >= root) {
          const finalParent = count - 3 >>> 1;
          let hole = 0;
          for (;;) {
            uint(heap + (hole << 2), value);
            hole = child;
            if (child > finalParent) break;
            child = child << 1 | 1;
            if (remaining > child + 1 && u32(heap + (child << 2)) < u32(heap + (child + 1 << 2))) child++;
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
      return chunk + used * stride;
    }
    const chunk = call(16, stride * 128);
    pushPointer(pool + 4, chunk);
    uint(pool, 1);
    return chunk;
  }
  function attachAvatar(player, entity) {
    if (u32(player + 100) === entity) return;
    resetTracking();
    const handle = player + 100;
    call(105, handle, 8551040);
    if (u32(handle) !== entity) {
      const previous = u32(player + 104);
      uint(previous + 8, u32(player + 108));
      uint(u32(player + 108) + 4, previous);
      uint(player + 108, handle);
      uint(handle, 0);
      uint(handle, u32(entity + 4));
      const next = u32(entity + 12);
      uint(player + 108, next);
      uint(next + 4, handle);
      uint(player + 104, entity + 4);
      uint(entity + 12, handle);
    }
    call(105, handle, 8555152);
    const count = u32(8551044);
    let changed = count !== u32(8555156);
    const before = u32(8551052) || 8551056, after = u32(8555164) || 8555168;
    for (let index = 0; !changed && index < count; index++) changed = u8(before + index) !== u8(after + index);
    if (changed && u32(player)) {
      mark(u32(player), 296);
      uint(player + 152, u32(u32(u32(player)) + 2140));
    }
  }
  function ensureAvatarComponent(entity) {
    let avatar = u32(entity + 200);
    if (avatar) return avatar;
    const world = u32(entity);
    avatar = acquireComponent(world + 1732, 744);
    uint(entity + 200, avatar);
    uint(avatar, entity);
    const revision = u32(u32(entity) + 2140);
    short(avatar + 12, 0);
    byte(avatar + 10, 0);
    short(avatar + 8, 0);
    uint(avatar + 4, revision);
    zero(avatar + 16, 132);
    uint(avatar + 296, 0);
    short(avatar + 148, 1);
    zero(avatar + 152, 126);
    long(avatar + 285);
    long(avatar + 280);
    long(avatar + 736);
    byte(avatar + 728, 0);
    for (let handle = avatar + 572; handle >= avatar + 308; handle -= 12) {
      uint(handle + 8, handle);
      uint(handle + 4, handle);
      uint(handle, 0);
    }
    uint(avatar + 304, avatar + 296);
    uint(avatar + 300, avatar + 296);
    zero(avatar + 584, 121);
    byte(entity + 95, u8(entity + 95) | 32);
    invalidate(entity, true);
    pushPointer(u32(entity) + 1764, u32(entity + 200));
    mark(entity, 488);
    return u32(entity + 200);
  }
  function ensureBodyComponents(entity) {
    const result = {};
    let component = u32(entity + 164);
    if (!component) {
      component = call(68, u32(entity) + 1176);
      uint(entity + 164, component);
      uint(component, entity);
      const revision = u32(u32(entity) + 2140);
      long(component + 48);
      byte(component + 40, 0);
      uint(component + 4, revision);
      long(component + 8);
      long(component + 16);
      long(component + 24);
      byte(component + 32, 0);
      call(67, entity, u32(entity + 164));
    }
    result.health = u32(entity + 164);
    component = u32(entity + 188);
    if (!component) {
      component = call(65, u32(entity) + 1440);
      uint(entity + 188, component);
      uint(component, entity);
      const revision = u32(u32(entity) + 2140);
      long(component + 8);
      uint(component + 4, revision);
      byte(component + 16, 0);
      long(component + 20);
      long(component + 28);
      uint(component + 36, 0);
      uint(component + 48, 16777217);
      long(component + 40, 1065353216n);
      call(64, entity, u32(entity + 188));
    }
    result.physics = u32(entity + 188);
    component = u32(entity + 168);
    if (!component) {
      component = call(97, u32(entity) + 1220);
      uint(entity + 168, component);
      uint(component, entity);
      const revision = u32(u32(entity) + 2140);
      long(component + 8);
      uint(component + 4, revision);
      long(component + 16);
      long(component + 24);
      uint(component + 32, 0);
      uint(component + 112, 0);
      byte(component + 36, 1);
      for (const offset of [ 40, 48, 56, 64, 72 ]) long(component + offset);
      byte(component + 80, 0);
      call(96, entity, u32(entity + 168));
    }
    result.position = u32(entity + 168);
    return result;
  }
  function ensureAuxiliaryComponents(entity) {
    let component = u32(entity + 184);
    if (!component) {
      component = call(148, u32(entity) + 1396);
      uint(entity + 184, component);
      uint(component, entity);
      const revision = u32(u32(entity) + 2140);
      uint(component + 12, 0);
      byte(component + 8, 0);
      uint(component + 4, revision);
      call(147, entity, component);
    }
    if (!u32(entity + 204)) {
      component = call(106, u32(entity) + 1776);
      uint(entity + 204, component);
      byte(component + 8, 0);
      uint(component + 4, 0);
      uint(component, entity);
      byte(entity + 95, u8(entity + 95) | 64);
      pushPointer(u32(entity) + 1808, component);
    }
    component = u32(entity + 192);
    if (!component) {
      component = call(420, u32(entity) + 1644);
      uint(entity + 192, component);
      uint(component, entity);
      const revision = u32(u32(entity) + 2140);
      long(component + 48);
      byte(component + 8, 0);
      uint(component + 4, revision);
      long(component + 12);
      long(component + 20);
      long(component + 28);
      long(component + 33);
      call(419, entity, u32(entity + 192));
    }
    component = u32(entity + 160);
    if (!component) {
      component = call(128, u32(entity) + 1132);
      uint(entity + 160, component);
      uint(component, entity);
      const revision = u32(u32(entity) + 2140);
      long(component + 8);
      uint(component + 4, revision);
      long(component + 16);
      call(266, entity, u32(entity + 160));
    }
    return u32(entity + 160);
  }
  /** Strip the original blocked byte sequences, trim whitespace and cut UTF-8 safely. */  function sanitizeName(scratch, pointer, length, sign) {
    const string = scratch + 88;
    if (sign >= 0) {
      byte(scratch + 98, u8(scratch + 86));
      uint(scratch + 92, length);
      uint(scratch + 88, pointer);
      short(scratch + 96, u16(scratch + 84));
      byte(scratch + 99, sign);
    } else call(269, string, pointer, length);
    let data = s8(scratch + 99) < 0 ? u32(string) : string, size = s8(scratch + 99) < 0 ? u32(string + 4) : u8(string + 11);
    for (let index = 0; index < size; index++) {
      const at = data + index;
      let remove = 0;
      if (index + 4 <= size && (!call(57, at, 1453, 4) || !call(57, at, 1444, 4))) remove = 4; else if (index + 3 <= size) {
        for (const pattern of [ 1436, 1440, 1462, 1458, 1449 ]) if (!call(57, at, pattern, 3)) {
          remove = 3;
          break;
        }
      }
      if (remove) {
        call(261, at, at + remove, size - index - remove);
        size -= remove;
        index--;
      }
    }
    byte(data + size, 0);
    call(387, string, size);
    const signAfter = s8(scratch + 99);
    data = signAfter < 0 ? u32(string) : string;
    size = signAfter < 0 ? u32(string + 4) : u8(string + 11);
    const whitespace = value => {
      const offset = value - 9 >>> 0;
      return offset <= 23 && !!(1 << offset & 8388635);
    };
    while (size && whitespace(u8(data))) {
      data++;
      size--;
    }
    while (size && whitespace(u8(data + size - 1))) size--;
    for (;;) {
      if (size <= 13) {
        let state = 0, index = 0;
        // The table's first256 bytes classify input; its next rows are DFA transitions.
                state = 0;
        for (index = 0; index < size; index++) {
          state = u8(1072 + u8(1072 + u8(data + index)) + (state & 255 | 256));
          if (state === 12) break;
        }
        if (!state && index === size) return {
          data: data,
          size: size,
          sign: signAfter
        };
      }
      size--;
    }
  }
  function rareStarterAvailable(world) {
    const count = u32(world + 1764), avatars = u32(world + 1772);
    for (let index = 0; index < count; index++) {
      const avatar = u32(avatars + (index << 2));
      if (!u32(avatar)) continue;
      const level = u8(avatar + 148), capacity = level < 15 ? 13 : level < 30 ? 14 : level < 45 ? 15 : 16;
      let all = true;
      for (let slot = 0; slot < capacity; slot++) if (slot > 15 || u8(avatar + 20 + slot) !== 35) {
        all = false;
        break;
      }
      if (all) return false;
    }
    const petals = u32(world + 36), entries = u32(world + 44);
    for (let index = 0; index < petals; index++) if (u8(u32(entries + (index << 2)) + 8) === 35) return false;
    return true;
  }
  /** Spawn, assemble all original components, then restore level and equipment. */  function spawnPlayer(player, name, scratch) {
    if (u32(player + 100) || f(player + 288) > 0) return;
    let world = u32(u32(player));
    if (u8(world + 873) === 1 && u8(world + 1911)) {
      if (!u32(player + 172) && !u8(world + 396008) && !u8(world + 396009)) {
        byte(world + 396009, 1);
        uint(world + 396012, 9);
      }
      return;
    }
    uint(player + 288, 1159479296);
    const compact = u8(world + 873) === 1;
    let radius = compact ? 100 : 800;
    float(scratch + 132, radius);
    float(scratch + 128, compact ? 50 : 100);
    const priorLevel = u8(player + 8), width = f(world + 876), half = f32(width * 0.5), negativeHalf = f32(width * -0.5), span = half - negativeHalf;
    const mix03 = 0x1333334 * 2 ** -26, mix06 = 0x1333334 * 2 ** -25, mix09 = 0x1cccccc * 2 ** -25;
    let minimum, maximum;
    if (priorLevel <= 12) {
      minimum = span * 0 + negativeHalf;
      maximum = f32(span * mix03 + negativeHalf);
    } else if (priorLevel <= 27) {
      minimum = span * mix03 + negativeHalf;
      maximum = f32(span * mix06 + negativeHalf);
    } else if (priorLevel <= 42) {
      minimum = span * mix06 + negativeHalf;
      maximum = f32(span * mix09 + negativeHalf);
    } else {
      minimum = span * mix09 + negativeHalf;
      maximum = half;
    }
    minimum = f32(minimum);
    const range = maximum - minimum;
    let collisionWorld = world;
    for (let attempt = 0; ;attempt++) {
      const first = nextRandomValue(u32(8573024)), uniform = randomFraction(first);
      const x = f32(range * Math.min(f32(uniform * uniform) * 0.8, 1) + minimum), height = f(world + 964), second = nextRandomValue(first);
      uint(8573024, second);
      const y = f32(height * f32(randomFraction(second) + -0.5));
      float(scratch + 124, x);
      float(scratch + 120, y);
      uint(scratch + 116, scratch + 120);
      uint(scratch + 112, scratch + 124);
      uint(scratch + 108, scratch + 128);
      uint(scratch + 104, scratch + 132);
      const diameter = f32(radius + radius);
      float(scratch + 148, diameter);
      float(scratch + 144, diameter);
      float(scratch + 140, f32(y - radius));
      float(scratch + 136, f32(x - radius));
      if (!call(160, collisionWorld + 2056, scratch + 136, scratch + 104)) break;
      if (attempt === 999) {
        call(427, 4522, 42, 1, 22080);
        return;
      }
      collisionWorld = u32(u32(player));
      radius = f(scratch + 132);
    }
    const entity = call(74, u32(u32(player)));
    if (!entity) return;
    attachAvatar(player, entity);
    const rememberedLevel = u8(player + 8), rememberedCount = u8(player + 96);
    if (rememberedCount) call(15, scratch + 104 | 1, player + 28, rememberedCount);
    byte(scratch + 104, rememberedCount);
    const avatar = ensureAvatarComponent(entity), {health: health, physics: physics, position: position} = ensureBodyComponents(entity);
    if (!u32(player + 172)) {
      const currentWorld = u32(u32(player));
      if (!u8(currentWorld + 396008)) {
        let token = currentWorld + 396016;
        if (s8(currentWorld + 396027) < 0) token = u32(token);
        if (token) {
          uint(scratch + 16, player + 176);
          call(140, avatar + 188, 40, 2372, scratch + 16);
          uint(scratch, token);
          call(140, avatar + 228, 50, 2372, scratch);
        }
      }
    }
    call(21, scratch + 136);
    const now = d(scratch + 144);
    byte(avatar + 728, 1);
    double(avatar + 736, now + 10000);
    const display = ensureAuxiliaryComponents(entity);
    let text = scratch + 136;
    if (name.size >= 0xfffffff0) {
      call(58);
      throw new WebAssembly.RuntimeError('unreachable');
    }
    if (name.size >= 11) {
      const capacity = name.size + 16 & -16;
      text = call(20, capacity);
      uint(scratch + 144, capacity | -2147483648);
      uint(scratch + 136, text);
      uint(scratch + 140, name.size);
    } else byte(scratch + 147, name.size);
    if (name.size) call(15, text, name.data, name.size);
    byte(text + name.size, 0);
    call(265, display + 8, scratch + 136);
    if (s8(scratch + 147) < 0) free(u32(scratch + 136));
    uint(scratch + 136, 1120403456);
    const previousMaximum = f(health + 12);
    if (previousMaximum <= 0) call(18, health + 8, scratch + 136); else {
      float(scratch + 152, f32(f32(f(health + 8) * 100) / previousMaximum));
      call(18, health + 8, scratch + 152);
    }
    call(25, health + 12, scratch + 136);
    uint(physics + 44, 1103626240);
    long(scratch + 136, 4627730092099895296n);
    call(26, physics + 8, scratch + 136);
    byte(position + 36, 0);
    const x = f(scratch + 124), y = f(scratch + 120);
    double(scratch + 152, y);
    double(scratch + 136, x);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (u8(position + 80)) {
        byte(position + 80, 0);
        let child = u32(u32(position) + 84);
        while (child) {
          const next = u32(child + 8);
          call(34, child);
          child = next;
        }
      }
      call(44, position + 20, scratch + 136);
      call(47, position + 16, scratch + 152);
    }
    call(73, entity, u32(player));
    let level = u8(avatar + 148);
    while (level < rememberedLevel) {
      call(215, avatar, f32(f32(Math.floor(call(262, level - 1) * level) + 3) - f(avatar + 280)));
      level = u8(avatar + 148);
    }
    let rare = randomFraction(nextRandom()) < 0.00005, count = u8(scratch + 104);
    const active = level < 15 ? 5 : level < 30 ? 6 : level < 45 ? 7 : 8, total = level < 15 ? 13 : level < 30 ? 14 : level < 45 ? 15 : 16;
    while ((count & 255) < active) {
      let petal = 1;
      if (rare && rareStarterAvailable(u32(u32(player)))) {
        petal = 35;
        rare = false;
      }
      byte(scratch + 105 + (count & 255), petal);
      count++;
    }
    const equipped = Math.min(count & 255, total);
    for (let slot = 0; slot < equipped; slot++) {
      const petal = u8(scratch + 105 + slot);
      call(125, avatar, slot, petal);
      const definition = (petal - 1 & 255) > 37 ? 0 : 8545792 + petal * 52;
      for (let index = 0; index < u32(definition + 32); index++) call(397, avatar, slot, index);
    }
    clearTrackedPlayerByte(player + 8, 421);
    clearTrackedPlayerByte(player + 96, 425);
    call(145, avatar);
  }
  function spawnCommand(reader, rejected, scratch) {
    byte(scratch + 106, 0);
    short(scratch + 104, 0);
    readString(reader, scratch + 136);
    short(scratch + 84, u16(scratch + 144));
    byte(scratch + 86, u8(scratch + 146));
    const pointer = u32(scratch + 136), sign = s8(scratch + 147);
    if (!rejected) {
      const entity = !u32(8545488) ? u32(24936) : 0, player = entity ? u32(entity + 120) : 0;
      const name = sanitizeName(scratch, pointer, u32(scratch + 140), sign);
      spawnPlayer(player, name, scratch);
      if (s8(scratch + 99) < 0) free(u32(scratch + 88));
    }
    if (sign < 0) free(pointer);
  }
  function currentAvatar() {
    return u32(u32(u32(24936) + 120) + 100);
  }
  const inventorySize = level => level < 15 ? 13 : level < 30 ? 14 : level < 45 ? 15 : 16;
  const activeSlots = level => level < 15 ? 5 : level < 30 ? 6 : level < 45 ? 7 : 8;
  function cycleInventory() {
    if (u32(8545488) || !u8(24837)) return;
    const entity = currentAvatar();
    if (!entity) return;
    const avatar = u32(entity + 200);
    call(125, avatar, activeSlots(u8(avatar + 148)), u8(avatar + 20));
    let previous = activeSlots(u8(avatar + 148));
    for (;;) {
      const level = u8(avatar + 148), slot = previous + 1, total = inventorySize(level), active = activeSlots(level);
      if (slot >= total) return;
      const existing = previous <= 14 ? u8(avatar + 20 + slot) : 0;
      const petal = existing ? total - active - 1 + existing : slot - active;
      call(125, avatar, slot, (petal >>> 0) % 39);
      previous = slot;
    }
  }
  function swapInventory(reader, rejected) {
    const first = readByte(reader), firstValue = readByte(reader), second = readByte(reader), secondValue = readByte(reader);
    if (rejected) return;
    const entity = currentAvatar();
    if (!entity) return;
    const avatar = u32(entity + 200), size = inventorySize(u8(avatar + 148));
    if (first >= size || second >= size || firstValue !== (first <= 15 ? u8(avatar + 20 + first) : 0) || secondValue !== (second <= 15 ? u8(avatar + 20 + second) : 0)) return;
    call(125, avatar, second, firstValue);
    call(125, avatar, first, secondValue);
  }
  function discardInventory(reader, rejected) {
    const slot = readByte(reader), petal = readByte(reader);
    if (rejected) return;
    const entity = currentAvatar();
    if (!entity) return;
    const avatar = u32(entity + 200), size = inventorySize(u8(avatar + 148));
    if (slot > 15 || slot >= size || petal !== u8(avatar + 20 + slot) || !petal || (petal - 1 & 255) > 37) return;
    const rarity = u32(8545816 + petal * 52);
    let reward = rarity <= 5 ? f(6960 + (rarity << 2)) : 0, item = 1;
    if (petal !== 1) {
      call(215, avatar, reward);
      item = u8(avatar + 20 + slot);
      if (!item) return;
    }
    let count = u8(avatar + 704);
    if (count >= 16) {
      for (let index = 0; index < count - 1; index++) byte(avatar + 705 + index, u8(avatar + 706 + index));
      item = u8(avatar + 20 + slot);
      count--;
    }
    byte(avatar + 705 + (count & 255), item);
    byte(avatar + 704, count + 1);
    call(125, avatar, slot, 0);
  }
  function readSanitizedFloat(reader) {
    const cursor = u32(reader + 8), end = cursor + 4 >>> 0;
    if (end > u32(reader + 4)) return 0;
    const pointer = u32(reader) + cursor, value = f(pointer), bits = u32(pointer);
    uint(reader + 8, end);
    return bits + 8388608 & 2130706432 ? value : 0;
  }
  function inputButtons(reader, rejected, scratch) {
    const buttons = readVarUint(reader) >>> 0, angle = readSanitizedFloat(reader), strength = readSanitizedFloat(reader);
    if (rejected) return;
    const local = u32(8545488), owner = !local ? u32(24936) : 0, player = owner ? u32(owner + 120) : 0;
    long(scratch + 72, 4618760256179416344n);
    double(scratch + 64, angle);
    const alive = u8(24837), normalized = runtime.host('a', 'a', 22903, 6924, scratch + 64);
    float(player + 284, Math.max(strength, 0));
    uint(player + 276, buttons);
    float(player + 280, f32(normalized));
    const entity = u32(player + 100);
    if (!entity) return;
    const avatar = u32(entity + 200), aim = f(player + 280);
    long(scratch + 56, 4618760256179416344n);
    double(scratch + 48, aim);
    const wrapped = runtime.host('a', 'a', 22903, 6924, scratch + 48);
    long(scratch + 40, 4618760256179416344n);
    double(scratch + 32, wrapped + TAU);
    const scaled = Math.floor(runtime.host('a', 'a', 22903, 6924, scratch + 32) * DIRECTION_SCALE), direction = scaled >= 0 && scaled < 4294967296 ? Math.trunc(scaled) >>> 0 : 0;
    trackedByte(avatar, 8, direction, 152);
    const flags = avatar + 10;
    uint(scratch + 136, buttons & 1 ? u8(flags) | 1 : u8(flags) & 254);
    call(213, flags, scratch + 136);
    uint(scratch + 136, buttons & 2 ? u8(flags) | 2 : u8(flags) & 253);
    call(213, flags, scratch + 136);
    if (!local && alive && buttons & 268435456) trackedByte(avatar, 9, 1, 156);
  }
  function suicide(reader, rejected, scratch) {
    const argument = readVarUint(reader);
    if (rejected || !u8(u32(8545488) + 24837) || argument) return;
    let entity = u32(24936);
    if (!entity) return;
    let component = u32(entity + 120);
    if (!component) return;
    entity = u32(component + 100);
    if (!entity) return;
    component = u32(entity + 164);
    short(scratch + 136, 0);
    call(43, component, 0, f(component + 8), scratch + 136);
  }
  function disconnect(reader, rejected) {
    const argument = readVarUint(reader);
    if (rejected || !u8(u32(8545488) + 24837) || argument || u8(418936) || u8(418937)) return;
    byte(418937, 1);
    uint(418940, 0);
  }
  function requestRestart(rejected) {
    if (rejected || u8(23801) !== 1 || !u8(24839) || u32(8545488) || u8(418936) || u8(418937)) return;
    uint(418940, 9);
    byte(418937, 1);
  }
  function flushOutput() {
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
  function sendInput(data, length) {
    data |= 0;
    length >>>= 0;
    const saved = runtime.stackPointer.value, reader = saved - 16 | 0;
    runtime.stackPointer.value = reader;
    if (u8(8545776)) {
      long(reader + 8);
      uint(reader, data);
      uint(reader + 4, length);
      const network = !((u32(8545488) | u8(418936)) >>> 0);
      if (length >= 65537) {
        if (network && !u8(418937)) {
          uint(418940, 4);
          byte(418937, 1);
        }
      } else {
        const sequenceSlot = network ? 418968 : 88;
        for (let index = 0; index < length; index++) byte(data + index, u8(data + index) ^ u8(4576 + (index & 255)));
        for (;;) {
          const cursor = u32(reader + 8), size = u32(reader + 4), pending = u32(reader + 12);
          if (!pending) {
            if (cursor === size) break;
          } else if (size + (cursor ^ -1) >>> 0 < 2) break;
          const sequence = readVarUint(reader) >>> 0;
          let rejected = false;
          if (sequence) {
            if (sequence <= u32(sequenceSlot)) rejected = true; else uint(sequenceSlot, sequence);
          }
          const scratch = runtime.stackPointer.value - 160 | 0;
          runtime.stackPointer.value = scratch;
          const command = readVarUint(reader) >>> 0;
          switch (command) {
           case 0:
            discardStrings(reader, scratch, 3, true);
            break;

           case 2:
            discardStrings(reader, scratch, 2, true);
            break;

           case 3:
            suicide(reader, rejected, scratch);
            break;

           case 4:
            requestRestart(rejected);
            break;

           case 5:
            discardStrings(reader, scratch, 1);
            break;

           case 6:
            spawnCommand(reader, rejected, scratch);
            break;

           case 7:
            disconnect(reader, rejected);
            break;

           case 8:
            discardInventory(reader, rejected);
            break;

           case 10:
            swapInventory(reader, rejected);
            break;

           case 12:
            inputButtons(reader, rejected, scratch);
            break;

           case 13:
            if (!rejected) cycleInventory();
            break;
          }
          runtime.stackPointer.value = scratch + 160;
        }
      }
      flushOutput();
    }
    runtime.stackPointer.value = reader + 16;
  }
  return {
    388: readVarUint,
    655: sendInput
  };
}
