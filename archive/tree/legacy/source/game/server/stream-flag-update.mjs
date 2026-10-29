/** Recovered sp_server stream flag update (original 240).
 *
 * ORs the requested flags at +16 with the argument and applies the combined
 * mask through 386.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([240]);

export function createStreamFlagUpdateHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    240(state, flags) {
      const current = memoryView().getUint32((state >>> 0) + 16, true);
      runtime.call(386, state, current | (flags >>> 0));
    },
  });
}
