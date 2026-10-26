/** Recovered client accessors and flag helpers (originals 424,425,445,446,567,
 * 569,854,855,859,860,910,984,1947,1948,2051,2068).
 *
 * These slots load one object field, combine a boolean flag, or forward a biased
 * object pointer or a fixed data address to a shared helper.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const at = (base, offset = 0) => (base >>> 0) + offset;

export const functionIds = Object.freeze([
  424, 425, 445, 446, 567, 569, 854, 855, 859, 860, 910, 984, 1947, 1948, 2051, 2068,
]);

export function createClientSmallAccessorHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  const i32 = address => memoryView().getInt32(address >>> 0, true);

  return Object.freeze({
    424(record) {
      runtime.call(899, i32(record));
      return record;
    },
    425(record) {
      runtime.call(903, i32(record));
      return record;
    },
    445(first, second) { return runtime.call(901, first, second) ^ 1; },
    446(first, second) { return runtime.call(905, first, second) ^ 1; },
    567(pointer) { return runtime.call(518, pointer, 7945940); },
    569(pointer) { return runtime.call(518, pointer, 7945932); },
    854(pointer) { return runtime.call(518, pointer, 7945784); },
    855(pointer) { return runtime.call(518, pointer, 7945792); },
    859(pointer) { return runtime.call(518, pointer, 7945768); },
    860(pointer) { return runtime.call(518, pointer, 7945776); },
    910(record) { runtime.call(1019, record, i32(at(record, 16)) | 1); },
    984(record) { return runtime.call(772, record, 0); },
    1947(record) { runtime.call(726, at(record, -8)); },
    1948(record) { return runtime.call(646, at(record, -8)); },
    2051(record) { runtime.call(1091, i32(at(record, 188))); },
    2068(_unused, record) { runtime.call(383, i32(at(record, 76))); },
  });
}
