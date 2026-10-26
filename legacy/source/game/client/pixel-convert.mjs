/** Recovered client masked-table pixel converter (original function 2288).
 *
 * For every source word it combines the low bits with the high half, looks up
 * three table bytes through masks at descriptor +4/+8/+12, shifts each lookup
 * into its destination field, then folds in the alpha byte. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([2288]);

export function createPixelConvertHooks(runtime) {
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
  const u32At = address => access('getUint32', address, true);
  const set32 = (address, value) => access('setUint32', address, value, true);

  return {
    2288: (p0, p1, p2, p3, p4) => {
      const count = p2 | 0;
      if (count < 1) return (count * 4) | 0;
      const tableThird = u32At(u32(104976 + u8(at(p3, 22)) * 4));
      const tableFirst = u32At(u32(104976 + u8(at(p3, 21)) * 4));
      const tableSecond = u32At(u32(104976 + u8(at(p3, 20)) * 4));
      const alphaLeft = u8(at(p4, 35));
      const alphaRight = u8(at(p4, 31));
      const thirdLeft = u8(at(p4, 34));
      const thirdRight = u8(at(p4, 30));
      const firstLeft = u8(at(p4, 33));
      const firstRight = u8(at(p4, 29));
      const secondLeft = u8(at(p4, 32));
      const secondRight = u8(at(p4, 28));
      const thirdMaskShift = u8(at(p3, 26));
      const firstMaskShift = u8(at(p3, 25));
      const secondMaskShift = u8(at(p3, 24));
      const secondMask = u32At(at(p3, 4));
      const firstMask = u32At(at(p3, 8));
      const thirdMask = u32At(at(p3, 12));
      let destination = u32(p0), source = u32(p1), index = 0;
      do {
        const word = u32At(source);
        const mixed = u32((word & 0xfffffc1f) | (word >>> 16));
        const first = (u8(u32(tableFirst
          + u32((firstMask & mixed) >>> firstMaskShift))) >>> firstRight) << firstLeft;
        const second = (u8(u32(tableSecond
          + u32((secondMask & mixed) >>> secondMaskShift))) >>> secondRight) << secondLeft;
        const third = (u8(u32(tableThird
          + u32((thirdMask & mixed) >>> thirdMaskShift))) >>> thirdRight) << thirdLeft;
        const alpha = (((word >>> 2) & 248) >>> alphaRight) << alphaLeft;
        set32(destination, u32(first | second | third | alpha));
        destination = u32(destination + 4);
        source = u32(source + 4);
        index = (index + 1) | 0;
      } while (index !== count);
      return (count * 4) | 0;
    },
  };
}
