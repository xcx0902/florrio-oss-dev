/** Recovered client array and vtable destructors (originals 2570,2601,3463,3474,
 * 4429,4440).
 *
 * The array destructors walk a fixed-stride global table and clear its count. The
 * vtable destructors publish a vtable, report a live handle through the host bridge
 * and either free the record or return it.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const arrays = {
  2570: {count: 7891808, base: 7891816, stride: 408, release: 620},
  2601: {count: 7910640, base: 7910648, stride: 408, release: 620},
  2562: {count: 7791368, base: 7791376, stride: 4448, release: 550},
};

const vtables = {
  3463: {vtable: 33288, free: true},
  3474: {vtable: 33288, free: false},
  4429: {vtable: 34516, free: true},
  4440: {vtable: 34516, free: false},
};

export const functionIds = Object.freeze([...Object.keys(arrays).map(Number), ...Object.keys(vtables).map(Number)]);

export function createArrayAndVtableDestructorHooks(runtime) {
  const hooks = {};

  for (const [id, {count, base, stride, release}] of Object.entries(arrays)) {
    hooks[id] = () => {
      const view = new DataView(runtime.memory.buffer);
      const elements = view.getUint8(count);
      for (let index = 0; index < elements; index++) runtime.call(release, base + index * stride);
      view.setUint8(count, 0);
    };
  }

  for (const [id, {vtable, free}] of Object.entries(vtables)) {
    hooks[id] = record => {
      const view = new DataView(runtime.memory.buffer);
      const start = record >>> 0;
      view.setUint32(start, vtable, true);
      if (view.getUint8(start + 8) !== 0) {
        const handle = view.getUint32(start + 4, true);
        if (handle !== 0xffffffff) {
          const saved = runtime.stackPointer.value;
          const frame = (saved - 16) >>> 0;
          runtime.stackPointer.value = frame;
          view.setUint32(frame, handle, true);
          runtime.host('a', 'a', 141569, 31967, frame);
          runtime.stackPointer.value = saved;
        }
      }
      if (free) runtime.call(362, start);
      else return record;
    };
  }
  return Object.freeze(hooks);
}
