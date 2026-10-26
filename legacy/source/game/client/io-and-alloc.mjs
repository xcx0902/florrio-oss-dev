/** Recovered client I/O, buffer flush, bump allocation and lazy registry init
 * (originals 584,928,1021,1084).
 *
 * 584 carves 4-byte aligned blocks from the global bump pointer. 928 flushes one
 * stream or every registered stream. 1021 dispatches a read/write request. 1084 runs
 * the one-time static registry initialiser behind the guard pair 369/370.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([584, 928, 1021]);

export function createIoAndAllocHooks(runtime) {
  return Object.freeze({
    584(size) {
      const view = new DataView(runtime.memory.buffer);
      const base = view.getUint32(133640, true);
      const aligned = (size + 3) & ~3;
      const end = (base + aligned) >>> 0;
      if (aligned !== 0 && end <= base) return -1;
      if (end > runtime.memory.buffer.byteLength) {
        if (runtime.call(13, end) === 0) return -1;
      }
      view.setUint32(133640, end, true);
      return base;
    },
    928(stream) {
      const view = new DataView(runtime.memory.buffer);
      if (stream !== 0) return runtime.call(735, stream >>> 0);
      let failed = 0;
      const current = view.getUint32(133408, true);
      if (current !== 0) failed = runtime.call(928, current);
      let entry = view.getUint32(7944556, true);
      while (entry !== 0) {
        if (view.getUint32(entry + 20, true) > view.getUint32(entry + 28, true))
          failed = (runtime.call(735, entry) | failed) >>> 0;
        entry = view.getUint32(entry + 56, true);
      }
      return failed;
    },
    1021(destination, stream) {
      const view = new DataView(runtime.memory.buffer);
      const start = stream >>> 0;
      const flags = view.getUint32(start + 48, true);
      if ((flags & 16) !== 0) {
        let offset = view.getUint32(start + 44, true);
        const limit = view.getUint32(start + 24, true);
        if (offset < limit) {
          view.setUint32(start + 44, limit, true);
          offset = limit;
        }
        runtime.call(647, destination >>> 0, view.getUint32(start + 20, true), offset);
        return;
      }
      if ((flags & 8) !== 0) {
        runtime.call(647, destination >>> 0, view.getUint32(start + 8, true), view.getUint32(start + 16, true));
        return;
      }
      runtime.call(389, destination >>> 0);
    },
  });
}
