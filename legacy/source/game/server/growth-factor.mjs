/** Recovered sp_server integer-exponent growth factor (original function 262).
 *
 * Raises the server's 1.06 progression constant to an integer exponent by
 * repeated squaring. Negative exponents return the reciprocal. The exponent is
 * treated as a signed i32; the shipped loop uses unsigned comparisons for its
 * termination test.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([262]);
const GROWTH = 1.06;

export function createGrowthFactorHook(_runtime) {
  /** Original 262: 1.06 ** exponent for an integer exponent. */
  function growthFactor(exponent) {
    let result = (exponent & 1) === 1 ? GROWTH : 1;
    if (((exponent + 1) >>> 0) >= 3) {
      let remaining = exponent;
      let power = GROWTH;
      for (;;) {
        power *= power;
        if ((((remaining / 2) | 0) & 1) === 1) result *= power;
        remaining = (remaining / 2) | 0;
        if (((remaining + 1) >>> 0) <= 2) break;
      }
    }
    return exponent < 0 ? 1 / result : result;
  }
  return Object.freeze({262: growthFactor});
}
