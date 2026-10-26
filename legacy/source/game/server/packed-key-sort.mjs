/** Recovered sp_server packed-key four-element sorting network (function 252).
 *
 * Each 32-bit key packs an 18-bit major field in bits 14..31 and a 14-bit
 * minor field in bits 0..13. The shipped comparison orders by the minor field
 * first and uses the major field only as a tie-break; equivalently, compare
 * `((key & 0x3fff) << 18) | (key >>> 14)` as an unsigned integer.
 *
 * The first three keys use an adaptive insertion network (a median shortcut
 * exchanges the outer pair directly); the fourth is then inserted from the
 * right. All decisions compare the original three keys, while exchanges mutate
 * the referenced words. The return value is the number of pair exchanges.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([252]);
const MINOR_MASK = 0x3fff;

/** Sort order: minor 14 bits primary, major 18 bits secondary. */
export function packedKeyOrder(key) {
  return ((((key >>> 0) & MINOR_MASK) << 18) | ((key >>> 0) >>> 14)) >>> 0;
}

export function createPackedKeySortHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 252: sort four referenced packed keys and count exchanges. */
  function sortPackedKeys(first, second, third, fourth) {
    try {
      const view = dataView();
      const addresses = [first >>> 0, second >>> 0, third >>> 0, fourth >>> 0];
      const keys = addresses.map(address => view.getUint32(address, true));
      const [k0, k1, k2] = keys;
      let exchanges = 0;
      const less = (a, b) => packedKeyOrder(a) < packedKeyOrder(b);
      const exchange = (i, j) => {
        [keys[i], keys[j]] = [keys[j], keys[i]];
        exchanges++;
      };

      // Sort the first three. When the middle value is already between the
      // other two, exchanging the outer pair is enough; otherwise use the
      // three-element insertion network.
      if (less(k1, k0)) {
        if (less(k2, k1)) {
          exchange(0, 2);
        } else {
          exchange(0, 1);
          if (less(k2, k0)) exchange(1, 2);
        }
      } else if (less(k2, k1)) {
        exchange(1, 2);
        if (less(k2, k0)) exchange(0, 1);
      }

      // Insert the fourth key into the sorted prefix from the right.
      if (less(keys[3], keys[2])) {
        exchange(2, 3);
        if (less(keys[2], keys[1])) {
          exchange(1, 2);
          if (less(keys[1], keys[0])) exchange(0, 1);
        }
      }

      for (let i = 0; i < 4; i++) view.setUint32(addresses[i], keys[i], true);
      return exchanges;
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({252: sortPackedKeys});
}
