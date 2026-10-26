/** Recovered sp_server memmove (original function 261).
 *
 * Copies `count` bytes between possibly overlapping regions. The original
 * dispatches to memcpy for non-overlapping ranges and otherwise copies
 * backwards when destination is above source (forwards below). The resulting
 * byte image is the same as an overlap-safe move.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([261]);

export function createByteMoveHook(runtime) {
  let buffer, bytes;
  function byteView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      bytes = new Uint8Array(buffer);
    }
    return bytes;
  }

  /** Original 261: overlap-safe byte copy. */
  function moveBytes(destination, source, count) {
    try {
      if (count === 0 || destination === source) return;
      const memory = byteView();
      memory.copyWithin(destination >>> 0, source >>> 0, (source + count) >>> 0);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({261: moveBytes});
}
