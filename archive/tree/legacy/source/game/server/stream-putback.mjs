/** Recovered sp_server stream put-back helper (original 624).
 *
 * Backs up the read limit at +12, writes the low byte of `value` there and
 * returns the value. When `value` is -1 (EOF) it only backs up the limit and
 * returns 0. Unless flags at +48 have bit 16, the backed-up byte must match the
 * byte being removed; otherwise it returns -1 without changing the stream.
 * The position record at +16 follows the maximum of +24 and +44.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([624]);

export function createStreamPutbackHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    624(state, value) {
      const memory = memoryView();
      const base = state >>> 0;
      let position = memory.getUint32(base + 44, true);
      const pending = memory.getUint32(base + 24, true);
      if (position < pending) {
        memory.setUint32(base + 44, pending, true);
        position = pending;
      }
      const read = memory.getUint32(base + 8, true);
      const limit = memory.getUint32(base + 12, true);
      if (read >= limit) return -1;
      if ((value | 0) === -1) {
        memory.setUint32(base + 16, position, true);
        memory.setUint32(base + 12, limit - 1, true);
        memory.setUint32(base + 8, read, true);
        return 0;
      }
      const byte = (value << 24) >> 24;
      if ((memory.getUint32(base + 48, true) & 16) === 0
        && byte !== memory.getInt8(limit - 1)) return -1;
      memory.setUint32(base + 16, position, true);
      memory.setUint32(base + 12, limit - 1, true);
      memory.setUint32(base + 8, read, true);
      memory.setUint8(limit - 1, value & 0xff);
      return value;
    },
  });
}
