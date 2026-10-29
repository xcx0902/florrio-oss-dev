/** Recovered sp_server file seek (original 645).
 *
 * Seeks the descriptor at +60 through the no-op seek import (11), recording a
 * non-zero error at 8569384 and returning -1; otherwise returns the 64-bit
 * result produced by the import.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([645]);

export function createFileSeekHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    645(state, offset, origin) {
      const memory = memoryView();
      const scratch = (runtime.stackPointer.value - 8) >>> 0;
      const error = runtime.call(11, memory.getUint32((state >>> 0) + 60, true),
        Number(offset & 0xffffffffn), Number((offset >> 32n) & 0xffffffffn), origin & 0xff, scratch);
      if (error !== 0) {
        memory.setUint32(8569384, error, true);
        return -1n;
      }
      return memory.getBigUint64(scratch, true);
    },
  });
}
