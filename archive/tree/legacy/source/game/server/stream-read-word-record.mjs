/** Recovered sp_server word read into a result record (original 315).
 *
 * Reads one 32-bit word through the stream pointer stored at `handle` using
 * 361, then stores the value at result+0 and the stream pointer at result+4.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([315]);

export function createStreamReadWordRecordHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    315(result, handle) {
      const memory = memoryView();
      const slot = handle >>> 0;
      const stream = memory.getUint32(slot, true);
      const value = runtime.call(361, stream);
      memory.setUint32((result >>> 0) + 4, stream, true);
      memory.setInt32(result >>> 0, value, true);
    },
  });
}
