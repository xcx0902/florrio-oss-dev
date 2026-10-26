/** Recovered sp_server buffered line read (original 613).
 *
 * Reads at most `count` bytes from the buffer cursor at +84 into `destination`,
 * using the bounded scan 378 to find the end of the buffered text. The cursor
 * advances by the scanned text length, +8 mirrors the cursor, and +4 records the
 * buffer cursor plus the copied count. Returns the copied byte count.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([613]);

export function createStreamReadLineHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    613(state, destination, count) {
      const memory = memoryView();
      const self = state >>> 0;
      const cursor = memory.getUint32(self + 84, true);
      const scanEnd = (cursor + (count >>> 0) + 256) | 0;
      const found = runtime.call(378, cursor, scanEnd);
      const textLength = found === 0 ? scanEnd : (found - cursor) | 0;
      const copied = (count >>> 0) > (textLength >>> 0) ? textLength >>> 0 : count >>> 0;
      new Uint8Array(memory.buffer).copyWithin(destination >>> 0, cursor, cursor + copied);
      const advanced = (cursor + textLength) | 0;
      memory.setUint32(self + 84, advanced, true);
      memory.setUint32(self + 8, advanced, true);
      memory.setUint32(self + 4, (cursor + copied) | 0, true);
      return copied;
    },
  });
}
