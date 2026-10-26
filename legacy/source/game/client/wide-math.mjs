/** Recovered 128-bit integer arithmetic from client.wasm.
 *
 * 434 is a 128x128 multiply returning the low 128 bits. 442 and 541 are the
 * left and right shifts over a low/high qword pair. BigInt makes the modulo-2
 * arithmetic explicit; WASM masks every shift count to six bits.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const MASK64 = (1n << 64n) - 1n;
const MASK128 = (1n << 128n) - 1n;
const u64 = value => BigInt.asUintN(64, value);
const shiftCount = value => Number(BigInt.asUintN(32, BigInt(value)) & 63n);

export const functionIds = Object.freeze([434, 442, 541]);

export function createWideMathHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function set64(address, value) {
    try {
      dataView().setBigUint64(address, BigInt.asUintN(64, value), true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function left128(p0, low, high, amount) {
    let lo = u64(low), hi = u64(high);
    if (amount & 64) {
      lo = 0n;
      hi = (u64(low) << BigInt(shiftCount(amount - 64))) & MASK64;
    } else if (amount !== 0) {
      const shift = shiftCount(amount);
      const inverse = shiftCount(64 - amount);
      hi = ((hi << BigInt(shift)) | (lo >> BigInt(inverse))) & MASK64;
      lo = (lo << BigInt(shift)) & MASK64;
    }
    set64(p0, lo);
    set64(p0 + 8, hi);
  }
  function right128(p0, low, high, amount) {
    let lo = u64(low), hi = u64(high);
    if (amount & 64) {
      lo = (u64(high) >> BigInt(shiftCount(amount - 64))) & MASK64;
      hi = 0n;
    } else if (amount !== 0) {
      const shift = shiftCount(amount);
      const inverse = shiftCount(64 - amount);
      lo = ((hi << BigInt(inverse)) | (lo >> BigInt(shift))) & MASK64;
      hi = (hi >> BigInt(shift)) & MASK64;
    }
    set64(p0, lo);
    set64(p0 + 8, hi);
  }

  return {
    // 434: multiply two 128-bit values and keep the low 128 bits. The high
    // qword is stored first, exactly as the native body does.
    434: (p0, lowA, highA, lowB, highB) => {
      const a = (u64(highA) << 64n) | u64(lowA);
      const b = (u64(highB) << 64n) | u64(lowB);
      const product = (a * b) & MASK128;
      set64(p0 + 8, product >> 64n);
      set64(p0, product & MASK64);
    },

    // 442: shift the 128-bit pair left. A 64-bit branch moves the low half into
    // the high half; otherwise the two halves exchange bits across the seam.
    442: (p0, low, high, amount) => left128(p0, low, high, amount),

    // 541: the matching logical right shift.
    541: (p0, low, high, amount) => right128(p0, low, high, amount),
  };
}
