/** Recovered sp_server 128-bit multiplication (original function 50).
 *
 * Multiplies two unsigned 128-bit values given as (low, high) i64 pairs and
 * stores the low 128 bits of the product at the destination: low word first,
 * high word at +8. The original uses four 64-bit partial products; this is the
 * same modulo-2^128 product expressed with named limbs.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([50]);

export function createWideMultiplyHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 50: (aLow + aHigh*2^64) * (bLow + bHigh*2^64) mod 2^128. */
  function multiply128(destination, aLow, aHigh, bLow, bHigh) {
    try {
      const view = dataView();
      const product = BigInt.asUintN(128,
        BigInt.asUintN(64, aLow) * BigInt.asUintN(64, bLow)
        + ((BigInt.asUintN(64, aLow) * BigInt.asUintN(64, bHigh)
          + BigInt.asUintN(64, aHigh) * BigInt.asUintN(64, bLow)) << 64n));
      view.setBigUint64(destination >>> 0, product & 0xffffffffffffffffn, true);
      view.setBigUint64((destination + 8) >>> 0, product >> 64n, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({50: multiply128});
}
