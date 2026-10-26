/** Recovered client std::function copy constructors (6 originals).
 *
 * Each original is the per-signature `std::function` copy constructor emitted by
 * the C++ template.  The 32-byte object is `{ manager, ..., storage }` where
 * `manager` (offset 0) is a per-signature table of entry points and `storage`
 * (offset 24) is either 0 (empty), `object + 8` (small-object buffer) or a heap
 * pointer to the type-erased callable.
 *
 * Manager table layout used by every instantiation:
 *   [0] invoke            [2] clone-to-heap     [3] copy-into-inline
 *   [4] destroy-inline    [5] destroy-heap
 *
 * The copy constructor therefore:
 *   1. installs its own manager table in the destination,
 *   2. forwards an empty source as an empty destination,
 *   3. copies the callable in place when the source uses its small buffer,
 *   4. otherwise asks the callable's own manager to clone it on the heap.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2411, 2416, 2433, 2457, 2464, 2470]);

/** id -> manager table installed in the destination object. */
const managers = Object.freeze({
  2411: 90756,
  2416: 90792,
  2433: 90540,
  2457: 90684,
  2464: 90432,
  2470: 90468,
});

const MANAGER_CLONE = 8;
const MANAGER_COPY_INLINE = 12;
const STORAGE_OFFSET = 24;
const SMALL_BUFFER_OFFSET = 8;

export function createCallableCopyConstructorHooks(runtime) {
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
    hooks[id] = (source, destination) => {
      writeUint32(destination, manager);
      const storage = readUint32(source + STORAGE_OFFSET);
      if (storage === 0) {
        writeUint32(destination + STORAGE_OFFSET, 0);
        return;
      }
      if (storage === ((source + SMALL_BUFFER_OFFSET) >>> 0)) {
        const inlineDestination = (destination + SMALL_BUFFER_OFFSET) >>> 0;
        writeUint32(destination + STORAGE_OFFSET, inlineDestination);
        const table = callableManager(storage);
        runtime.indirect(
          { parameters: ['i32', 'i32'], results: [] },
          readUint32(table + MANAGER_COPY_INLINE),
          storage,
          inlineDestination,
        );
        return;
      }
      const table = callableManager(storage);
      const clone = runtime.indirect(
        { parameters: ['i32'], results: ['i32'] },
        readUint32(table + MANAGER_CLONE),
        storage,
      );
      writeUint32(destination + STORAGE_OFFSET, clone);
    };
  }
  return Object.freeze(hooks);
}
