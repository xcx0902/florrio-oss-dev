/** Recovered sp_server four-argument function invoker (original 287).
 *
 * Resolves the virtual target from vtable+28 and forwards
 * (vtable, first, adjustedOffset, flagsOrThird) to a four-argument function.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([287]);

export function createFunctionInvokerHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    287(record, first, offsetRecord, third) {
      const memory = memoryView();
      const flags = memory.getUint32((record >>> 0) + 4, true);
      const vtable = memory.getUint32(record >>> 0, true);
      let adjusted = 0;
      if (offsetRecord !== 0) {
        if ((flags & 1) !== 0) {
          const base = (flags >> 8) + memory.getUint32(offsetRecord >>> 0, true);
          adjusted = (memory.getUint32(base >>> 0, true) + offsetRecord) | 0;
        } else {
          adjusted = offsetRecord;
        }
      }
      const fourth = (flags & 2) !== 0 ? 2 : third;
      const typeTable = memory.getUint32(vtable >>> 0, true);
      runtime.indirect({parameters: ['i32', 'i32', 'i32', 'i32'], results: []},
        memory.getUint32((typeTable + 28) >>> 0, true), vtable, first, adjusted, fourth);
    },
  });
}
