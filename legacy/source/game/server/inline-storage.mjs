/** Recovered sp_server small-buffer storage selector (original 304).
 *
 * Returns the record itself as inline storage while its allocation flag at
 * +128 is clear and the requested slot count is at most 30. Any other request
 * allocates `count` 32-bit slots through 121.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([304]);

export function createInlineStorageHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    304(record, count) {
      const memory = memoryView();
      const self = record >>> 0;
      if (memory.getUint8(self + 128) === 0 && (count >>> 0) <= 30) {
        memory.setUint8(self + 128, 1);
        return self;
      }
      return runtime.call(121, count);
    },
  });
}
