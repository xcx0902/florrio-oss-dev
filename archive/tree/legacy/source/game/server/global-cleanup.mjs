/** Recovered sp_server global cleanup helpers (original 436, 441, 646, 721).
 *
 * 436 releases the global buffer at 8555164 and clears the pair at 8555156.
 * 441 does the same for 8551052/8551044. 646 closes the descriptor at +60 and
 * returns the close result. 721 releases the pointer at +24 and clears +16..+24.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([436, 441, 646, 721]);

export function createGlobalCleanupHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function releaseGlobal(pointerAddress, pairAddress) {
    const memory = memoryView();
    runtime.call(14, memory.getUint32(pointerAddress, true));
    memory.setBigUint64(pairAddress, 0n, true);
    memory.setUint32(pointerAddress, 0, true);
  }

  return Object.freeze({
    436() {
      releaseGlobal(8555164, 8555156);
    },
    441() {
      releaseGlobal(8551052, 8551044);
    },
    646(state) {
      return runtime.call(10, memoryView().getUint32((state >>> 0) + 60, true));
    },
    721(record) {
      const memory = memoryView();
      runtime.call(14, memory.getUint32((record >>> 0) + 24, true));
      memory.setBigUint64((record >>> 0) + 16, 0n, true);
      memory.setUint32((record >>> 0) + 24, 0, true);
    },
  });
}
