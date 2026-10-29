/** Recovered sp_server arctangent (original function 383).
 *
 * A four-interval fdlibm-style atan: small arguments return unchanged, the
 * medium range uses the odd polynomial directly, and larger arguments are
 * reduced by one of four tangent-subtraction identities before evaluating the
 * shared odd polynomial and adding a stored high/low arctangent pair.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([383]);

const LARGE_ARGUMENT_HIGH = 0x44100000;   // |x| >= 2^66
const SMALL_ARGUMENT_HIGH = 0x3e400000;   // |x| < 2^-27
const MEDIUM_ARGUMENT_HIGH = 0x3fdc0000;  // |x| < 0.4375
const UPPER_HALF_HIGH = 0x3fe60000;       // |x| < 0.6875
const ONE_AND_THREE_SIXTEENTHS_HIGH = 0x3ff30000; // |x| < 1.1875
const TWO_AND_THREE_SIXTEENTHS_HIGH = 0x40038000; // |x| < 2.21875

const HALF_PI = 1.5707963267948966;
const NEGATIVE_COEFFICIENTS = Object.freeze([
  -0.036531572744216916,
  -0.058335701337905735,
  -0.0769187620504483,
  -0.11111110405462356,
  -0.19999999999876483,
]);
const POSITIVE_COEFFICIENTS = Object.freeze([
  0.016285820115365782,
  0.049768779946159324,
  0.06661073137387531,
  0.09090887133436507,
  0.14285714272503466,
  0.3333333333333293,
]);
const ATAN_HIGH = Object.freeze([
  0.463647609000806093515,
  0.785398163397448278999,
  0.982793723247329054082,
  1.570796326794896558,
]);
const ATAN_LOW = Object.freeze([
  2.26987774529616870924e-17,
  3.06161699786838301793e-17,
  1.39033110312309984516e-17,
  6.12323399573676603587e-17,
]);

export function createAtanHook(_runtime) {
  /** Original 383: arctangent in radians. */
  function atan(x) {
    const raw = new DataView(new ArrayBuffer(8));
    raw.setFloat64(0, x, false);
    const bits = raw.getBigUint64(0, false);
    const absoluteBits = bits & 0x7fffffffffffffffn;
    const high = Number((absoluteBits >> 32n) & 0xffffffffn) >>> 0;

    if (high >= LARGE_ARGUMENT_HIGH) {
      if (absoluteBits > 0x7ff0000000000000n) return x;
      return x < 0 ? -HALF_PI : HALF_PI;
    }
    if (high < MEDIUM_ARGUMENT_HIGH) {
      if (high < SMALL_ARGUMENT_HIGH) return x;
      return mediumRangeAtan(x);
    }

    const magnitude = x < 0 ? -x : x;
    let reduced;
    let interval;
    if (high < UPPER_HALF_HIGH) {
      interval = 0;
      reduced = (magnitude + magnitude - 1) / (magnitude + 2);
    } else if (high < ONE_AND_THREE_SIXTEENTHS_HIGH) {
      interval = 1;
      reduced = (magnitude - 1) / (magnitude + 1);
    } else if (high < TWO_AND_THREE_SIXTEENTHS_HIGH) {
      interval = 2;
      reduced = (magnitude - 1.5) / (magnitude * 1.5 + 1);
    } else {
      interval = 3;
      reduced = -1 / magnitude;
    }
    const correction = oddPolynomial(reduced);
    const result = ATAN_HIGH[interval]
      - ((correction - ATAN_LOW[interval]) - reduced);
    return (bits & 0x8000000000000000n) !== 0n ? -result : result;
  }

  function mediumRangeAtan(x) {
    const correction = oddPolynomial(x);
    return x - correction;
  }

  function oddPolynomial(x) {
    const z = x * x;
    const w = z * z;
    const [c0, c1, c2, c3, c4] = NEGATIVE_COEFFICIENTS;
    const [p0, p1, p2, p3, p4, p5] = POSITIVE_COEFFICIENTS;
    const negativeSeries = w * (w * (w * (w * (w * c0 + c1) + c2) + c3) + c4);
    const positiveSeries = z
      * (w * (w * (w * (w * (w * p0 + p1) + p2) + p3) + p4) + p5);
    return x * (negativeSeries + positiveSeries);
  }

  return Object.freeze({383: atan});
}
