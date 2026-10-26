/** Recovered sp_server sine-with-offset kernel (original function 154).
 *
 * The zero-flag path evaluates the libm sine polynomial in x and returns
 * `x + x³·(x²·p(x²) − 1/6)`. The non-zero path evaluates the same sine and
 * adds a second-order offset term in y:
 *
 *   sin(x) + y·(1 − x²/2)
 *
 * expanded in the original operation order as
 * `x − ((x²·(y/2 − x³·p(x²)) − y) + x³/6)`. Coefficients and the association
 * of every f64 operation match the shipped kernel, including the opposite sign
 * of the 1/6 term in the two paths.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([154]);

/** Minimax sine coefficients, highest power first. */
const SINE_X2_COEFFICIENT = 1.58969099521155e-10;
const SINE_X6_COEFFICIENT = -2.5050760253406863e-08;
const SINE_X4_COEFFICIENT = 2.7557313707070068e-06;
const SINE_X2_LOW_COEFFICIENT = -0.0001984126982985795;
const SINE_X2_HIGH_COEFFICIENT = 0.00833333333332249;
const SINE_CORRECTION = -0.16666666666666632;
const OFFSET_CORRECTION = 0.16666666666666632;

export function createSineOffsetHook(_runtime) {
  /** Shared sine polynomial p(x²) used by both paths. */
  function sinePolynomial(x2, x6) {
    return x6 * (x2 * SINE_X2_COEFFICIENT + SINE_X6_COEFFICIENT)
      + (x2 * (x2 * SINE_X4_COEFFICIENT + SINE_X2_LOW_COEFFICIENT)
        + SINE_X2_HIGH_COEFFICIENT);
  }

  /** Original 154: sine of x, plus a quadratic offset in y when requested. */
  function sineWithSecondOrderOffset(x, y, offsetEnabled) {
    const x2 = x * x;
    const x3 = x2 * x;
    const x6 = x2 * x2 * x2;
    const polynomial = sinePolynomial(x2, x6);
    if (offsetEnabled === 0) {
      return x + x3 * (x2 * polynomial + SINE_CORRECTION);
    }
    const adjusted = x2 * (0.5 * y - x3 * polynomial);
    return x - ((adjusted - y) + x3 * OFFSET_CORRECTION);
  }

  return Object.freeze({154: sineWithSecondOrderOffset});
}
