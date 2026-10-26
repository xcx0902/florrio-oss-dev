/** Recovered sp_server vector object destructor (original 297).
 *
 * Publishes vtable 13440, destroys the payload at +8 through 355 unless it is the
 * shared empty-vector singleton from 33, and returns the object.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([297]);

export function createVectorObjectDestructorHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    297(record) {
      const memory = memoryView();
      const self = record >>> 0;
      memory.setUint32(self, 13440, true);
      if (memory.getUint32(self + 8, true) !== runtime.call(33)) {
        runtime.call(355, self + 8);
      }
      return record;
    },
  });
}
