/** Recovered sp_server global list cleanup (original 448, 464).
 *
 * 448 walks the list at 8548348, frees long-string members at +20/+8 when their
 * size bytes are negative, frees each node, then releases the buffer at
 * 8548340. 464 walks the list at 8548284, frees each node, then releases the
 * buffer at 8548276.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([448, 464]);

export function createGlobalListCleanupHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    448() {
      const memory = memoryView();
      let node = memory.getUint32(8548348, true);
      if (node !== 0) {
        for (;;) {
          const next = memory.getUint32(node, true);
          if (memory.getInt8(node + 31) < 0) runtime.call(14, memory.getUint32(node + 20, true));
          if (memory.getInt8(node + 19) < 0) runtime.call(14, memory.getUint32(node + 8, true));
          runtime.call(14, node);
          node = next;
          if (node === 0) break;
        }
      }
      const bufferPointer = memory.getUint32(8548340, true);
      memory.setUint32(8548340, 0, true);
      if (bufferPointer !== 0) runtime.call(14, bufferPointer);
    },
    464() {
      const memory = memoryView();
      let node = memory.getUint32(8548284, true);
      if (node !== 0) {
        for (;;) {
          const next = memory.getUint32(node, true);
          runtime.call(14, node);
          node = next;
          if (node === 0) break;
        }
      }
      const bufferPointer = memory.getUint32(8548276, true);
      memory.setUint32(8548276, 0, true);
      if (bufferPointer !== 0) runtime.call(14, bufferPointer);
    },
  });
}
