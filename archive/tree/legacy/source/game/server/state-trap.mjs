/** Recovered sp_server state trap latch (original 386).
 *
 * Latches +16 from the empty +24 marker or the incoming flag, and aborts through
 * 42 when the latched bits overlap the fatal mask at +20.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([386]);

export function createStateTrapHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    386(state, flag) {
      const memory = memoryView();
      const self = state >>> 0;
      const latched = ((memory.getUint32(self + 24, true) === 0 ? 1 : 0) | (flag & 1)) >>> 0;
      memory.setUint32(self + 16, latched, true);
      if ((memory.getUint32(self + 20, true) & latched) !== 0) {
        runtime.call(42);
        throw new Error('unreachable');
      }
    },
  });
}
