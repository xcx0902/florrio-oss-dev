/** Recovered client flag/field helpers (originals 435,856,1992,2023,2031).
 *
 * These slots gate a format call on a flag bit, copy one refcounted field pair,
 * select a fallback descriptor, clear a cached pointer, or report a missing
 * definition.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const at = (base, offset = 0) => (base >>> 0) + offset;

export const functionIds = Object.freeze([435, 856, 1992, 2023, 2031]);

export function createFlagAndFieldHelperHooks(runtime) {
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
    435(flags, first, second) {
      if ((memoryView().getUint8(flags >>> 0) & 32) === 0) runtime.call(820, first, second, flags);
    },
    856(destination, source) {
      const count = runtime.call(899, u32(source));
      memoryView().setUint32(at(destination, 4), u32(source), true);
      memoryView().setUint32(destination, count, true);
    },
    1992(_first, first, second) {
      const flavour = u32(at(first, 0)) !== 0 ? 2 : 1;
      runtime.call(517, u32(at(second, 4)), flavour, 0, 0);
      return 0;
    },
    2023(_first, holder) {
      const cached = u32(at(holder, 144));
      runtime.call(383, u32(at(cached, 8)));
      memoryView().setUint32(at(cached, 8), 0, true);
    },
    2031(record) {
      const cached = u32(at(record, 992));
      if (cached === 0) {
        runtime.call(364, 17891, 0);
        return 0;
      }
      return u32(at(cached, 16));
    },
  });
}
