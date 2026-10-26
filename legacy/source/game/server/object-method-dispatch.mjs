/** Recovered sp_server virtual method thunk (original 532).
 *
 * type $t0 = (param i32) -> void. The object stores a function-table slot at
 * +4; the thunk reloads the object and tail-dispatches it through that slot:
 *
 *   object = *(u32*) self
 *   tableIndex = *(u32*)(object + 4)
 *   table[tableIndex](object)
 *
 * `runtime.indirect` preserves the original call_indirect type check.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([532]);

export function createObjectMethodDispatchHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    532(self) {
      const memory = memoryView();
      const object = memory.getUint32(self >>> 0, true) >>> 0;
      const tableIndex = memory.getUint32(object + 4, true) >>> 0;
      runtime.indirect({parameters: ['i32'], results: []}, tableIndex, object);
    },
  });
}
