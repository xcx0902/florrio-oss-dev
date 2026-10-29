/** Recovered sp_server scalbn (original function 107).
 *
 * Multiplies x by 2^n with two-step clamping for extreme exponents, then
 * applies the remaining exponent through an exact IEEE-754 exponent word.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([107]);
const SCALE_UP = 2 ** 1023;
const SCALE_DOWN = 2 ** -1022;

export function createScalbnHook(_runtime) {
  /** Original 107: x * 2^exponent with the shipped clamping sequence. */
  function scalbn(x, exponent) {
    let value = x;
    let remaining = exponent | 0;
    if (remaining >= 1024) {
      value *= SCALE_UP;
      if (remaining < 2047) {
        remaining -= 1023;
      } else {
        value *= SCALE_UP;
        remaining = (remaining < 3069 ? remaining : 3069) - 2046;
      }
    } else if (remaining <= -1023) {
      value *= SCALE_DOWN;
      if (remaining > -2045) {
        remaining += 1022;
      } else {
        value *= SCALE_DOWN;
        remaining = (remaining > -3066 ? remaining : -3066) + 2044;
      }
    }
    const exponentWord = BigInt((remaining + 1023) >>> 0) << 52n;
    const factor = new DataView(new ArrayBuffer(8));
    factor.setBigUint64(0, exponentWord, true);
    return value * factor.getFloat64(0, true);
  }

  return Object.freeze({107: scalbn});
}
