/** Recovered sp_server virtual-base wrappers (original 615, 616, 630, 631).
 *
 * Each adds the vtable offset stored at -12 to the object pointer and applies a
 * cleanup/initializer: 238 (615), 185 (616), 369 (630) and 241 (631).
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([615, 616, 630, 631]);

export function createVirtualBaseWrapperHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    615(record) {
      const memory = memoryView();
      runtime.call(238, (record + memory.getInt32((memory.getUint32(record >>> 0, true) - 12) >>> 0, true)) | 0);
    },
    616(record) {
      const memory = memoryView();
      return runtime.call(185, (record + memory.getInt32((memory.getUint32(record >>> 0, true) - 12) >>> 0, true)) | 0);
    },
    630(record) {
      const memory = memoryView();
      runtime.call(369, (record + memory.getInt32((memory.getUint32(record >>> 0, true) - 12) >>> 0, true)) | 0);
    },
    631(record) {
      const memory = memoryView();
      return runtime.call(241, (record + memory.getInt32((memory.getUint32(record >>> 0, true) - 12) >>> 0, true)) | 0);
    },
  });
}
