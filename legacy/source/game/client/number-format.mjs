/** Recovered client numeric formatting, parser-state and record helpers (no calls).
 *
 * 2018 scales two f32 fields into saturating i32 outputs. 848 resizes a dword
 * vector. 2061 selects a pixel-format component count and writes a sample
 * offset. 570 formats an unsigned 64-bit integer backwards in decimal. 524
 * copies a prefix string and appends a conversion letter. 712 updates parser
 * state flags. 571 compares two packed record keys field by field.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([2018, 848, 2061, 570, 524, 712, 571]);

export function createNumberFormatHooks(runtime) {
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
  const f32At = address => access('getFloat32', address, true);
  const u32At = address => access('getUint32', address, true);
  const set8 = (address, value) => access('setUint8', address, value);
  const set32 = (address, value) => access('setUint32', address, value, true);

  const scaled = (object, field, scale) => {
    const product = Math.fround(f32At(at(object, 16)) * Math.fround(u32At(at(field, scale)) | 0));
    return Math.abs(product) < 2147483648 ? Math.trunc(product) | 0 : -2147483648;
  };

  return {
    // 2018: write two saturating fixed-point products.
    2018: (p0, p1, p2, p3) => {
      const object = u32At(at(p1, 144));
      if (object === 0) return;
      if (p2) set32(p2, scaled(object, p1, 24));
      if (p3) set32(p3, scaled(object, p1, 28));
    },

    // 848: zero count dwords and publish the new end pointer.
    848: p0 => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      set32(frame, 7947488);
      const begin = u32At(7947492);
      set32(at(frame, 4), begin);
      set32(at(frame, 8), u32(begin + (p0 << 2)));
      let cursor = u32At(at(frame, 4));
      const limit = u32At(at(frame, 8));
      while (cursor !== limit) {
        set32(cursor, 0);
        set32(at(frame, 4), u32(cursor + 4));
        cursor = u32(cursor + 4);
      }
      set32(at(u32At(frame), 4), u32At(at(frame, 4)));
      runtime.stackPointer.value = u32(frame + 16);
    },

    // 2061: select a component count from the tag and emit a sample offset.
    2061: (p0, p1, p2, p3, p4) => {
      const first = u32At(p2);
      const second = u32At(at(p2, 4));
      const object = u32At(at(p1, 76));
      const stride = u32At(at(object, 20));
      const base = u32At(at(object, 16));
      const tag = u32At(at(p1, 4));
      let components;
      if (tag === 0 || (tag & 0xf0000000) === 0x10000000) components = tag & 255;
      else if (tag === 844715353 || tag === 1498831189 || tag === 1431918169) components = 2;
      else components = 1;
      set32(p3, (base + Math.imul(stride, second) + Math.imul(components, first)) | 0);
      set32(p4, stride);
      return 0;
    },

    // 570: decimal formatting of a u64, written backwards.
    570: (p0, p1) => {
      let value = BigInt.asUintN(64, BigInt(p0));
      let cursor = u32(p1);
      if (value >= 0x100000000n) {
        for (;;) {
          cursor = u32(cursor - 1);
          const quotient = value / 10n;
          set8(cursor, Number(value - quotient * 10n) | 48);
          const more = value > 42949672959n;
          value = quotient;
          if (!more) break;
        }
      }
      while (value !== 0n) {
        cursor = u32(cursor - 1);
        const quotient = value / 10n;
        set8(cursor, Number(value - quotient * 10n) | 48);
        const more = value > 9n;
        value = quotient;
        if (!more) break;
      }
      return cursor | 0;
    },

    // 524: optional '+'/'#' prefix, source copy, then the conversion letter.
    524: (p0, p1, p2, p3) => {
      let cursor = u32(p0);
      if (p3 & 2048) {
        set8(cursor, 43);
        cursor = u32(cursor + 1);
      }
      if (p3 & 512) {
        set8(cursor, 35);
        cursor = u32(cursor + 1);
      }
      for (;;) {
        const value = u8(p1);
        if (value === 0) break;
        set8(cursor, value);
        cursor = u32(cursor + 1);
        p1 = u32(p1 + 1);
      }
      const conversion = p3 & 74;
      let letter;
      if (conversion === 64) letter = 111;
      else if (conversion === 8) letter = p3 & 16384 ? 88 : 120;
      else letter = p2 ? 100 : 117;
      set8(cursor, letter);
    },

    // 712: set state flags and update one of three parser transitions.
    712: (p0, p1, p2, p3) => {
      set8(at(p0, 53), 1);
      if (u32At(at(p0, 4)) !== u32(p2)) return;
      set8(at(p0, 52), 1);
      const existing = u32At(at(p0, 16));
      if (existing === 0) {
        set32(at(p0, 36), 1);
        set32(at(p0, 24), p3);
        set32(at(p0, 16), p1);
        if (u32At(at(p0, 48)) !== 1 || u32(p3) !== 1) return;
        set8(at(p0, 54), 1);
        return;
      }
      if (u32(p1) === existing) {
        let state = u32At(at(p0, 24));
        if (state === 2) {
          set32(at(p0, 24), p3);
          state = u32(p3);
        }
        if (u32At(at(p0, 48)) !== 1 || state !== 1) return;
        set8(at(p0, 54), 1);
        return;
      }
      set32(at(p0, 36), u32(u32At(at(p0, 36)) + 1));
      set8(at(p0, 54), 1);
    },

    // 571: field-wise packed record comparison.
    571: (p0, p1) => {
      if (u32(p0) === u32(p1)) return 0;
      let a = u32At(at(p1, 4)), b = u32At(at(p0, 4));
      if (a !== b) return (a - b) | 0;
      a = u32At(at(p1, 8)); b = u32At(at(p0, 8));
      if (a !== b) return (a - b) | 0;
      const keyA = u32At(p1), keyB = u32At(p0);
      a = (keyA >>> 8) & 255; b = (keyB >>> 8) & 255;
      if (a !== b) return (a - b) | 0;
      a = (keyA >>> 16) & 15; b = (keyB >>> 16) & 15;
      if (a !== b) return (a - b) | 0;
      const tailA = u32At(at(p1, 12)), tailB = u32At(at(p0, 12));
      return tailA !== tailB ? (tailA - tailB) | 0 : 0;
    },
  };
}
