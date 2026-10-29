/** Recovered client 128-bit soft-float comparison helpers (originals 563/811).
 *
 * `__float128` values are passed as a low/high pair of i64 words. 563 compares
 * two such values and returns -1/0/1; 811 compares one 128-bit value with a
 * 64-bit word and returns -1/0/1. Both return -1 (811) or 1 (563) for their
 * unordered/NaN cases, exactly as the shipped branches do. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([563, 811]);

const MASK = 0x7fffffffffffffffn;
const EXPONENT_ALL_ONES = 0x7fff000000000000n;
const SIGN = 0x8000000000000000n;
const asI64 = value => BigInt.asIntN(64, value);
const absHigh = value => value & MASK;
const isUnorderedWord = (low, high) => {
  const magnitude = absHigh(high);
  return magnitude > EXPONENT_ALL_ONES
    || (magnitude === EXPONENT_ALL_ONES && low !== 0n);
};

export function createSoftCompareHooks() {
  return {
    /** 563: lexicographic compare of two 128-bit values. */
    563: (lowA, highA, lowB, highB) => {
      if (isUnorderedWord(lowA, highA)) return 1;
      if (isUnorderedWord(lowB, highB)) return 1;
      if ((lowA | lowB | absHigh(highA) | absHigh(highB)) === 0n) return 0;

      if (asI64(highA & highB) >= 0n) {
        const highEqual = highA === highB;
        const less = highEqual ? lowA < lowB : asI64(highA) < asI64(highB);
        if (less) return -1;
        return ((lowA ^ lowB) | (highA ^ highB)) !== 0n ? 1 : 0;
      }

      const highEqual = highA === highB;
      const greater = highEqual ? lowA > lowB : asI64(highA) > asI64(highB);
      if (greater) return -1;
      return ((lowA ^ lowB) | (highA ^ highB)) !== 0n ? 1 : 0;
    },

    /** 811: compare a 128-bit value against a 64-bit word. */
    811: (low, high, other) => {
      const magnitude = absHigh(high);
      if (magnitude > EXPONENT_ALL_ONES
        || (magnitude === EXPONENT_ALL_ONES && low !== 0n)) return -1;
      if (absHigh(other) > EXPONENT_ALL_ONES) return -1;
      if ((low | magnitude | absHigh(other)) === 0n) return 0;

      if (asI64(high & other) >= 0n) {
        const highEqual = high === other;
        const less = highEqual ? false : asI64(high) < asI64(other);
        if (less) return -1;
        return (low | (high ^ other)) !== 0n ? 1 : 0;
      }

      const highEqual = high === other;
      const greater = highEqual ? low !== 0n : asI64(high) > asI64(other);
      if (greater) return -1;
      return (low | (high ^ other)) !== 0n ? 1 : 0;
    },
  };
}
