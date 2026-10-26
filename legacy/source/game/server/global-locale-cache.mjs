/** Recovered sp_server global locale cache (original 302).
 *
 * Evaluates the once-initialized global locale object through 33 and stores
 * the resulting pointer at `slot`.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([302]);

export function createGlobalLocaleCacheHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    302(slot) {
      const memory = memoryView();
      memory.setUint32(slot >>> 0, runtime.call(33), true);
    },
  });
}
