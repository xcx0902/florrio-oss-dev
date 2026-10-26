/** Recovered client string utilities (originals 646,718).
 *
 * 646 publishes three vtables, initializes the stream at +12 and destroys the
 * base at +64. 470 stores a string with inline short storage or an allocated
 * long buffer. 718 copies a short string inline or delegates long storage to 470.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const at = (base, offset = 0) => (base >>> 0) + offset;

export const functionIds = Object.freeze([470, 646, 718]);

export function createClientStringUtilityHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    470(destination, source, length) {
      const memory = memoryView();
      if (length <= 10) {
        memory.setUint8(at(destination, 11), length);
        runtime.call(472, destination, source, length + 1);
        return;
      }
      if (length >= 0xfffffff0) {
        runtime.call(398);
        throw new WebAssembly.RuntimeError('unreachable');
      }
      const rounded = (length + 16) & ~15;
      const capacity = rounded - 1 === 11 ? rounded : rounded - 1;
      const size = capacity + 1;
      const data = runtime.call(371, size);
      memory.setUint32(destination, data, true);
      memory.setUint32(at(destination, 8), (size | 0x80000000) >>> 0, true);
      memory.setUint32(at(destination, 4), length, true);
      runtime.call(472, data, source, length + 1);
    },
    646(record) {
      const memory = memoryView();
      memory.setUint32(at(record, 64), 121508, true);
      memory.setUint32(record, 121468, true);
      memory.setUint32(at(record, 8), 121488, true);
      runtime.call(727, at(record, 12));
      runtime.call(673, at(record, 64));
      return record;
    },
    718(destination, source) {
      const memory = memoryView();
      if ((memory.getUint8(at(source, 11)) & 0x80) === 0) {
        memory.setBigUint64(at(destination, 8), memory.getBigUint64(at(source, 8), true), true);
        memory.setBigUint64(destination, memory.getBigUint64(source, true), true);
        return;
      }
      runtime.call(470, destination, memory.getUint32(source, true),
        memory.getUint32(at(source, 4), true));
    },
  });
}
