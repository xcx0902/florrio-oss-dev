/** Complete original client memory copy363, byte comparison366 and f64 round373.
 * Byte/word transfer order is observable for overlap and traps. Large copies
 * retain the published JavaScript copyWithin import and its typed return coercion.
 */
export const functionIds = Object.freeze([363, 366, 373]);
const add = (left, right) => (left + right) >>> 0;

export function createClientRuntimePrimitiveHooks(runtime) {
  let buffer, view;
  function address(base, offset, size) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    const location = (base >>> 0) + offset;
    if (location + size > view.byteLength)
      throw new WebAssembly.RuntimeError('memory access out of bounds');
    return location;
  }
  // Resolve the address before dereferencing the refreshed DataView.
  function readByte(base, offset = 0) {
    const location = address(base, offset, 1);
    return view.getUint8(location);
  }
  function writeByte(base, value, offset = 0) {
    const location = address(base, offset, 1);
    view.setUint8(location, value);
  }
  function readWord(base, offset = 0) {
    const location = address(base, offset, 4);
    return view.getUint32(location, true);
  }
  function writeWord(base, value, offset = 0) {
    const location = address(base, offset, 4);
    view.setUint32(location, value, true);
  }
  /** Original363: forward byte/aligned-word copy below 512 bytes. */
  function copyMemory(destination, source, length) {
    destination >>>= 0; source >>>= 0; length >>>= 0;
    if (length >= 512) {
      // WASM imports apply ToNumber before i32 narrowing; unary+ also preserves
      // the native TypeError when a replaced host returns BigInt.
      void (+runtime.host('a', 'Fa', destination | 0, source | 0, length | 0) | 0);
      return destination | 0;
    }
    const end = add(destination, length);
    let cursor = destination;
    if (!((destination ^ source) & 3)) {
      if ((cursor & 3) && length > 0) {
        do {
          writeByte(cursor, readByte(source));
          source = add(source, 1); cursor = add(cursor, 1);
        } while ((cursor & 3) && cursor < end);
      }
      const alignedEnd = (end & -4) >>> 0;
      if (alignedEnd >= 64) {
        const lastBlock = add(alignedEnd, -64);
        if (cursor <= lastBlock) {
          do {
            for (let offset = 0; offset < 64; offset += 4)
              writeWord(cursor, readWord(source, offset), offset);
            source = add(source, 64); cursor = add(cursor, 64);
          } while (cursor <= lastBlock);
        }
      }
      if (cursor < alignedEnd) {
        do {
          writeWord(cursor, readWord(source));
          source = add(source, 4); cursor = add(cursor, 4);
        } while (cursor < alignedEnd);
      }
    } else if (end >= 4) {
      const lastGroup = add(end, -4);
      if (destination <= lastGroup) {
        do {
          for (let offset = 0; offset < 4; offset++)
            writeByte(cursor, readByte(source, offset), offset);
          source = add(source, 4); cursor = add(cursor, 4);
        } while (cursor <= lastGroup);
      }
    }
    if (cursor < end) {
      do {
        writeByte(cursor, readByte(source));
        source = add(source, 1); cursor = add(cursor, 1);
      } while (cursor !== end);
    }
    return destination | 0;
  }
  /** Original366: return the first unsigned-byte difference; zero count reads nothing. */
  function compareMemory(left, right, length) {
    left >>>= 0; right >>>= 0; length >>>= 0;
    while (length) {
      const first = readByte(left), second = readByte(right);
      if (first !== second) return first - second;
      left = add(left, 1); right = add(right, 1); length = add(length, -1);
    }
    return 0;
  }
  /** Original373: nearest f64 integer, half ties away from zero, retaining signed zero. */
  function roundF64(value) {
    value = +value;
    const magnitude = Math.abs(value);
    if (magnitude < .5) return value * 0;
    if (!(magnitude < 4503599627370496)) return value;
    const integral = Math.floor(magnitude), fraction = magnitude - integral;
    const rounded = integral + (fraction >= .5 ? 1 : 0);
    return value < 0 ? -rounded : rounded;
  }
  return Object.freeze({363: copyMemory, 366: compareMemory, 373: roundF64});
}
