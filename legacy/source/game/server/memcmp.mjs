/** Recovered sp_server memcmp (original function 57).
 *
 * Compares up to `length` bytes and returns 0 when the whole prefix is equal,
 * otherwise the unsigned difference `left - right` of the first differing
 * bytes. Lengths are treated as unsigned. The shipped loop always compares the
 * first byte, even for length 0; that quirk is reproduced exactly.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([57]);

export function createMemcmpHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function byteAt(address) {
    try {
      return dataView().getUint8(address >>> 0);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  /** Original 57: unsigned byte-prefix comparison. */
  function memcmp(left, right, length) {
    let leftCursor = left >>> 0;
    let rightCursor = right >>> 0;
    let remaining = length >>> 0;
    for (;;) {
      const leftByte = byteAt(leftCursor);
      const rightByte = byteAt(rightCursor);
      if (leftByte !== rightByte) return (leftByte - rightByte) | 0;
      rightCursor = (rightCursor + 1) >>> 0;
      leftCursor = (leftCursor + 1) >>> 0;
      remaining = (remaining - 1) >>> 0;
      if (remaining === 0) return 0;
    }
  }

  return Object.freeze({57: memcmp});
}
