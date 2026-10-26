/** Recovered sp_server wide floating-point comparison (original 129).
 *
 * Compares two sign/exponent/significand pairs (p0,p1) and (p2,p3). Values
 * whose high word exceeds the x87 infinity pattern 0x7fff800000000000 are
 * unordered and return 1; the all-zero pair compares equal. When the sign bits
 * agree the comparison is lexicographic (low word unsigned when the high words
 * match, otherwise high word signed); opposite signs use the mirrored test.
 * The result is -1 for the first ordering, 1 when the operands differ, and 0
 * when equal.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([129]);
const HIGH_MASK = 0x7fffffffffffffffn;
const INFINITY_PATTERN = 9223090561878065152n;

export function createWideFloatCompareHook() {
  return Object.freeze({
    129(p0, p1, p2, p3) {
      const lowA = BigInt.asUintN(64, p0);
      const highA = BigInt.asUintN(64, p1);
      const lowB = BigInt.asUintN(64, p2);
      const highB = BigInt.asUintN(64, p3);
      const magnitudeA = highA & HIGH_MASK;
      const magnitudeB = highB & HIGH_MASK;

      function unordered(low, magnitude) {
        return magnitude > INFINITY_PATTERN
          || (magnitude === INFINITY_PATTERN && low !== 0n);
      }
      if (unordered(lowA, magnitudeA)) return 1;
      if (unordered(lowB, magnitudeB)) return 1;
      if ((lowA | lowB) === 0n && (magnitudeA | magnitudeB) === 0n) return 0;

      const equal = (lowA ^ lowB) === 0n && (highA ^ highB) === 0n;
      const sameSign = (highA & highB) >= 0n;
      const less = highA === highB ? lowA < lowB : highA < highB;
      const greater = highA === highB ? lowA > lowB : highA > highB;
      if (sameSign) {
        if (less) return -1;
      } else if (greater) {
        return -1;
      }
      return equal ? 0 : 1;
    },
  });
}
