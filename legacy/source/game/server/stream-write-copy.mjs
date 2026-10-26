/** Recovered sp_server buffered copy writer (original 647).
 *
 * Copies `count` bytes into the stream buffer at +20, advances +20 by the
 * copied length (clamped to the remaining span +16 - +20) and returns count.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([647]);

export function createStreamWriteCopyHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    647(state, source, count) {
      const memory = memoryView();
      const self = state >>> 0;
      const cursor = memory.getUint32(self + 20, true);
      const remaining = (memory.getUint32(self + 16, true) - cursor) >>> 0;
      const copied = count >>> 0 > remaining ? remaining : count >>> 0;
      new Uint8Array(memory.buffer).copyWithin(cursor, source >>> 0, (source >>> 0) + copied);
      memory.setUint32(self + 20, cursor + copied, true);
      return count;
    },
  });
}
