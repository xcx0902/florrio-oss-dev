/** Recovered sp_server scalar helpers (original functions 305, 307, 358, 377).
 *
 * These are small compiler-runtime utilities: the allocator's maximum object
 * size, the generic "invalid" sentinel, a width-dispatched integer store and a
 * normalising 128-bit store that folds a sign bit into the high word.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([305, 307, 358, 377]);
const MAXIMUM_OBJECT_SIZE = 0x3fffffff;
const INVALID_SENTINEL = -1;

export function createScalarHelperHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function fault(error) {
    if (error instanceof RangeError)
      return new WebAssembly.RuntimeError('memory access out of bounds');
    throw error;
  }

  /** Original 305: largest object size the allocator accepts. */
  function maximumObjectSize() {
    return MAXIMUM_OBJECT_SIZE;
  }

  /** Original 307: generic invalid-index/result sentinel. */
  function invalidSentinel(_first, _second, _third) {
    return INVALID_SENTINEL;
  }

  /** Original 358: store an i64 using a size-encoding discriminant. */
  function storeScalarByEncoding(pointer, encoding, value) {
    try {
      const view = dataView();
      switch (encoding) {
        case -2: view.setUint8(pointer >>> 0, Number(value & 0xffn)); break;
        case -1: view.setUint16(pointer >>> 0, Number(value & 0xffffn), true); break;
        case 0:
        case 1: view.setUint32(pointer >>> 0, Number(value & 0xffffffffn), true); break;
        case 3: view.setBigUint64(pointer >>> 0, BigInt.asUintN(64, value), true); break;
        default: break;
      }
    } catch (error) { throw fault(error); }
  }

  /** Original 377: store a 128-bit pair, folding the source sign into word 1. */
  function storeNormalisedPair(pointer, first, second, third, fourth) {
    try {
      const view = dataView();
      const address = pointer >>> 0;
      view.setBigUint64(address, BigInt.asUintN(64, first), true);
      const high = BigInt.asUintN(64, second);
      const sourceHigh = BigInt.asUintN(64, fourth);
      const folded = ((sourceHigh >> 48n) & 0x8000n)
        | ((high >> 48n) & 0x7fffn);
      const merged = (high & 0xffffffffffffn) | (folded << 48n);
      view.setBigUint64(address + 8, merged, true);
    } catch (error) { throw fault(error); }
  }

  return Object.freeze({
    305: maximumObjectSize,
    307: invalidSentinel,
    358: storeScalarByEncoding,
    377: storeNormalisedPair,
  });
}
