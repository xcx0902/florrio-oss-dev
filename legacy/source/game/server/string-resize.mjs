/** Recovered sp_server libc++ string resize (original 387).
 *
 * Resizes a string to `size`. Growing fills the new tail with NUL bytes through
 * 325 and moves the size at +4/+11; shrinking only moves the size and writes a
 * terminator. Growth beyond capacity calls 227 first.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([387]);

export function createStringResizeHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    387(string, size) {
      const memory = memoryView();
      const self = string >>> 0;
      const target = size >>> 0;
      const isLong = (memory.getUint8(self + 11) & 0x80) !== 0;
      const current = isLong ? memory.getUint32(self + 4, true) : memory.getUint8(self + 11);
      if (target > current) {
        const added = target - current;
        if (added !== 0) {
          const capacity = isLong ? (memory.getUint32(self + 8, true) & 0x7fffffff) - 1 : 10;
          if (added > capacity - current) {
            runtime.call(227, self, capacity, target, target - capacity, current, current);
          }
          const data = isLong ? memory.getUint32(self, true) : self;
          runtime.call(325, data + current, added, 0);
          if (isLong) memory.setUint32(self + 4, target, true);
          else memory.setUint8(self + 11, target);
          memory.setUint8(data + target, 0);
        }
        return;
      }
      const data = isLong ? memory.getUint32(self, true) : self;
      memory.setUint8(data + target, 0);
      if (isLong) memory.setUint32(self + 4, target, true);
      else memory.setUint8(self + 11, target);
    },
  });
}
