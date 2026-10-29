/** Recovered sp_server locale time formatting (original 328).
 *
 * Builds a two-character "%XY" pattern (swapping X and Y when Y is non-zero) and
 * formats it through the locale strftime import (6), writing the resulting end
 * cursor back through the pointer at +0.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([328]);

const scratch = 0x3f10000;

export function createFormatTimeHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    328(localePointer, destination, endPointer, time, first, second) {
      const memory = memoryView();
      const bytes = new Uint8Array(runtime.memory.buffer);
      bytes[scratch] = 37;
      bytes[scratch + 1] = first & 0xff;
      bytes[scratch + 2] = second & 0xff;
      bytes[scratch + 3] = 0;
      if ((second & 0xff) !== 0) {
        const swap = bytes[scratch + 1];
        bytes[scratch + 1] = bytes[scratch + 2];
        bytes[scratch + 2] = swap;
      }
      const limit = (memory.getUint32(endPointer >>> 0, true) - (destination >>> 0)) | 0;
      const written = runtime.call(6, destination, limit, scratch, time,
        memory.getUint32(localePointer >>> 0, true));
      memory.setUint32(endPointer >>> 0, (destination + written) | 0, true);
      bytes.fill(0, scratch, scratch + 4);
    },
  });
}
