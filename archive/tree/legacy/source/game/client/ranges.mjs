/** Recovered client range, string and iterator helpers (no calls).
 *
 * The bodies are byte/word copies, in-place reversals, a zero-terminated wide
 * string length, signed/unsigned byte widening, a decimal parser and a string
 * data-pointer accessor. All loops preserve the native pointer increments and
 * traps after the same partial writes.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;

export const functionIds = Object.freeze([
  389, 465, 526, 540, 644, 894, 920, 1780, 1782, 1791,
]);

export function createRangeHooks(runtime) {
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
    // 389: zero the three dwords at p0 and return p0.
    389: p0 => {
      for (let index = 0; index !== 3; index++)
        set32(u32(p0 + (index << 2)), 0);
      return p0 | 0;
    },

    // 465: return the inline string bytes or the heap pointer when bit 7 of
    // the size byte is set. The result passes through a stack word.
    465: p0 => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      const data = (u8(u32(p0) + 11) >> 7) ? u32At(p0) : u32(p0);
      set32(frame + 8, data);
      const result = u32At(frame + 8);
      runtime.stackPointer.value = u32(frame + 16);
      return result | 0;
    },

    // 526: copy p2 dwords from p1 to p0, advancing both pointers.
    526: (p0, p1, p2) => {
      if (!p2) return;
      do {
        set32(p0, u32At(p1));
        p0 = u32(p0 + 4);
        p1 = u32(p1 + 4);
        p2 = (p2 - 1) | 0;
      } while (p2);
    },

    // 540: reverse the byte range [p0, p1); equal pointers are a no-op.
    540: (p0, p1) => {
      let left = u32(p0), right = u32(p1);
      if (left === right) return;
      for (;;) {
        right = u32(right - 1);
        if ((left >>> 0) >= (right >>> 0)) return;
        const byte = u8(left);
        set8(left, u8(right));
        set8(right, byte);
        left = u32(left + 1);
      }
    },

    // 644: the same reversal over dwords.
    644: (p0, p1) => {
      let left = u32(p0), right = u32(p1);
      if (left === right) return;
      for (;;) {
        right = u32(right - 4);
        if ((left >>> 0) >= (right >>> 0)) return;
        const word = u32At(left);
        set32(left, u32At(right));
        set32(right, word);
        left = u32(left + 4);
      }
    },

    // 894: count nonzero dwords before the first zero dword.
    894: p0 => {
      const start = u32(p0);
      let current = start, last = start;
      for (;;) {
        last = current;
        current = u32(current + 4);
        if (!u32At(last)) break;
      }
      return (last - start) >> 2;
    },

    // 920: parse decimal digits from a C string and advance *p0 past them.
    920: p0 => {
      let pointer = u32At(p0), value = 0;
      for (;;) {
        const character = i8(pointer);
        const digit = (character - 48) | 0;
        if ((digit >>> 0) >= 10) break;
        set32(p0, u32(pointer + 1));
        value = (Math.imul(value, 10) + character - 48) | 0;
        pointer = u32(pointer + 1);
      }
      return value;
    },

    // 1780: copy signed bytes, substituting p3 for negative values.
    1780: (p0, p1, p2, p3, p4) => {
      let source = u32(p1), destination = u32(p4);
      while (source !== u32(p2)) {
        const value = i8(source);
        set8(destination, value > -1 ? value : p3);
        destination = u32(destination + 1);
        source = u32(source + 1);
      }
      return p2 | 0;
    },

    // 1782: copy the byte range [p1, p2) to p4 and return p2.
    1782: (p0, p1, p2, p3) => {
      let source = u32(p1), destination = u32(p3);
      while (source !== u32(p2)) {
        set8(destination, u8(source));
        destination = u32(destination + 1);
        source = u32(source + 1);
      }
      return p2 | 0;
    },

    // 1791: sign-extend each byte in [p1, p2) into a dword at p3.
    1791: (p0, p1, p2, p3) => {
      let source = u32(p1), destination = u32(p3);
      while (source !== u32(p2)) {
        set32(destination, i8(source));
        destination = u32(destination + 4);
        source = u32(source + 1);
      }
      return p2 | 0;
    },
  };
}
