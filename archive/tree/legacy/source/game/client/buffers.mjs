/** Recovered client buffer/string helpers, hashes and class scans (no calls).
 *
 * 914 stores a qword with a width selected by an enum. 1938/1941 are
 * rotate-xor accumulators over dwords/bytes. 1796/1797 scan a dword range for
 * a character-class mask. 1799 widens each dword to its 16-bit class mask.
 * 523/525 return inline or heap string end pointers. 365 is a byte-wise
 * three-way comparison.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([
  365, 523, 525, 914, 1796, 1797, 1799, 1938, 1941,
]);

export function createBufferHooks(runtime) {
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
  const u16 = address => access('getUint16', address, true);
  const u32At = address => access('getUint32', address, true);
  const set8 = (address, value) => access('setUint8', address, value);
  const set16 = (address, value) => access('setUint16', address, value, true);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const set64 = (address, value) => access('setBigUint64', address, value, true);

  function stringEnd(p0, scale) {
    const frame = u32(runtime.stackPointer.value - 16);
    runtime.stackPointer.value = frame;
    const heap = u8(at(p0, 11)) >> 7;
    const data = heap ? u32At(p0) : u32(p0);
    const size = heap ? u32At(at(p0, 4)) : u8(at(p0, 11));
    set32(at(frame, 8), u32(data + u32(Math.imul(size, scale))));
    const result = u32At(at(frame, 8));
    runtime.stackPointer.value = u32(frame + 16);
    return result | 0;
  }

  return {
    // 365: byte-wise three-way comparison. The result is the difference of the
    // first differing bytes, or 0 when both strings end together.
    365: (p0, p1) => {
      let left = u32(p0), right = u32(p1);
      for (;;) {
        const a = u8(left), b = u8(right);
        if (a === 0 || a !== b) return (a - b) | 0;
        left = u32(left + 1);
        right = u32(right + 1);
      }
    },

    // 523/525: string end pointer for a dword/byte element size. The result is
    // staged through a 16-byte stack frame.
    523: p0 => stringEnd(p0, 4),
    525: p0 => stringEnd(p0, 1),

    // 914: store the low bits of p2 with width selected by p1+2. Negative
    // selectors -2 and -1 select 8 and 16 bits; 0/1 select 32 bits, 3 selects
    // 64 bits, and every other selector returns without storing.
    914: (p0, p1, p2) => {
      if (!p0) return;
      switch ((p1 + 2) | 0) {
        case 0: set8(at(p0, 0), Number(BigInt.asUintN(8, p2))); break;
        case 1: set16(at(p0, 0), Number(BigInt.asUintN(16, p2))); break;
        case 2:
        case 3: set32(at(p0, 0), Number(BigInt.asUintN(32, p2))); break;
        case 5: set64(at(p0, 0), p2); break;
        default: break;
      }
    },

    // 1796: advance p2 while every dword is in the class mask p1; return the
    // first nonmatching address or p3 at the end.
    1796: (p0, p1, p2, p3) => {
      let cursor = u32(p2);
      while (cursor !== u32(p3)) {
        const value = u32At(cursor);
        if (value > 127 || (u16(u32((value << 1) + 122048)) & p1) === 0) break;
        cursor = u32(cursor + 4);
      }
      return cursor | 0;
    },

    // 1797: the same scan, returning the first matching address or p3.
    1797: (p0, p1, p2, p3) => {
      let cursor = u32(p2);
      while (cursor !== u32(p3)) {
        const value = u32At(cursor);
        if (value <= 127 && (u16(u32((value << 1) + 122048)) & p1) !== 0)
          return cursor | 0;
        cursor = u32(cursor + 4);
      }
      return p3 | 0;
    },

    // 1799: widen each dword in [p1,p2) to a 16-bit class mask at p3.
    1799: (p0, p1, p2, p3) => {
      let source = u32(p1), destination = u32(p3);
      while (source !== u32(p2)) {
        const value = u32At(source);
        const mask = value <= 127 ? u16(u32((value << 1) + 122048)) : 0;
        set16(destination, mask);
        destination = u32(destination + 2);
        source = u32(source + 4);
      }
      return p2 | 0;
    },

    // 1938: rotate-xor accumulator over dwords.
    1938: (p0, p1, p2) => {
      let accumulator = 0;
      let cursor = u32(p1);
      while (cursor !== u32(p2)) {
        accumulator = (u32At(cursor) + (accumulator << 4)) | 0;
        const high = accumulator & 0xf0000000;
        accumulator ^= (high | (high >>> 24));
        cursor = u32(cursor + 4);
      }
      return accumulator;
    },

    // 1941: the same accumulator over signed bytes.
    1941: (p0, p1, p2) => {
      let accumulator = 0;
      let cursor = u32(p1);
      while (cursor !== u32(p2)) {
        accumulator = (i8(cursor) + (accumulator << 4)) | 0;
        const high = accumulator & 0xf0000000;
        accumulator ^= (high | (high >>> 24));
        cursor = u32(cursor + 1);
      }
      return accumulator;
    },
  };
}
