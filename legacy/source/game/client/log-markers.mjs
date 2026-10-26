/** Recovered client log marker (original 2380).
 *
 * Emits the fixed 31466 message through 630 and marks the current target.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2380]);

export function createLogMarkerHooks(runtime) {
  return Object.freeze({
    2380(source) {
      const view = new DataView(runtime.memory.buffer);
      const target = view.getUint32((source >>> 0) + 4, true);
      runtime.call(630, 31466);
      view.setUint8((target + 7343000) >>> 0, 1);
    },
  });
}
