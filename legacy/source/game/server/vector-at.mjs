/** Recovered sp_server vector element access (original 92).
 *
 * Converts the requested index through 38, aborts through 42 when the index is
 * outside the vector or the element is null, and returns the element pointer.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([92]);

export function createVectorAtHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    92(holder, index) {
      const memory = memoryView();
      const vector = memory.getUint32(holder >>> 0, true);
      const slot = runtime.call(38, index);
      const start = memory.getUint32(vector + 16, true);
      const count = ((memory.getInt32(vector + 20, true) - start) >> 2) >>> 0;
      if (slot >= count || memory.getUint32((start + slot * 4) >>> 0, true) === 0) {
        runtime.call(42);
        throw new Error('unreachable');
      }
      return memory.getUint32((start + slot * 4) >>> 0, true);
    },
  });
}
