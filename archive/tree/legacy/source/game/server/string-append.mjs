/** Recovered sp_server libc++ string append (original 317).
 *
 * Appends `count` bytes to a string, using the short capacity of 10 or the long
 * capacity stored at +8. When the data fits, 75 copies the bytes, the size at
 * +4/+11 advances and a terminator is written. Otherwise 173 grows the string
 * with the native capacity/delta/size request.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([317]);

export function createStringAppendHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    317(string, data, count) {
      const memory = memoryView();
      const self = string >>> 0;
      const length = count >>> 0;
      const isLong = (memory.getUint8(self + 11) & 0x80) !== 0;
      const capacity = isLong ? (memory.getUint32(self + 8, true) & 0x7fffffff) - 1 : 10;
      const size = isLong ? memory.getUint32(self + 4, true) : memory.getUint8(self + 11);
      if (length <= capacity - size) {
        if (length === 0) return;
        const destination = isLong ? memory.getUint32(self, true) : self;
        runtime.call(75, destination + size, data, length);
        const grown = size + length;
        if (isLong) memory.setUint32(self + 4, grown, true);
        else memory.setUint8(self + 11, grown);
        memory.setUint8(destination + grown, 0);
        return;
      }
      runtime.call(173, self, capacity, size + length - capacity, size, size, 0, length, data);
    },
  });
}
