/** Recovered sp_server wide locale forwarder (original 619).
 *
 * Loads the 64-bit value at record+8 and forwards (self, record, value, 0, flag)
 * to the virtual slot at vtable+16.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([619]);

export function createLocaleWideForwardHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    619(self, record, source, flag) {
      const memory = memoryView();
      const table = memory.getUint32(record >>> 0, true);
      runtime.indirect({parameters: ['i32', 'i32', 'i64', 'i32', 'i32'], results: []},
        memory.getUint32(table + 16, true), self, record,
        memory.getBigUint64((source >>> 0) + 8, true), 0, flag);
    },
  });
}
