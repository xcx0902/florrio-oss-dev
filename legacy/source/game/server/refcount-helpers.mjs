/** Recovered sp_server reference-count helpers (original 35, 201, 318).
 *
 * 35 decrements the count at +8 and calls the virtual release slot at vtable+16
 * when the count reaches -1 (or was zero). 201 installs vtable 7924, decrements
 * the count at +4 of the control block and calls its virtual slot at vtable+8
 * when it reaches -1. 318 moves an intrusive pointer out of a source record
 * into a destination record and forwards the previous pointer's deleter.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([35, 201, 318]);

export function createRefcountHelperHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    35(record) {
      const memory = memoryView();
      const self = record >>> 0;
      let count = memory.getUint32(self + 8, true);
      if (count !== 0) {
        count = (count - 1) >>> 0;
        memory.setUint32(self + 8, count, true);
        if (count !== 0xffffffff) return;
      }
      const table = memory.getUint32(self, true);
      const method = memory.getUint32(table + 16, true);
      runtime.indirect({parameters: ['i32'], results: []}, method, self);
    },
    201(record) {
      const memory = memoryView();
      const self = record >>> 0;
      memory.setUint32(self, 7924, true);
      const control = memory.getUint32(self + 4, true);
      const count = (memory.getUint32(control + 4, true) - 1) >>> 0;
      memory.setUint32(control + 4, count, true);
      if (count === 0xffffffff) {
        const table = memory.getUint32(control, true);
        runtime.indirect({parameters: ['i32'], results: []},
          memory.getUint32(table + 8, true), control);
      }
      return record;
    },
    318(destination, source) {
      const memory = memoryView();
      const incoming = memory.getUint32(source >>> 0, true);
      memory.setUint32(source >>> 0, 0, true);
      const previous = memory.getUint32(destination >>> 0, true);
      memory.setUint32(destination >>> 0, incoming, true);
      if (previous !== 0) {
        runtime.indirect({parameters: ['i32'], results: []},
          memory.getUint32((destination >>> 0) + 4, true), previous);
      }
      memory.setUint32((destination >>> 0) + 4, memory.getUint32((source >>> 0) + 4, true), true);
      return destination;
    },
  });
}
