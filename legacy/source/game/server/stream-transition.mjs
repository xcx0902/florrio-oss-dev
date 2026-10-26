/** Recovered sp_server stream transition helper (original 221).
 *
 * Tracks the current token at +16 and the pending next token at +24:
 *
 * - no current token: record it, set the state byte at +36 and pending token;
 * - the same token repeats: only a pending mode of 2 is replaced;
 * - a different token: mark +54, switch pending mode to 2 and count the change
 *   at +36.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([221]);

export function createStreamTransitionHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    221(state, value, pending) {
      const memory = memoryView();
      const base = state >>> 0;
      const current = memory.getUint32(base + 16, true);
      if (current === 0) {
        memory.setUint32(base + 36, 1, true);
        memory.setUint32(base + 24, pending, true);
        memory.setUint32(base + 16, value, true);
        return;
      }
      if ((value >>> 0) === current) {
        if (memory.getUint32(base + 24, true) !== 2) return;
        memory.setUint32(base + 24, pending, true);
        return;
      }
      memory.setUint8(base + 54, 1);
      memory.setUint32(base + 24, 2, true);
      memory.setUint32(base + 36, (memory.getUint32(base + 36, true) + 1) >>> 0, true);
    },
  });
}
