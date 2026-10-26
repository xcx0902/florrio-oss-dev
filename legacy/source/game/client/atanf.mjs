/** Recovered client single-precision arctangent (original 932).
 *
 * This is the classic four-interval range reduction: tiny inputs return
 * themselves, [2^-14,7/16) use the odd polynomial directly, and larger inputs
 * reduce through (x-1)/(x+1), (x-1.5)/(1.5x+1) or -1/x. The reduced value is
 * evaluated with a degree-9 odd polynomial and combined with a four-entry
 * atan(hi)/atan(lo) table. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([932]);

const ATAN_HI = Object.freeze([
  0.46364760398864746,
  0.7853981256484985,
  0.9827936887741089,
  1.570796251296997,
]);
const ATAN_LO = Object.freeze([
  5.01215824399992e-9,
  3.774894707930798e-8,
  3.447321716976148e-8,
  7.549789415861596e-8,
]);
const C1 = -0.106480173766613;
const C2 = -0.19999158382415771;
const C3 = 0.06168760731816292;
const C4 = 0.14253635704517365;
const C5 = 0.333333283662796;

const bitsScratch = new DataView(new ArrayBuffer(4));
const f32bits = value => {
  bitsScratch.setFloat32(0, value, true);
  return bitsScratch.getUint32(0, true);
};

export function createAtanfHooks() {
  return {
    932: input => {
      const value = Math.fround(input);
      const bits = f32bits(value);
      const ix = (bits & 0x7fffffff) >>> 0;
      if (ix > 0x4c7fffff) {
        if (ix > 0x7f800000) return value;
        const halfPi = 1.570796251296997;
        return (bits & 0x80000000) ? -halfPi : halfPi;
      }

      let x, index, direct;
      if (ix <= 0x3edfffff) {
        if (ix < 0x39800000) return value;
        x = value;
        index = -1;
        direct = 1;
      } else {
        x = Math.abs(value);
        direct = 0;
        if (ix <= 0x3f2fffff) {
          x = Math.fround(Math.fround(Math.fround(2 * x) - 1) / Math.fround(x + 2));
          index = 0;
        } else if (ix <= 0x3f97ffff) {
          index = 1;
          x = Math.fround(Math.fround(x - 1) / Math.fround(x + 1));
        } else if (ix <= 0x401bffff) {
          index = 2;
          x = Math.fround(Math.fround(x - 1.5)
            / Math.fround(Math.fround(1.5 * x) + 1));
        } else {
          index = 3;
          x = Math.fround(-1 / x);
        }
      }

      const xx = Math.fround(x * x);
      const x4 = Math.fround(xx * xx);
      const high = Math.fround(x4 * Math.fround(Math.fround(x4 * C1) + C2));
      const low = Math.fround(xx * Math.fround(
        Math.fround(x4 * Math.fround(Math.fround(x4 * C3) + C4)) + C5));
      const sum = Math.fround(high + low);
      if (direct) return Math.fround(x - Math.fround(x * sum));

      const correction = Math.fround(
        Math.fround(Math.fround(x * sum) - ATAN_LO[index]) - x);
      const result = Math.fround(ATAN_HI[index] - correction);
      return (bits & 0x80000000) ? -result : result;
    },
  };
}
