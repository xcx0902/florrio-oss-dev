/** Recovered client std::function destructors (6 originals).
 *
 * Each original installs its manager table, then destroys the stored callable
 * through the manager entry that matches the storage kind: slot +16 when the
 * callable lives in the object's small buffer, slot +20 when it lives on the
 * heap.  An empty callable needs no destruction.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2414, 2420, 2436, 2460, 2467, 2473]);

/** id -> manager table installed in the object. */
const managers = Object.freeze({
  2414: 90756,
  2420: 90792,
  2436: 90540,
  2460: 90684,
  2467: 90432,
  2473: 90468,
});

const STORAGE_OFFSET = 24;
const SMALL_BUFFER_OFFSET = 8;
const MANAGER_DESTROY_INLINE = 16;
const MANAGER_DESTROY_HEAP = 20;

const DESTROY_SIGNATURE = Object.freeze({ parameters: ['i32'], results: [] });

export function createCallableDestructorHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function readUint32(address) {
    try {
      return dataView().getUint32(address >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function writeUint32(address, value) {
    try {
      dataView().setUint32(address >>> 0, value >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const callableManager = storage => readUint32(storage);

  const hooks = {};
  for (const [id, manager] of Object.entries(managers)) {
    hooks[id] = (object) => {
      writeUint32(object, manager);
      const storage = readUint32(object + STORAGE_OFFSET);
      let entry;
      if (storage === ((object + SMALL_BUFFER_OFFSET) >>> 0)) {
        entry = MANAGER_DESTROY_INLINE;
      } else {
        if (storage === 0) return object;
        entry = MANAGER_DESTROY_HEAP;
      }
      runtime.indirect(DESTROY_SIGNATURE, readUint32(callableManager(storage) + entry), storage);
      return object;
    };
  }
  return Object.freeze(hooks);
}
