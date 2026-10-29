/** Recovered sp_server stream handle operations (original 45, 46, 59, 60).
 *
 * 45 advances the byte stream referenced by a handle and returns the handle.
 * 46 does the same for a word stream. 59/60 negate the status equalities 363/368,
 * returning 1 when the two handles differ.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([45, 46, 59, 60]);

export function createStreamHandleOpHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    45(handle) {
      const stream = memoryView().getUint32(handle >>> 0, true);
      runtime.call(361, stream);
      return handle;
    },
    46(handle) {
      const stream = memoryView().getUint32(handle >>> 0, true);
      runtime.call(366, stream);
      return handle;
    },
    59(left, right) {
      return runtime.call(363, left, right) ^ 1;
    },
    60(left, right) {
      return runtime.call(368, left, right) ^ 1;
    },
  });
}
