/** Recovered client vector accessor (original 518).
 *
 * Bounds-checks an index through 414 and aborts through 406 when the slot is absent.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([518]);

export function createVectorHelperHooks(runtime) {
  return Object.freeze({
    518(vector, index) {
      const view = new DataView(runtime.memory.buffer);
      const base = view.getUint32(vector >>> 0, true);
      const slot = runtime.call(414, index);
      const count = (view.getUint32(base + 20, true) - view.getUint32(base + 16, true)) >> 2;
      const present = slot < count ? view.getUint32(view.getUint32(base + 16, true) + slot * 4, true) !== 0 : false;
      if (!present) {
        runtime.call(406);
        throw new WebAssembly.RuntimeError('unreachable');
      }
      return view.getUint32(view.getUint32(base + 16, true) + slot * 4, true);
    },
  });
}
