/** Recovered client float field setters (originals 1982,2306,2307).
 *
 * 2306/2307 store a default 1.0 or the parsed numeric text into offsets 100/96.
 * 1982 aligns the cursor, joins two 64-bit halves through 810 and stores a double.
 * 772 joins the two halves produced by 731 and returns the double.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const at = (base, offset = 0) => (base >>> 0) + offset;

export const functionIds = Object.freeze([772, 1982, 2306, 2307]);

export function createFloatFieldSetterHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function scale(record, text, offset) {
    let value = 1;
    if (text !== 0 && memoryView().getUint8(text >>> 0) !== 0)
      value = Math.fround(runtime.call(984, text));
    memoryView().setFloat32(at(record, offset), value, true);
  }

  return Object.freeze({
    772(first, second) {
      const frame = runtime.stackPointer.value - 16;
      runtime.call(731, first, second, 1, frame);
      const memory = memoryView();
      return runtime.call(810, memory.getBigUint64(frame, true), memory.getBigUint64(frame + 8, true));
    },
    1982(destination, cursor) {
      const memory = memoryView();
      const aligned = (memory.getUint32(cursor >>> 0, true) + 15) & ~15;
      memory.setUint32(cursor >>> 0, aligned + 16, true);
      memory.setFloat64(destination >>> 0,
        runtime.call(810, memory.getBigUint64(aligned, true), memory.getBigUint64(aligned + 8, true)), true);
    },
    2306(record, _first, _second, text) {
      scale(record, text, 100);
    },
    2307(record, _first, _second, text) {
      scale(record, text, 96);
    },
  });
}
