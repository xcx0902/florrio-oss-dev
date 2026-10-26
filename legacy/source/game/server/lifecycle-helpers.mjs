/** Recovered sp_server lifecycle helpers (original functions 653 and 117).
 *
 * 653 `destroyLocalServerString` is the destructor of the process-local server
 * name string: when the sign byte at 8559275 marks a heap-allocated buffer, the
 * pointer at 8559264 is released. Small-string optimisation leaves it alone.
 *
 * 117 `returnTrue` is a default virtual predicate that always answers true.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([117, 653]);
export const dependencyIds = Object.freeze([14, 16]);
const STRING_FLAG = 8559275;
const STRING_POINTER = 8559264;

export function createLifecycleHelperHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 653: release the server-name string when it owns its storage. */
  function destroyLocalServerString(_unused) {
    const flag = dataView().getInt8(STRING_FLAG);
    if (flag <= -1) runtime.call(14, dataView().getUint32(STRING_POINTER, true) >>> 0);
  }

  /** Original 117: default predicate returning true. */
  function returnTrue(_unused) {
    return 1;
  }

  return Object.freeze({117: returnTrue, 653: destroyLocalServerString});
}
