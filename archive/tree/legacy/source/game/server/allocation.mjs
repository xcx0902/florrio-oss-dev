/** Recovered sp_server pointer-array allocation (original function 121).
 *
 * Allocates `count` 32-bit slots through the server's aborting operator new.
 * Counts at or above 2^30 are rejected through the abort routine, exactly like
 * the shipped array-new wrapper.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([121]);
export const dependencyIds = Object.freeze([20, 42]);
const MAX_ELEMENTS = 0x40000000;

export function createPointerArrayHook(runtime) {
  /** Original 121: allocate count 32-bit slots; abort at 2^30 or above. */
  function allocatePointerArray(count) {
    if ((count >>> 0) >= MAX_ELEMENTS) {
      runtime.call(42);
      throw new WebAssembly.RuntimeError('unreachable');
    }
    return runtime.call(20, (count * 4) | 0) | 0;
  }
  return Object.freeze({121: allocatePointerArray});
}
