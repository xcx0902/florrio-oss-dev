/** Recovered sp_server signed byte-range comparison (original 611).
 *
 * Compares [first,firstEnd) with [second,secondEnd) byte by byte using signed
 * characters. The first differing byte decides (-1/1); a prefix compares less,
 * and equal ranges compare 0.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([611]);

export function createByteRangeCompareHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    611(_unused, first, firstEnd, second, secondEnd) {
      const memory = memoryView();
      let left = first >>> 0;
      let right = second >>> 0;
      const leftEnd = firstEnd >>> 0;
      const rightEnd = secondEnd >>> 0;
      while (right !== rightEnd) {
        if (left === leftEnd) return -1;
        const a = memory.getInt8(left);
        const b = memory.getInt8(right);
        if (a < b) return -1;
        if (a > b) return 1;
        left++;
        right++;
      }
      return left === leftEnd ? 0 : 1;
    },
  });
}
