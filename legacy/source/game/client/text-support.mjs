/** Recovered client text, stream and array helpers (no calls).
 *
 * 378 is the aligned word-at-a-time NUL scanner. 464 recognises sign and 0x
 * prefixes. 545 parses a signed decimal integer. 769 compares bounded byte
 * strings. 911 is an unsigned lower-bound search. 1346 clears twenty global
 * bytes. 1943 compares signed byte ranges. 1955 advances a stream position.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([378, 464, 545, 769, 911, 1346, 1943, 1955]);

export function createTextSupportHooks(runtime) {
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
  const set32 = (address, value) => access('setUint32', address, value, true);

  return {
    // 378: strlen with the original aligned four-byte fast path.
    378: p0 => {
      const origin = u32(p0);
      let cursor = origin;
      if (origin & 3) {
        for (;;) {
          if (u8(cursor) === 0) return (cursor - origin) | 0;
          cursor = u32(cursor + 1);
          if ((cursor & 3) === 0) break;
        }
      }
      let wordAddress;
      for (;;) {
        const aligned = cursor;
        cursor = u32(aligned + 4);
        wordAddress = aligned;
        const word = u32At(aligned);
        if ((((word ^ -1) & ((word - 0x01010101) | 0) & 0x80808080) | 0) === 0)
          continue;
        if ((word & 255) === 0) return (aligned - origin) | 0;
        break;
      }
      let probe = wordAddress;
      for (;;) {
        const value = u8(u32(probe + 1));
        cursor = u32(probe + 1);
        probe = cursor;
        if (value === 0) return (cursor - origin) | 0;
      }
    },

    // 464: skip one sign character or a 0x prefix when the flag mask permits.
    464: (p0, p1, p2) => {
      const flags = u32At(at(p2, 4)) & 176;
      if (flags === 32) return p1 | 0;
      if (flags !== 16) return p0 | 0;
      const first = u8(p0);
      if (first === 43 || first === 45) return u32(p0 + 1) | 0;
      if (((p1 - p0) | 0) < 2 || u8(p0) !== 48 || (u8(u32(p0 + 1)) | 32) !== 120)
        return p0 | 0;
      return u32(p0 + 2) | 0;
    },

    // 545: whitespace, sign and decimal parsing with negative accumulation.
    545: p0 => {
      const origin = u32(p0);
      let cursor = origin;
      let current = origin;
      let character = 0;
      for (;;) {
        current = cursor;
        cursor = u32(cursor + 1);
        character = i8(current);
        if (character === 32 || u32(character - 9) < 5) continue;
        break;
      }
      let negative = 0;
      let digits = current;
      if (character === 45) {
        negative = 1;
        digits = cursor;
      } else if (character === 43) {
        digits = cursor;
      }
      let accumulator = 0;
      for (;;) {
        const digit = i8(digits);
        if (u32(digit - 48) < 10) {
          digits = u32(digits + 1);
          accumulator = (Math.imul(accumulator, 10) - digit + 48) | 0;
          continue;
        }
        break;
      }
      return (negative ? accumulator : (0 - accumulator) | 0);
    },

    // 769: bounded byte comparison. The bound is checked before each byte pair.
    769: (p0, p1, p2) => {
      if (!p2) return 0;
      let left = u32(p0), right = u32(p1), remaining = u32(p2);
      let leftByte = u8(left);
      if (leftByte === 0) return (0 - u8(right)) | 0;
      let result = 0;
      for (;;) {
        const rightByte = u8(right);
        remaining = u32(remaining - 1);
        if (rightByte === 0 || remaining === 0 || leftByte !== rightByte) {
          result = leftByte;
          break;
        }
        right = u32(right + 1);
        leftByte = u8(u32(left + 1));
        left = u32(left + 1);
        if (leftByte === 0) {
          result = 0;
          break;
        }
      }
      return ((result & 255) - u8(right)) | 0;
    },

    // 911: unsigned lower-bound over dwords. The frame word holds the probe.
    911: (p0, p1, p2) => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      let base = u32(p0);
      let count = (p1 - p0) >> 2;
      while (count !== 0) {
        const middle = count >>> 1;
        set32(at(frame, 12), base);
        const slot = u32(u32At(at(frame, 12)) + (middle << 2));
        set32(at(frame, 12), slot);
        const candidate = u32At(slot);
        const less = candidate < u32At(p2);
        base = less ? u32(slot + 4) : base;
        count = less ? (count - middle - 1) | 0 : middle;
      }
      runtime.stackPointer.value = u32(frame + 16);
      return base | 0;
    },

    // 1346: clear twenty global bytes spaced sixteen bytes apart.
    1346: p0 => {
      for (let address = 440820; address <= 441124; address += 16) set8(address, 0);
    },

    // 1943: signed lexicographic comparison of two equal-length byte ranges.
    1943: (p0, p1, p2, p3, p4) => {
      const expectedEnd = u32(p1 + ((p4 - p3) | 0));
      let left = u32(p1), right = u32(p3);
      while (right !== u32(p4)) {
        if (left === u32(p2)) return -1;
        const a = i8(left), b = i8(right);
        if (a < b) return -1;
        if (a > b) return 1;
        left = u32(left + 1);
        right = u32(right + 1);
      }
      return left !== expectedEnd ? 1 : 0;
    },

    // 1955: advance and clamp a stream position, then peek one byte.
    1955: p0 => {
      const object = u32(p0);
      let position = u32At(at(object, 44));
      const minimum = u32At(at(object, 24));
      if (position < minimum) {
        set32(at(object, 44), minimum);
        position = minimum;
      }
      let result = -1;
      if (u8(at(object, 48)) & 8) {
        if (position > u32At(at(object, 16))) {
          const first = u32At(at(object, 8));
          const second = u32At(at(object, 12));
          set32(at(object, 16), position);
          set32(at(object, 12), second);
          set32(at(object, 8), first);
        }
        const limit = u32At(at(object, 16));
        const readPointer = u32At(at(object, 12));
        if (limit > readPointer) result = u8(readPointer);
      }
      return result | 0;
    },
  };
}
