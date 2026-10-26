/** Recovered sp_server locale facet cleanup (original 242).
 *
 * Publishes vtable 7888, destroys each facet pair through a three-argument
 * function, releases the shared locale object and frees four owned buffers.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([242]);

export function createLocaleFacetCleanupHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    242(record) {
      const memory = memoryView();
      const self = record >>> 0;
      memory.setUint32(self, 7888, true);
      for (let index = memory.getInt32(self + 40, true); index !== 0; index--) {
        const offset = (index - 1) * 4;
        const first = memory.getUint32(memory.getUint32(self + 36, true) + offset, true);
        const second = memory.getUint32(memory.getUint32(self + 32, true) + offset, true);
        runtime.indirect({parameters: ['i32', 'i32', 'i32'], results: []}, first, 0, first, second);
      }
      const locale = memory.getUint32(self + 28, true);
      const count = (memory.getUint32(locale + 4, true) - 1) >>> 0;
      memory.setUint32(locale + 4, count, true);
      if (count === 0xffffffff) {
        const typeTable = memory.getUint32(locale, true);
        runtime.indirect({parameters: ['i32'], results: []},
          memory.getUint32((typeTable + 8) >>> 0, true), locale);
      }
      for (const offset of [32, 36, 48, 60]) {
        const pointer = memory.getUint32(self + offset, true);
        if (pointer !== 0) runtime.call(14, pointer);
      }
      return record;
    },
  });
}
