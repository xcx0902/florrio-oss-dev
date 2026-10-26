/** Recovered client initializer and flag slots (originals 559,862,898,1019,1022).
 *
 * Virtual-base destructors, a signed-byte view accessor, a slot invalidation and
 * a flag-consistency assertion.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const at = (base, offset = 0) => (base >>> 0) + offset;

export const functionIds = Object.freeze([559, 862, 898, 1019, 1022]);

export function createInitializerAndFlagHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  const u32 = address => memoryView().getUint32(address >>> 0, true);

  return Object.freeze({
    559(record) {
      memoryView().setUint32(record >>> 0, 33088, true);
      runtime.call(377, at(record, 608));
      runtime.call(377, at(record, 368));
      runtime.call(377, record);
      return record;
    },
    862(destination, source) {
      const value = (runtime.call(899, u32(source)) << 24) >> 24;
      memoryView().setUint32(at(destination, 4), u32(source), true);
      memoryView().setUint8(destination, value);
    },
    898(holder, value) {
      const stored = u32(holder);
      if (stored !== 0 && runtime.call(902, stored, value) === -1)
        memoryView().setUint32(holder, 0, true);
    },
    1019(record, flags) {
      const combined = (u32(at(record, 24)) === 0 ? 1 : 0) | flags;
      memoryView().setUint32(at(record, 16), combined, true);
      if ((u32(at(record, 20)) & combined) !== 0) {
        runtime.call(406);
        throw new WebAssembly.RuntimeError('unreachable');
      }
    },
    1022(record) {
      const memory = memoryView();
      memory.setUint32(record >>> 0, 120908, true);
      runtime.call(909, at(record, 4));
      for (const offset of [24, 16, 8]) memory.setBigUint64(at(record, offset), 0n, true);
      return record;
    },
  });
}
