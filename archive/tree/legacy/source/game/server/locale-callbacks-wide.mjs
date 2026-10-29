/** Recovered sp_server wide locale callback dispatch (original 437, 446).
 *
 * When 69 reports that the callback's locale facet matches, 222 handles the
 * request locally; otherwise it is forwarded through the virtual slot at
 * vtable+20.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([437, 446]);

export function createWideLocaleCallbackHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function dispatch(self, record, first, second, third, flag) {
    const memory = memoryView();
    const target = memory.getUint32((record >>> 0) + 8, true);
    if (runtime.call(69, self, target, flag) !== 0) {
      runtime.call(222, record, first, second, third);
      return;
    }
    const forward = memory.getUint32((self >>> 0) + 8, true);
    const table = memory.getUint32(forward, true);
    runtime.indirect({parameters: ['i32', 'i32', 'i32', 'i32', 'i32'], results: []},
      memory.getUint32(table + 20, true), forward, record, first, second, third, flag);
  }

  return Object.freeze({
    437(self, record, first, second, third, flag) {
      dispatch(self, record, first, second, third, flag);
    },
    446(self, record, first, second, third, flag) {
      dispatch(self, record, first, second, third, flag);
    },
  });
}
