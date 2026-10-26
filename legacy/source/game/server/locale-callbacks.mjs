/** Recovered sp_server locale callback dispatch (original 443, 444).
 *
 * When 69 reports that the callback's locale facet (record +8) matches, the
 * request is delivered locally through 221; otherwise it is forwarded through
 * the virtual slot at vtable+28.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([443, 444]);

export function createLocaleCallbackHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function dispatch(self, record, first, second) {
    const memory = memoryView();
    const target = memory.getUint32((record >>> 0) + 8, true);
    if (runtime.call(69, self, target, 0) !== 0) {
      runtime.call(221, record, first, second);
      return;
    }
    const forward = memory.getUint32((self >>> 0) + 8, true);
    const table = memory.getUint32(forward, true);
    runtime.indirect({parameters: ['i32', 'i32', 'i32'], results: []},
      memory.getUint32(table + 28, true), forward, record, first, second);
  }

  return Object.freeze({
    443(self, record, first, second) {
      dispatch(self, record, first, second);
    },
    444(self, record, first, second) {
      dispatch(self, record, first, second);
    },
  });
}
