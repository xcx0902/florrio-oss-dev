/** Recovered sp_server movable record constructor (original 166).
 *
 * Copies a record that owns two small inline vectors:
 *
 *   +0   word payload
 *   +4   u8 count of 4-byte entries stored inline from +8
 *   +24  i64 scalar
 *   +32  u8 count of 8-byte entries stored inline from +36
 *   +100 i64 scalars
 *   +108 i64
 *
 * Entry counts and owned payloads are copied, then the source counts at +4 and
 * +32 are zeroed so the source no longer owns the inline storage.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([166]);

export function createMovableRecordHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    166(destination, source) {
      const memory = memoryView();
      const from = source >>> 0;
      const to = destination >>> 0;
      memory.setUint32(to, memory.getUint32(from, true), true);
      memory.setUint8(to + 4, 0);
      const words = memory.getUint8(from + 4);
      for (let index = 0; index < words; index++) {
        memory.setUint32(to + 8 + index * 4, memory.getUint32(from + 8 + index * 4, true), true);
      }
      memory.setUint8(to + 4, words);
      memory.setUint8(from + 4, 0);

      memory.setBigUint64(to + 24, memory.getBigUint64(from + 24, true), true);
      memory.setUint8(to + 32, 0);
      const entries = memory.getUint8(from + 32);
      for (let index = 0; index < entries; index++) {
        memory.setBigUint64(to + 36 + index * 8, memory.getBigUint64(from + 36 + index * 8, true), true);
      }
      memory.setUint8(to + 32, entries);
      memory.setUint8(from + 32, 0);

      memory.setBigUint64(to + 100, memory.getBigUint64(from + 100, true), true);
      memory.setBigUint64(to + 108, memory.getBigUint64(from + 108, true), true);
    },
  });
}
