/** Recovered client frexp (original function 922).
 *
 * Splits a double into a normalized fraction in [0.5, 1) and a power of two,
 * storing the exponent through the supplied pointer. This is the exact IEEE-754
 * decomposition used by the shipped binary, including subnormals, signed zero,
 * infinities and NaNs. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([922]);

const SIGN_MASK = 0x8000000000000000n;
const FRACTION_MASK = 0x000fffffffffffffn;
const HALF = 0x3fe0000000000000n;
const TWO_POW_64 = 18446744073709551616;

export function createFrexpHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function readBits(value) {
    const scratch = new DataView(new ArrayBuffer(8));
    scratch.setFloat64(0, value);
    return scratch.getBigUint64(0);
  }
  function fromBits(bits) {
    const scratch = new DataView(new ArrayBuffer(8));
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

  return {922: frexp};
}
