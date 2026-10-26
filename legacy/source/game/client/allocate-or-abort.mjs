/** Recovered client allocating bridge (original 371).
 *
 * A zero size is promoted to one byte, the request goes through malloc (368) and
 * an allocation failure reports through 1 before trapping.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([371]);

export function createAllocateOrAbortHook(runtime) {
  return Object.freeze({
    371(size) {
      const pointer = runtime.call(368, size === 0 ? 1 : size);
      if (pointer === 0) {
        runtime.call(1);
        throw new WebAssembly.RuntimeError('unreachable');
      }
      return pointer;
    },
  });
}
