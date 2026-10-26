/** Recovered sp_server frexp (original function 381).
 *
 * Splits a double into a normalized fraction in [0.5, 1) and a power of two,
 * storing the exponent through the supplied pointer. This is the server-side
 * counterpart of client 922 and follows IEEE-754 for normals, subnormals,
 * signed zero, infinities and NaNs.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([381]);
const SIGN_MASK = 0x8000000000000000n;
const FRACTION_MASK = 0x000fffffffffffffn;
const HALF = 0x3fe0000000000000n;
const TWO_POW_64 = 18446744073709551616;

export function createServerFrexpHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  const scratch = new DataView(new ArrayBuffer(8));
  function readBits(value) {
    scratch.setFloat64(0, value);
    return scratch.getBigUint64(0);
  }
  function fromBits(bits) {
    scratch.setBigUint64(0, BigInt.asUintN(64, bits));
    return scratch.getFloat64(0);
  }
  function storeExponent(address, exponent) {
    try {
      dataView().setInt32(address, exponent, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  /** Original 381: decompose value, write the exponent, return the fraction. */
  function frexp(value, exponentAddress) {
    const bits = readBits(value);
    const exponent = Number((bits >> 52n) & 0x7ffn);
    if (exponent === 0x7ff) return value;
    if (exponent === 0) {
      let adjustedExponent = 0;
      let fraction = value;
      if (value !== 0) {
        fraction = frexp(value * TWO_POW_64, exponentAddress);
        adjustedExponent = (dataView().getInt32(exponentAddress, true) - 64) | 0;
      }
      storeExponent(exponentAddress, adjustedExponent);
      return fraction;
    }
    storeExponent(exponentAddress, (exponent - 1022) | 0);
    return fromBits((bits & (SIGN_MASK | FRACTION_MASK)) | HALF);
  }

  return Object.freeze({381: frexp});
}
