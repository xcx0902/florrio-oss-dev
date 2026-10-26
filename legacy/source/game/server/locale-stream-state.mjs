/** Recovered sp_server locale stream state update (original 439).
 *
 * When the locale facet at record+8 matches, it records the pending character
 * (+28) unless the stream is already in state 1. Otherwise, when the primary
 * facet at record matches, it tracks the alternate character (+20/+32/+40) and
 * enters the four-byte final state.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([439]);

export function createLocaleStreamStateHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    439(self, record, character, pending, flag) {
      const memory = memoryView();
      const state = record >>> 0;
      if (runtime.call(69, self, memory.getUint32(state + 8, true), flag) !== 0) {
        if (memory.getUint32(state + 4, true) === character && memory.getUint32(state + 28, true) !== 1) {
          memory.setUint32(state + 28, pending, true);
        }
        return;
      }
      if (runtime.call(69, self, memory.getUint32(state, true), flag) === 0) return;
      const first = memory.getUint32(state + 16, true);
      const second = memory.getUint32(state + 20, true);
      if ((character === first || character === second) && pending === 1) {
        memory.setUint32(state + 32, 1, true);
        return;
      }
      memory.setUint32(state + 20, character, true);
      memory.setUint32(state + 32, pending, true);
      memory.setUint32(state + 40, (memory.getUint32(state + 40, true) + 1) >>> 0, true);
      if (memory.getUint32(state + 36, true) === 1 && memory.getUint32(state + 24, true) === 2) {
        memory.setUint8(state + 54, 1);
      }
      memory.setUint32(state + 44, 4, true);
    },
  });
}
