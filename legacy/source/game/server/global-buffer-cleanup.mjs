/** Recovered sp_server global buffer cleanup (original 474).
 *
 * For eight consecutive 16-byte descriptors ending at 8548268, frees the buffer
 * pointer at +8 and clears the 64-bit length at +0 and the pointer itself.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([474]);

const lastDescriptor = 8548260;

export function createGlobalBufferCleanupHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    474() {
      const memory = memoryView();
      for (let index = 0; index < 8; index++) {
        const descriptor = lastDescriptor - index * 16;
        runtime.call(14, memory.getUint32(descriptor + 8, true));
        memory.setBigUint64(descriptor, 0n, true);
        memory.setUint32(descriptor + 8, 0, true);
      }
    },
  });
}
