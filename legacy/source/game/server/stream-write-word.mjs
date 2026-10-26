/** Recovered sp_server stream word writer (original 359).
 *
 * Writes one 32-bit word through the stream pointer stored at `handle`. When
 * the put area at +24 is full it calls the virtual overflow slot at
 * vtable+52; a failed write clears the handle.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([359]);

export function createStreamWriteWordHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    359(handle, value) {
      const memory = memoryView();
      const slot = handle >>> 0;
      const stream = memory.getUint32(slot, true);
      if (stream === 0) return;
      const put = memory.getUint32(stream + 24, true);
      let written;
      if (put === memory.getUint32(stream + 28, true)) {
        const table = memory.getUint32(stream, true);
        const method = memory.getUint32(table + 52, true);
        written = runtime.indirect({parameters: ['i32', 'i32'], results: ['i32']}, method, stream, value);
      } else {
        memory.setUint32(put, value, true);
        memory.setUint32(stream + 24, put + 4, true);
        written = value;
      }
      if (written === -1) memory.setUint32(slot, 0, true);
    },
  });
}
