/** Recovered sp_server locale object lifetime (original 239, 640).
 *
 * 239 installs vtable 7988, destroys the string at +32 and releases the control
 * block at +4 before returning the object. 640 releases the control block and
 * frees the object.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([239, 640]);

export function createLocaleObjectLifetimeHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    239(record) {
      const memory = memoryView();
      const self = record >>> 0;
      memory.setUint32(self, 7988, true);
      runtime.call(19, (self + 32) >>> 0);
      runtime.call(201, self);
      return record;
    },
    640(record) {
      runtime.call(201, record);
      runtime.call(14, record);
    },
  });
}
