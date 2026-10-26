/** Recovered sp_server 128-bit logical right shift (original function 122).
 *
 * Shifts the unsigned 128-bit value `high:low` right by the low seven bits of
 * the count and writes the result through the output pointer. WebAssembly shift
 * counts are modulo 64, which the original inherits from hardware `shr`; the
 * recovered code normalises counts the same way.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([55, 122]);
const MASK_64 = 0xffffffffffffffffn;

export function createWideShiftHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 122: logical right shift of a 128-bit integer. */
  function shiftRight128(output, lowWord, highWord, count) {
    let low = BigInt.asUintN(64, lowWord);
    let high = BigInt.asUintN(64, highWord);
    if ((count & 64) !== 0) {
      low = high >> BigInt(count & 63);
      high = 0n;
    } else if (count !== 0) {
      const shift = BigInt(count & 63);
      const complement = BigInt((64 - (count & 63)) & 63);
      low = ((low >> shift) | (high << complement)) & MASK_64;
      high = high >> shift;
    }
    try {
      dataView().setBigUint64(output >>> 0, low, true);
      dataView().setBigUint64((output + 8) >>> 0, high, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  /** Original 55: logical left shift of a 128-bit integer. */
  function shiftLeft128(output, lowWord, highWord, count) {
    let low = BigInt.asUintN(64, lowWord);
    let high = BigInt.asUintN(64, highWord);
    if ((count & 64) !== 0) {
      high = low << BigInt(count & 63);
      low = 0n;
    } else if (count !== 0) {
      const shift = BigInt(count & 63);
      const complement = BigInt((64 - (count & 63)) & 63);
      high = ((high << shift) | (low >> complement)) & MASK_64;
      low = (low << shift) & MASK_64;
    }
    try {
      dataView().setBigUint64(output >>> 0, low, true);
      dataView().setBigUint64((output + 8) >>> 0, high, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({55: shiftLeft128, 122: shiftRight128});
}
