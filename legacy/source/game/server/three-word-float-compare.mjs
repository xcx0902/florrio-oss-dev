/** Recovered sp_server three-word floating-point comparison (original 263).
 *
 * Compares a shared low word `p0` with two sign/exponent words `p1` and `p2`.
 * The first operand is unordered when its high magnitude is the x87 infinity
 * pattern with a nonzero low word, or above it; a second high magnitude above
 * infinity is also ordered last. Zero triples compare equal. Matching signs
 * compare the high words; opposite signs mirror the greater-than test, with a
 * nonzero low word deciding equality.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([263]);
const HIGH_MASK = 0x7fffffffffffffffn;
const INFINITY_PATTERN = 9223090561878065152n;

export function createThreeWordFloatCompareHook() {
  return Object.freeze({
    263(p0, p1, p2) {
      const low = BigInt.asUintN(64, p0);
      const highA = BigInt.asUintN(64, p1);
      const highB = BigInt.asUintN(64, p2);
      const magnitudeA = highA & HIGH_MASK;
      const magnitudeB = highB & HIGH_MASK;

      if (magnitudeA > INFINITY_PATTERN
        || (magnitudeA === INFINITY_PATTERN && low !== 0n)) return -1;
      if (magnitudeB > INFINITY_PATTERN) return -1;
      if ((low | magnitudeA | magnitudeB) === 0n) return 0;

      const signedA = BigInt.asIntN(64, highA);
      const signedB = BigInt.asIntN(64, highB);
      const sameSign = BigInt.asIntN(64, highA & highB) >= 0n;
      if (sameSign) {
        if (signedA < signedB) return -1;
      } else if (signedA > signedB || (highA === highB && low !== 0n)) {
        return -1;
      }
      return (low | (highA ^ highB)) === 0n ? 0 : 1;
    },
  });
}
