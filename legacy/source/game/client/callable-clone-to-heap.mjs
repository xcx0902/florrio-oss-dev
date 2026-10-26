/** Recovered client std::function clone-to-heap entries (6 originals).
 *
 * These are the manager entries a `std::function` copy constructor calls when
 * the source callable lives on the heap.  Each original allocates a fresh
 * 32-byte object, installs its manager table, and reproduces the storage:
 *
 *   - an empty source stays empty,
 *   - a source using its small buffer is copied in place through the callable's
 *     copy-into-inline entry (manager slot +12),
 *   - a heap source is cloned through the callable's own clone entry (+8).
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2412, 2418, 2434, 2458, 2465, 2471]);

/** id -> manager table installed in the clone. */
const managers = Object.freeze({
  2412: 90756,
  2418: 90792,
  2434: 90540,
  2458: 90684,
  2465: 90432,
  2471: 90468,
});

const CALLABLE_BYTES = 32;
const STORAGE_OFFSET = 24;
const SMALL_BUFFER_OFFSET = 8;
const MANAGER_CLONE = 8;
const MANAGER_COPY_INLINE = 12;

/** `allocateOrAbort(bytes)`. */
const ALLOCATE = 371;

const COPY_INLINE_SIGNATURE = Object.freeze({ parameters: ['i32', 'i32'], results: [] });
const CLONE_SIGNATURE = Object.freeze({ parameters: ['i32'], results: ['i32'] });

export function createCallableCloneHooks(runtime) {
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
  /** The stored callable's first word is its manager table. */
  const callableManager = storage => readUint32(storage);

  const hooks = {};
  for (const [id, manager] of Object.entries(managers)) {
    hooks[id] = (source) => {
      const clone = runtime.call(ALLOCATE, CALLABLE_BYTES);
      writeUint32(clone, manager);
      const storage = readUint32(source + STORAGE_OFFSET);
      if (storage === 0) {
        writeUint32(clone + STORAGE_OFFSET, 0);
        return clone;
      }
      if (storage === ((source + SMALL_BUFFER_OFFSET) >>> 0)) {
        const inlineDestination = (clone + SMALL_BUFFER_OFFSET) >>> 0;
        writeUint32(clone + STORAGE_OFFSET, inlineDestination);
        runtime.indirect(COPY_INLINE_SIGNATURE, readUint32(callableManager(storage) + MANAGER_COPY_INLINE), storage, inlineDestination);
        return clone;
      }
      const clonedStorage = runtime.indirect(CLONE_SIGNATURE, readUint32(callableManager(storage) + MANAGER_CLONE), storage);
      writeUint32(clone + STORAGE_OFFSET, clonedStorage);
      return clone;
    };
  }
  return Object.freeze(hooks);
}
