/** Recovered sp_server type predicate (original 731).
 *
 * Reads the pointer at +148. The predicate is false (0) only when that pointer
 * is present and its byte at +8 equals 22; otherwise it is true (1).
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([731]);

export function createTypeCheckHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    731(_unused, record) {
      const memory = memoryView();
      const nested = memory.getUint32((record >>> 0) + 148, true);
      if (nested !== 0 && memory.getUint8(nested + 8) === 22) return 0;
      return 1;
    },
  });
}
