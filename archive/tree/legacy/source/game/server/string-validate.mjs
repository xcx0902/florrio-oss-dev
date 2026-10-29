/** Recovered sp_server string validation wrapper (original 475).
 *
 * Returns 1 when the pointer at +8 is null, otherwise delegates to the string
 * validator 295.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([475]);

export function createStringValidateHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    475(record) {
      const pointer = memoryView().getUint32((record >>> 0) + 8, true);
      if (pointer === 0) return 1;
      return runtime.call(295, pointer);
    },
  });
}
