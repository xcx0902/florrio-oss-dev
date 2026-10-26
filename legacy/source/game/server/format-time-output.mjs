/** Recovered sp_server locale time output (original 548).
 *
 * Formats a two-character locale time pattern into a stack buffer through 328,
 * then appends every produced byte to the output iterator through 360 and
 * returns the updated iterator.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([548]);

const scratch = 0x3f20000;

export function createFormatTimeOutputHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    548(locale, output, unused, time, first, second) {
      const memory = memoryView();
      runtime.call(328, (locale >>> 0) + 8, scratch, scratch + 112, time, first, second);
      const start = scratch;
      const end = memory.getUint32(scratch + 112, true);
      for (let cursor = start; cursor !== end; cursor++) {
        runtime.call(360, output, memory.getInt8(cursor));
      }
      new Uint8Array(runtime.memory.buffer).fill(0, scratch, scratch + 128);
      return output;
    },
  });
}
