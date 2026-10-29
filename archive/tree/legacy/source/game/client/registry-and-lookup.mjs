/** Recovered client registry lookups and static cleanup (originals 637,943,995,2640).
 *
 * 943 reads a validated field from the global registry. 995 resolves a case-folded
 * key through a linked table. 637 copies a byte range and returns the end pointer.
 * 2640 releases sixteen static buffers.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const staticBuffers = Array.from({length: 16}, (_, index) => 163528 - index * 216);

export const functionIds = Object.freeze([637, 943, 995, 2640]);

export function createRegistryAndLookupHooks(runtime) {
  return Object.freeze({
    637(source, limit, destination) {
      const length = (limit - source) | 0;
      if (length !== 0) runtime.call(422, destination, source, length);
      return (destination + length) | 0;
    },
    943(record) {
      const view = new DataView(runtime.memory.buffer);
      const registry = view.getUint32(7944488, true);
      if (registry === 0) {
        runtime.call(364, 17911, 0);
        return 0;
      }
      if (record !== 0 && view.getUint32(record >>> 0, true) !== registry + 316) {
        runtime.call(364, 6459, 0);
        return 0;
      }
      return view.getUint32((record >>> 0) + 48, true);
    },
    995(key) {
      const view = new DataView(runtime.memory.buffer);
      if (key === 0 || view.getUint8(key >>> 0) === 0) return 0;
      const weight = runtime.call(408, key >>> 0);
      let node = view.getUint32(7940368, true);
      while (node !== 0) {
        if (runtime.call(365, key >>> 0, view.getUint32(node, true)) === 0) {
          if (weight !== 0 && view.getUint32(node + 8, true) !== 2) break;
          return view.getUint32(node + 4, true);
        }
        node = view.getUint32(node + 16, true);
      }
      return weight;
    },
    2640() {
      for (const buffer of staticBuffers) runtime.call(377, buffer);
    },
  });
}
