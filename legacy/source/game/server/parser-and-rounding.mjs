/** Recovered sp_server parser/format/rounding primitives (70, 82, 110, 212).
 *
 * 70 skips a numeric prefix ('+'/'-' and "0x"). 82 updates the iostream error
 * word at 22540 and writes the previous state. 110 writes sign/alternate
 * prefixes, the digit string and the base suffix. 212 is roundf: values with
 * exponent > 149 pass through, exponent <= 125 collapses to signed zero, and
 * the remaining range rounds through the 2^23 add/subtract trick.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([70, 82, 110, 212]);

export function createParserAndRoundingHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    70(start, end, flagsPointer) {
      const memory = memoryView();
      const flags = memory.getUint32((flagsPointer >>> 0) + 4, true) & 176;
      let cursor = start >>> 0;
      if (flags === 32) return end;
      if (flags === 16) {
        const first = memory.getUint8(cursor);
        if (first === 43 || first === 45) return cursor + 1;
        if ((end >>> 0) - cursor >= 2 && first === 48
            && (memory.getUint8(cursor + 1) | 32) === 120) {
          cursor += 2;
        }
      }
      return cursor;
    },
    82(output, source) {
      const memory = memoryView();
      const previous = memory.getUint32(22540, true);
      const value = memory.getUint32(source >>> 0, true);
      if (value !== 0) memory.setUint32(22540, (value === 0xffffffff ? 8570492 : value) >>> 0, true);
      memory.setUint32(output >>> 0, (previous === 8570492 ? 0xffffffff : previous) >>> 0, true);
      return output;
    },
    110(output, text, uppercase, flags) {
      const memory = memoryView();
      let cursor = output >>> 0;
      if (flags & 2048) { memory.setUint8(cursor, 43); cursor++; }
      if (flags & 512) { memory.setUint8(cursor, 35); cursor++; }
      for (let source = text >>> 0; memory.getUint8(source) !== 0; source++) {
        memory.setUint8(cursor, memory.getUint8(source));
        cursor++;
      }
      const base = flags & 74;
      let suffix = 111;
      if (base === 64) suffix = 111;
      else if (base === 8) suffix = (flags & 16384) ? 120 : 88;
      else suffix = uppercase ? 100 : 117;
      memory.setUint8(cursor, suffix);
    },
    212(value) {
      const x = Math.fround(value);
      const buffer32 = new ArrayBuffer(4);
      const view32 = new DataView(buffer32);
      view32.setFloat32(0, x, true);
      const raw = view32.getInt32(0, true);
      const exponent = (raw >>> 23) & 255;
      if (exponent > 149) return x;
      if (exponent <= 125) return Math.fround(x * 0);
      const magnitude = raw > -1 ? x : -x;
      const fraction = Math.fround(Math.fround(magnitude + 8388608) - 8388608) - magnitude;
      let rounded;
      if (fraction > 0.5) rounded = Math.fround(magnitude + fraction - 1);
      else {
        const shifted = Math.fround(magnitude + fraction);
        rounded = fraction <= -0.5 ? Math.fround(shifted + 1) : shifted;
      }
      return raw > -1 ? rounded : -rounded;
    },
  });
}
