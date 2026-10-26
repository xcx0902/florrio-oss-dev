/** Recovered sp_server global pointer-vector cleanup (original 455).
 *
 * Frees every pointer in the vector (count at 8548312, data at 8548320), then
 * releases the two backing buffers at 8548332 and 8548320, clearing each
 * descriptor's 64-bit length and pointer.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([455]);

export function createGlobalPointerVectorCleanupHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    455() {
      const memory = memoryView();
      const count = memory.getUint32(8548312, true);
      const data = memory.getUint32(8548320, true);
      for (let index = 0; index < count; index++) {
        runtime.call(14, memory.getUint32(data + index * 4, true));
      }
      runtime.call(14, memory.getUint32(8548332, true));
      memory.setBigUint64(8548324, 0n, true);
      memory.setUint32(8548332, 0, true);
      runtime.call(14, data);
      memory.setBigUint64(8548312, 0n, true);
      memory.setUint32(8548320, 0, true);
    },
  });
}
