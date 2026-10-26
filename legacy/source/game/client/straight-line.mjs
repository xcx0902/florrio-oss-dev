/** Recovered straight-line client functions without calls or branches.
 *
 * Every body is a complete replacement for one shipped WASM function. The
 * functions here construct small pairs, pack qwords, select values, compute a
 * component element address, align the C++ stack, or splice two linked nodes.
 * Function ids and line references come from reports/wasm/client-functions.json
 * and source/wasm/client.wat (SHA-256 d186265b...).
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;
const MASK48 = (1n << 48n) - 1n;

export const functionIds = Object.freeze([
  418, 889, 918, 1781, 1790, 2077, 2078, 3256, 3852,
]);

export function createStraightLineHooks(runtime) {
  function access(method, address, ...args) {
    try {
      return new DataView(runtime.memory.buffer)[method](address, ...args);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const u8 = address => access('getUint8', address);
  const u32At = address => access('getUint32', address, true);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const set64 = (address, value) => access('setBigUint64', address, value, true);

  return {
    // 418: build {first, *second} in p0, passing the first word through a
    // 16-byte stack frame. The scratch store remains visible after the frame
    // is released, so it is reproduced exactly.
    418: (p0, first, second) => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      set32(at(frame, 12), first);
      set32(at(p0, 0), u32At(at(frame, 12)));
      set32(at(p0, 4), u32At(at(second, 0)));
      runtime.stackPointer.value = u32(frame + 16);
      return p0;
    },

    // 889: the same pair constructor with a zero first word.
    889: (p0, second) => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      set32(at(frame, 12), 0);
      set32(at(p0, 0), u32At(at(frame, 12)));
      set32(at(p0, 4), u32At(at(second, 0)));
      runtime.stackPointer.value = u32(frame + 16);
      return p0;
    },

    // 918: store p1, then store the low 48 bits of p2 with bit 63 taken from
    // p4 and bits 48..62 taken from p2. The shift is logical over all 64 bits.
    918: (p0, p1, p2, p3, p4) => {
      set64(at(p0, 0), BigInt.asUintN(64, p1));
      const high = ((BigInt.asUintN(64, p4) >> 48n) & 0x8000n)
        | ((BigInt.asUintN(64, p2) >> 48n) & 0x7fffn);
      const value = (BigInt.asUintN(64, p2) & MASK48) | (high << 48n);
      set64(at(p0, 8), value);
    },

    // 1781: choose p1 when it is non-negative, otherwise p2.
    1781: (p0, p1, p2) => ((p1 | 0) > -1 ? (p1 | 0) : (p2 | 0)),

    // 1790: choose p1 when it is an unsigned byte below 128, otherwise p2,
    // then interpret the low byte as a signed value.
    1790: (p0, p1, p2) => {
      const selected = (p1 >>> 0) < 128 ? (p1 | 0) : (p2 | 0);
      return ((selected << 24) >> 24);
    },

    // 2077: load a component pointer from p0+436, select a word from either
    // p1+76 or component+4, and store that word at the component pointer.
    2077: (p0, p1) => {
      const component = u32At(at(p0, 436));
      const source = p1 ? u32(p1 + 76) : u32(component + 4);
      set32(component, u32At(source));
      return 0;
    },

    // 2078: compute one component element address and also publish the
    // component stride through p4. All index arithmetic wraps as i32.
    2078: (p0, p1, p2, p3, p4) => {
      const component = u32At(at(p1, 76));
      const base = u32At(at(component, 20));
      const stride = u32At(at(component, 16));
      const index = u32At(at(p2, 4));
      const count = u32At(at(p2, 0));
      const meta = u32At(at(component, 4));
      const scale = u8(at(meta, 9));
      const address = (u32(base + Math.imul(stride, index))
        + Math.imul(count, scale)) | 0;
      set32(p3, address);
      set32(p4, stride);
      return 0;
    },

    // 3256: reserve p0 bytes and return the new 16-byte-aligned stack pointer.
    // The caller is responsible for restoring the old pointer.
    3256: p0 => {
      const frame = ((runtime.stackPointer.value - (p0 | 0)) & -16) | 0;
      runtime.stackPointer.value = frame;
      return frame;
    },

    // 3852: initialise a node descriptor at p0 and splice the node at p0+28
    // before the node at p0+32. The second pointer is reloaded after the first
    // store because an overlapping destination may change it.
    3852: p0 => {
      set32(at(p0, 0), 33508);
      const first = u32At(at(p0, 28));
      set32(at(first, 8), u32At(at(p0, 32)));
      set32(at(u32At(at(p0, 32)), 4), first);
      return p0;
    },
  };
}
