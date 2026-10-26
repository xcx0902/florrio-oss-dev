/** Recovered sp_server stream byte writer (original 360).
 *
 * Writes one byte through the stream pointer stored at `handle` using the
 * streambuf put helper 365. A null stream is ignored; a failed write clears the
 * stream pointer so later writes become no-ops.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([360]);

export function createStreamWriteByteHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    360(handle, value) {
      const memory = memoryView();
      const slot = handle >>> 0;
      const stream = memory.getUint32(slot, true);
      if (stream === 0) return;
      if (runtime.call(365, stream, value & 0xff) === -1) memory.setUint32(slot, 0, true);
    },
  });
}
