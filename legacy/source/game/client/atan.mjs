/** Recovered client double-precision arctangent (original 933).
 *
 * Four range-reduction intervals feed two Horner polynomials in x^2, then a
 * four-entry atan(hi)/atan(lo) table restores the angle. Double arithmetic is
 * IEEE-754 exact in JS, so no rounding helper is needed. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([933]);

const ATAN_HI = Object.freeze([
  0.4636476090008061,
  0.7853981633974483,
  0.982793723247329,
  1.5707963267948966,
]);
const ATAN_LO = Object.freeze([
  2.2698777452961687e-17,
  3.061616997868383e-17,
  1.3903311031230998e-17,
  6.123233995736766e-17,
]);
const P = Object.freeze([
  -0.036531572744216916,
  -0.058335701337905735,
  -0.0769187620504483,
  -0.11111110405462356,
  -0.19999999999876483,
]);
const Q = Object.freeze([
  0.016285820115365782,
  0.049768779946159324,
  0.06661073137387531,
  0.09090887133436507,
  0.14285714272503466,
  0.3333333333333293,
]);

const bitsScratch = new DataView(new ArrayBuffer(8));
const f64bits = value => {
  bitsScratch.setFloat64(0, value, true);
  return bitsScratch.getBigUint64(0, true);
};

export function createAtanHooks() {
  return {
    933: input => {
      const value = input;
      const bits = f64bits(value);
      const ix = Number((bits >> 32n) & 0x7fffffffn) >>> 0;
      if (ix > 0x440fffff) {
        if ((bits & 0x7fffffffffffffffn) > 0x7ff0000000000000n) return value;
        return (bits & 0x8000000000000000n) ? -Math.PI / 2 : Math.PI / 2;
      }

      let x, index, direct;
      if (ix <= 0x3fdbffff) {
        if (ix < 0x3e400000) return value;
        x = value;
        index = -1;
        direct = 1;
      } else {
        x = Math.abs(value);
        direct = 0;
        if (ix <= 0x3ff2ffff) {
          if (ix <= 0x3fe5ffff) {
            x = (x + x - 1) / (x + 2);
            index = 0;
          } else {
            index = 1;
            x = (x - 1) / (x + 1);
          }
        } else if (ix <= 0x40037fff) {
          index = 2;
          x = (x - 1.5) / (1.5 * x + 1);
        } else {
          index = 3;
          x = -1 / x;
        }
      }

      const xx = x * x;
      const x4 = xx * xx;
      const high = x4 * ((((x4 * P[0] + P[1]) * x4 + P[2]) * x4 + P[3]) * x4 + P[4]);
      const low = xx * (((((x4 * Q[0] + Q[1]) * x4 + Q[2]) * x4 + Q[3]) * x4 + Q[4]) * x4 + Q[5]);
      const sum = high + low;
      if (direct) return x - x * sum;

      const correction = (x * sum - ATAN_LO[index]) - x;
      const result = ATAN_HI[index] - correction;
      return (bits & 0x8000000000000000n) ? -result : result;
    },
  };
}
