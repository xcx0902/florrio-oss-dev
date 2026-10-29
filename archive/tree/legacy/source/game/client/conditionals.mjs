/** Recovered client functions with one straight-line conditional and no calls.
 *
 * The bodies are table lookups, fixed object initialisers, descriptor updates
 * and unsigned min helpers. Memory accesses keep the WAT split between wrapped
 * pointer arithmetic and non-wrapping offset immediates.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([
  420, 488, 489, 592, 847, 1136, 1784, 1786, 1793, 1795, 1800, 1801, 2083,
]);

export function createConditionalHooks(runtime) {
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
  const u16 = address => access('getUint16', address, true);
  const u32At = address => access('getUint32', address, true);
  const set8 = (address, value) => access('setUint8', address, value);
  const set16 = (address, value) => access('setUint16', address, value, true);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const set64 = (address, value) => access('setBigUint64', address, value, true);
  const sign8 = value => (value << 24) >> 24;
  const init = (p0, vtable, halfword) => {
    set32(at(p0, 4), 0);
    set32(at(p0, 208), 0);
    set64(at(p0, 152), 0n);
    set64(at(p0, 96), 0n);
    set64(at(p0, 36), 4294967295n);
    set8(at(p0, 32), 0);
    set64(at(p0, 24), 0x0101000000000000n);
    if (halfword === 256) set16(at(p0, 212), 256);
    else set8(at(p0, 212), 0);
    set32(at(p0, 0), vtable);
    set32(at(p0, 160), 0);
    set32(at(p0, 104), 0);
    set64(at(p0, 44), 0n);
  };

  return {
    // 420 and 592 are the two fixed-layout descriptor initialisers. 420 writes
    // a halfword 256 at +212; 592 writes one zero byte there instead.
    420: p0 => init(p0, 33016, 256),
    592: p0 => init(p0, 33052, 0),

    // 488: swap a tagged pointer through the global at 133584. -1 is encoded
    // as the sentinel 7945660.
    488: (p0, p1) => {
      const old = u32At(133584);
      const value = u32At(at(p1, 0));
      if (value) set32(133584, value === 0xffffffff ? 7945660 : value);
      set32(at(p0, 0), old === 7945660 ? -1 : old);
      return p0 | 0;
    },

    // 489: publish a 64-bit cursor and recompute the current pointer at +104.
    489: (p0, p1) => {
      set64(at(p0, 112), BigInt.asUintN(64, p1));
      const end = u32At(at(p0, 8));
      const start = u32At(at(p0, 4));
      const span = BigInt((end - start) | 0);
      set64(at(p0, 120), BigInt.asUintN(64, span));
      const advanced = u32(start + Number(BigInt.asUintN(32, p1)));
      const within = BigInt.asIntN(64, p1) < span;
      const selected = within ? advanced : end;
      set32(at(p0, 104), p1 !== 0n ? selected : end);
    },

    // 847: the two candidates are 2147483647 and 1073741823; the unsigned
    // comparison always selects the latter. The frame writes remain visible.
    847: () => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      set32(at(frame, 12), 1073741823);
      set32(at(frame, 8), 2147483647);
      const first = at(frame, 8), second = at(frame, 12);
      const selected = u32At(first) < u32At(second) ? first : second;
      const result = u32At(selected);
      runtime.stackPointer.value = u32(frame + 16);
      return result | 0;
    },

    // 1136: update the hash field at p0+12 when p1 is nonzero.
    1136: (p0, p1) => {
      if (p1) {
        const value = u32At(at(p1, 16));
        set32(at(p0, 12), (value & 0x3fff) ^ (value >>> 14));
      }
    },

    // 1784/1786: map the low byte through one of two 256-entry tables when the
    // signed index is non-negative, then sign-extend the byte result.
    1784: (p0, p1) => {
      const selected = (p1 | 0) >= 0
        ? u32At(u32(((p1 & 255) << 2) + 123072))
        : (p1 | 0);
      return sign8(selected);
    },
    1786: (p0, p1) => {
      const selected = (p1 | 0) >= 0
        ? u32At(u32(((p1 & 255) << 2) + 124608))
        : (p1 | 0);
      return sign8(selected);
    },

    // 1793/1795: map a 7-bit code through one of two 128-entry tables.
    1793: (p0, p1) => ((p1 >>> 0) <= 127
      ? (u32At(u32((p1 << 2) + 123072)) | 0)
      : (p1 | 0)),
    1795: (p0, p1) => ((p1 >>> 0) <= 127
      ? (u32At(u32((p1 << 2) + 124608)) | 0)
      : (p1 | 0)),

    // 1800: test one bit from a 128-entry class table.
    1800: (p0, p1, p2) => {
      if ((p2 >>> 0) > 127) return 0;
      const mask = u16(u32((p2 << 1) + 122048));
      return ((mask & p1) !== 0) ? 1 : 0;
    },

    // 1801: return the unsigned minimum of (p3-p2) and p4. The two values pass
    // through a 16-byte stack frame and the selected slot is reloaded.
    1801: (p0, p1, p2, p3, p4) => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      set32(at(frame, 12), p4);
      set32(at(frame, 8), (p3 - p2) | 0);
      const first = at(frame, 8), second = at(frame, 12);
      const selected = u32At(first) < u32At(second) ? first : second;
      const result = u32At(selected);
      runtime.stackPointer.value = u32(frame + 16);
      return result | 0;
    },

    // 2083: zero the qword behind [p0+436] when the descriptor byte is 6.
    2083: (p0, p1) => {
      if (u8(at(p1, 12)) === 6) set64(at(u32At(at(p0, 436)), 0), 0n);
    },
  };
}
