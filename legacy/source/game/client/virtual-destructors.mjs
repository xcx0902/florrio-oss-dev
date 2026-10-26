/** Recovered client virtual destructors (originals 2413,2419,2435,2459,2466,2472).
 *
 * Each invokes the virtual cleanup slot (inline buffer uses slot 4, heap buffer
 * uses slot 5) and frees the record; all but 578 publish a vtable first.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const vtables = {
  2413: 90756,
  2419: 90792,
  2435: 90540,
  2459: 90684,
  2466: 90432,
  2472: 90468,
  578: null,
};

export const functionIds = Object.freeze(Object.keys(vtables).map(Number));

export function createVirtualDestructorHooks(runtime) {
  const hooks = {};
  for (const [id, vtable] of Object.entries(vtables)) {
    hooks[id] = record => {
      const view = new DataView(runtime.memory.buffer);
      const start = record >>> 0;
      if (vtable !== null) view.setUint32(start, vtable, true);
      const buffer = view.getUint32(start + 24, true);
      let slot = 0;
      if (buffer === start + 8) slot = 4;
      else if (buffer !== 0) slot = 5;
      if (slot !== 0) {
        const index = view.getUint32(view.getUint32(buffer, true) + slot * 4, true);
        runtime.indirect({parameters: ['i32'], results: []}, index, buffer);
      }
      runtime.call(362, start);
    };
  }
  return Object.freeze(hooks);
}
