/** Recovered sp_server storage release (original 303).
 *
 * Clears the inline-storage flag when the data pointer equals the record
 * (inline case); otherwise releases the external allocation through free.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([303]);

export function createReleaseStorageHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    303(record, data) {
      const memory = memoryView();
      const self = record >>> 0;
      const pointer = data >>> 0;
      if (self === pointer) {
        memory.setUint8(self + 128, 0);
        return;
      }
      runtime.call(355, pointer);
    },
  });
}
