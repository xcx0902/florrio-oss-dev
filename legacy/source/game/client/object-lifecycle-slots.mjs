/** Recovered client object lifecycle slots (22 originals).
 *
 * Virtual-base destructors, global static-table sweeps, equality helpers and
 * small guarded destructors that publish a vtable or forward a derived address.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const at = (base, offset = 0) => (base >>> 0) + offset;

export const functionIds = Object.freeze([
  715, 727, 839, 841, 842, 901, 905, 923, 1828, 1829, 1830,
  1944, 1946, 1960, 1961, 2427, 2451, 2694,
]);

export function createObjectLifecycleSlotHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  const u32 = address => memoryView().getUint32(address >>> 0, true);
  const set32 = (address, value) => memoryView().setUint32(address >>> 0, value, true);
  const sweep = (start, end, destructor) => {
    for (let cursor = start; cursor !== end;) {
      cursor -= 12;
      runtime.call(destructor, cursor);
    }
  };

  return Object.freeze({
    715(record) {
      const stored = u32(at(record, 8));
      if (stored !== runtime.call(405)) runtime.call(895, stored);
      return record;
    },
    727(record) {
      set32(record, 120972);
      runtime.call(381, at(record, 32));
      runtime.call(611, record);
      return record;
    },
    839(record) {
      set32(record, 126160);
      const stored = u32(at(record, 8));
      if (stored !== runtime.call(405)) runtime.call(895, stored);
      return record;
    },
    841(record) {
      set32(record, 126208);
      runtime.call(381, at(record, 12));
      return record;
    },
    842(record) {
      set32(record, 126248);
      runtime.call(381, at(record, 16));
      return record;
    },
    901(first, second) { return runtime.call(900, first) ^ runtime.call(900, second) ^ 1; },
    905(first, second) { return runtime.call(904, first) ^ runtime.call(904, second) ^ 1; },
    923(record, value) {
      if (record === 0) return 0;
      return runtime.call(543, record, value);
    },
    1828() { sweep(7946296, 7946128, 381); },
    1829() { sweep(7946768, 7946480, 381); },
    1830() { sweep(7947112, 7947088, 381); },
    1944(record) { runtime.call(726, at(record, u32(u32(record) - 12))); },
    1946(record) { return runtime.call(646, at(record, u32(u32(record) - 12))); },
    1960(record) { runtime.call(906, at(record, u32(u32(record) - 12))); },
    1961(record) { return runtime.call(728, at(record, u32(u32(record) - 12))); },
    2427(source, destination) {
      set32(destination, 90720);
      runtime.call(1024, at(destination, 8), at(source, 8));
    },
    2451(source, destination) {
      set32(destination, 90504);
      runtime.call(1026, at(destination, 8), at(source, 8));
    },
    2694(record) {
      if (memoryView().getUint8(at(record, 232)) !== 0) {
        runtime.call(460, at(record, 128));
        memoryView().setUint8(at(record, 232), 0);
      }
    },
  });
}
