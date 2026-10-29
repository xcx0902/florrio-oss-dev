/** Recovered client 64-bit shift helpers 648 and 650 (no calls).
 *
 * Both functions shift the little-endian 64-bit pair at p0 by p1 bits. The
 * original splits the count at 32 and writes both words unconditionally. Shift
 * counts are masked to five bits inside each branch; the count-zero row keeps
 * the words unchanged for 648 and duplicates the high word for 650, which is
 * the observed native behavior and is preserved explicitly.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([648, 650]);

export function createShiftHooks(runtime) {
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
  const set32 = (address, value) => access('setUint32', address, value, true);

  return {
    // 648: left shift of the low/high pair.
    648: (p0, p1) => {
      const low = u32At(at(p0, 0));
      const high = u32At(at(p0, 4));
      const count = u32(p1);
      if (count === 0) {
        set32(at(p0, 0), low);
        set32(at(p0, 4), high);
        return;
      }
      if (count < 32) {
        set32(at(p0, 0), low << count);
        set32(at(p0, 4), (high << count) | (low >>> (32 - count)));
        return;
      }
      const shifted = (count - 32) & 31;
      set32(at(p0, 0), 0);
      set32(at(p0, 4), low << shifted);
    },

    // 650: right shift of the low/high pair.
    650: (p0, p1) => {
      const low = u32At(at(p0, 0));
      const high = u32At(at(p0, 4));
      const count = u32(p1);
      if (count === 0) {
        set32(at(p0, 0), high);
        set32(at(p0, 4), high);
        return;
      }
      if (count < 32) {
        set32(at(p0, 4), high >>> count);
        set32(at(p0, 0), (high << (32 - count)) | (low >>> count));
        return;
      }
      const shifted = (count - 32) & 31;
      set32(at(p0, 4), 0);
      set32(at(p0, 0), high >>> shifted);
    },
  };
}
