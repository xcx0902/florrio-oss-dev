/** Recovered sp_server vtable destructors (original 292, 299, 300).
 *
 * 292 installs vtable 13388 and frees +8 only when it is non-null and +12 is
 * non-zero. 299 installs 13488 and destroys the string at +12. 300 installs
 * 13528 and destroys the string at +16. All three return the record.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([292, 299, 300]);

export function createVtableDestructorHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    292(record) {
      const memory = memoryView();
      memory.setUint32(record >>> 0, 13388, true);
      const pointer = memory.getUint32((record >>> 0) + 8, true);
      if (pointer !== 0 && memory.getUint8((record >>> 0) + 12) !== 0) runtime.call(14, pointer);
      return record;
    },
    299(record) {
      memoryView().setUint32(record >>> 0, 13488, true);
      runtime.call(19, (record >>> 0) + 12);
      return record;
    },
    300(record) {
      memoryView().setUint32(record >>> 0, 13528, true);
      runtime.call(19, (record >>> 0) + 16);
      return record;
    },
  });
}
