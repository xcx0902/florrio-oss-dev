/** Recovered client five-window validity check (original function 2058).
 *
 * The high nibbles of the packed argument become four window values. For small
 * arguments whose bit in 23 is set, the values instead come from four static
 * tables indexed by the argument shifted left twice. The function returns
 * whether all five windows fall inside the valid ranges. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([2058]);

export function createWindowCheckHooks(runtime) {
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
  const u32At = address => access('getUint32', address, true);

  return {
    2058: (ignored, p1) => {
      const packed = u32(p1);
      let l2, l3, l4, l5, l6, first;
      if (packed <= 4) {
        const bit = (23 >>> packed) & 1;
        if (bit) {
          const offset = u32(packed << 2);
          l2 = u32At(u32(114908 + offset));
          l3 = u32At(u32(114868 + offset));
          l4 = u32At(u32(114888 + offset));
          l5 = u32At(u32(114848 + offset));
          first = 0;
          l6 = 1;
        } else {
          l2 = (packed >>> 24) & 15;
          l3 = (packed >>> 8) & 15;
          l4 = (packed >>> 20) & 15;
          l5 = (packed >>> 4) & 15;
          first = ((packed & 15) - 1) | 0;
          l6 = (u32(((packed >>> 16) & 15) - 1) < 3) ? 1 : 0;
        }
      } else {
        l2 = (packed >>> 24) & 15;
        l3 = (packed >>> 8) & 15;
        l4 = (packed >>> 20) & 15;
        l5 = (packed >>> 4) & 15;
        first = ((packed & 15) - 1) | 0;
        l6 = (u32(((packed >>> 16) & 15) - 1) < 3) ? 1 : 0;
      }
      const a = (u32(l5 - 1) < 10) ? 1 : 0;
      const b = (u32(l4 - 1) < 10) ? 1 : 0;
      const c = (u32(first) < 3) ? 1 : 0;
      const d = (u32(l3 - 1) < 10) ? 1 : 0;
      const e = (u32(l2 - 1) < 10) ? 1 : 0;
      return (a & b & c & d & e & l6) | 0;
    },
  };
}
