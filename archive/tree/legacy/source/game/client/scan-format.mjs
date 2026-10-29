/** Recovered client scan, ungetc, range and pixel-format helpers (no calls).
 *
 * 415 and 607 are case-insensitive byte comparisons, the second bounded. 1954
 * is a stream ungetc/putback. 733 is a bounded NUL scan. 601 clamps a view
 * rectangle. 641 writes a printf-style float conversion suffix. 2187 clears
 * two global byte ranges. 2280 unpacks four masked channels into dwords.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;
const lower = value => (u32(value - 65) < 26 ? value | 32 : value);
const hasZeroByte = word => (((word ^ -1) & ((word - 0x01010101) | 0) & 0x80808080) | 0) !== 0;

export const functionIds = Object.freeze([415, 607, 1954, 733, 601, 641, 2187, 2280]);

export function createScanFormatHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function access(method, address, ...args) {
    try {
      return dataView()[method](address, ...args);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const u8 = address => access('getUint8', address);
  const i8 = address => access('getInt8', address);
  const u32At = address => access('getUint32', address, true);
  const set8 = (address, value) => access('setUint8', address, value);
  const set16 = (address, value) => access('setUint16', address, value, true);
  const set32 = (address, value) => access('setUint32', address, value, true);

  // Shared bounded NUL scan, used by 733.
  const scanTail = (state, stop) => {
    if (state.remaining === 0) return 0;
    for (;;) {
      if (u8(state.cursor) === 0) return state.cursor | 0;
      state.cursor = u32(state.cursor + 1);
      state.remaining = u32(state.remaining - 1);
      if (state.remaining === 0) return 0;
    }
  };

  return {
    // 415: case-insensitive comparison without a bound.
    415: (p0, p1) => {
      let left = u32(p0), right = u32(p1);
      let leftByte = u8(left), result = 0;
      if (leftByte !== 0) {
        for (;;) {
          const rightByte = u8(right);
          if (rightByte === 0) { result = leftByte; break; }
          if (leftByte !== rightByte && lower(leftByte) !== lower(rightByte)) {
            result = leftByte;
            break;
          }
          right = u32(right + 1);
          left = u32(left + 1);
          leftByte = u8(left);
          if (leftByte === 0) { result = 0; break; }
        }
      }
      return (lower(result & 255) - lower(u8(right))) | 0;
    },

    // 607: the same comparison with an explicit remaining-count bound.
    607: (p0, p1, p2) => {
      if (!p2) return 0;
      let left = u32(p0), right = u32(p1), remaining = u32(p2);
      let leftByte = u8(left), result = 0;
      if (leftByte !== 0) {
        for (;;) {
          const rightByte = u8(right);
          remaining = u32(remaining - 1);
          if (rightByte === 0 || remaining === 0 ||
              (leftByte !== rightByte && lower(leftByte) !== lower(rightByte))) {
            result = leftByte;
            break;
          }
          right = u32(right + 1);
          left = u32(left + 1);
          leftByte = u8(left);
          if (leftByte === 0) { result = 0; break; }
        }
      }
      return (lower(result & 255) - lower(u8(right))) | 0;
    },

    // 1954: ungetc-style putback with the historical +8/+12/+16/+44 layout.
    1954: (p0, p1) => {
      const object = u32(p0);
      let position = u32At(at(object, 44));
      const minimum = u32At(at(object, 24));
      if (position < minimum) {
        set32(at(object, 44), minimum);
        position = minimum;
      }
      const low = u32At(at(object, 8));
      let read = u32At(at(object, 12));
      if (low >= read) return -1;
      if ((p1 | 0) === -1) {
        set32(at(object, 16), position);
        set32(at(object, 12), u32(read - 1));
        set32(at(object, 8), low);
        return 0;
      }
      const value = (p1 << 24) >> 24;
      if (!(u8(at(object, 48)) & 16) && i8(u32(read - 1)) !== value) return -1;
      read = u32(read - 1);
      set32(at(object, 16), position);
      set32(at(object, 12), read);
      set32(at(object, 8), low);
      set8(u32At(at(object, 12)), value);
      return p1 | 0;
    },

    // 733: byte scan with the original unaligned and word fast paths.
    733: (p0, p1) => {
      const state = {cursor: u32(p0), remaining: u32(p1)};
      let nonzero = state.remaining !== 0 ? 1 : 0;
      let found = false;
      if ((state.cursor & 3) !== 0 && state.remaining !== 0) {
        for (;;) {
          if (u8(state.cursor) === 0) { found = true; break; }
          state.remaining = u32(state.remaining - 1);
          nonzero = state.remaining !== 0 ? 1 : 0;
          state.cursor = u32(state.cursor + 1);
          if ((state.cursor & 3) === 0) break;
          if (state.remaining !== 0) continue;
          break;
        }
      }
      if (!found) {
        if (!nonzero) return 0;
        if (u8(state.cursor) === 0 || state.remaining < 4) return scanTail(state);
        for (;;) {
          if (hasZeroByte(u32At(state.cursor))) return scanTail(state);
          state.cursor = u32(state.cursor + 4);
          state.remaining = u32(state.remaining - 4);
          if (state.remaining <= 3) break;
        }
      }
      return scanTail(state);
    },

    // 601: clamp rectangle origin/size counters from a configuration record.
    601: (p0, p1) => {
      if (!p0) return;
      const object = u32(p0);
      let second = u32At(at(object, 12));
      const first = u32At(at(object, 8));
      if (!p1) {
        set32(at(object, 36), 0);
        set32(at(object, 40), 0);
        set32(at(object, 44), first);
        set32(at(object, 48), second);
        return;
      }
      const config = u32(p1);
      const width = u32At(at(config, 8)) | 0;
      const height = u32At(at(config, 12)) | 0;
      if (!(width >= 1 && height >= 1 && (first | 0) >= 1 && (second | 0) > 0)) {
        set32(at(object, 44), 0);
        set32(at(object, 48), 0);
        return;
      }
      const x = u32At(config) | 0;
      const y = u32At(at(config, 4)) | 0;
      const startX = x > 0 ? x : 0;
      set32(at(object, 36), startX);
      const endX = Math.min(first | 0, (x + width) | 0);
      set32(at(object, 44), (endX - startX) | 0);
      const startY = y > 0 ? y : 0;
      set32(at(object, 40), startY);
      const endY = Math.min(second | 0, (y + height) | 0);
      second = (endY - startY) | 0;
      set32(at(object, 48), second);
    },

    // 641: prefix, copy, and the float conversion suffix.
    641: (p0, p1, p2) => {
      let cursor = u32(p0);
      if (p2 & 2048) { set8(cursor, 43); cursor = u32(cursor + 1); }
      if (p2 & 1024) { set8(cursor, 35); cursor = u32(cursor + 1); }
      const conversion = p2 & 260;
      if (conversion !== 260) {
        set16(cursor, 10798);
        cursor = u32(cursor + 2);
      }
      const upper = p2 & 16384;
      for (;;) {
        const value = u8(p1);
        if (value === 0) break;
        set8(cursor, value);
        cursor = u32(cursor + 1);
        p1 = u32(p1 + 1);
      }
      let letter;
      if (conversion === 260) letter = upper ? 65 : 97;
      else if (conversion === 256) letter = upper ? 69 : 101;
      else if (conversion === 4) letter = upper ? 70 : 102;
      else letter = upper ? 71 : 103;
      set8(cursor, letter);
      return conversion !== 260 ? 1 : 0;
    },

    // 2187: clear two arithmetic progressions of global bytes.
    2187: p0 => {
      for (let address = 165444; address <= 166524; address += 72) set8(address, 0);
      for (let address = 166596; address <= 167892; address += 72) set8(address, 0);
    },

    // 2280: unpack four masked channels from source dwords.
    2280: (p0, p1, p2, p3, p4) => {
      let out = u32(p0), input = u32(p1);
      if ((p2 | 0) >= 1) {
        const mask0 = u32At(at(p3, 12));
        const mask1 = u32At(at(p3, 24));
        const mask2 = u32At(at(p3, 16));
        const mask3 = u32At(at(p3, 20));
        const a34 = u8(at(p4, 34)), a30 = u8(at(p4, 30)), a33 = u8(at(p4, 33));
        const a29 = u8(at(p4, 29)), a32 = u8(at(p4, 32)), a28 = u8(at(p4, 28));
        const b35 = u8(at(p3, 35)), b34 = u8(at(p3, 34)), b33 = u8(at(p3, 33)), b32 = u8(at(p3, 32));
        let count = 0;
        for (;;) {
          const value = u32At(input);
          const field = (((((value & mask0) >>> b32) >>> a28) << a32)
            | (((value & mask1) >>> b35) << 24)
            | (((((value & mask2) >>> b33) >>> a29) << a33))
            | (((((value & mask3) >>> b34) >>> a30) << a34))) >>> 0;
          set32(out, field);
          input = u32(input + 4);
          out = u32(out + 4);
          count++;
          if (count === (p2 | 0)) break;
        }
      }
      return Math.imul(p2, 4) | 0;
    },
  };
}
