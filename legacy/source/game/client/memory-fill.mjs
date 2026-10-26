/** Complete original client fillMemory382 (the libc memset used by the app).
 * The original writes the first and last bytes before entering each widening
 * stage, then fills the aligned interior with 32-bit and 64-bit stores. Keeping
 * that order preserves partial writes when an invalid pointer traps.
 */
export const functionIds = Object.freeze([382, 865]);

export function createClientMemoryFillHooks(runtime) {
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
  function writeByte(base, value, offset = 0) {
    const location = address(base, offset, 1);
    view.setUint8(location, value);
  }
  function writeWord(base, value, offset = 0) {
    const location = address(base, offset, 4);
    view.setUint32(location, value, true);
  }
  /** Original382: fill count bytes with the low byte of value and return pointer. */
  function fillMemory(pointer, value, count) {
    const start = pointer >>> 0, length = count >>> 0;
    if (length === 0) return pointer;
    const byte = value & 255;
    const end = (start + length) >>> 0;
    writeByte(end - 1, byte);
    writeByte(start, byte);
    if (length < 3) return pointer;
    writeByte(end - 2, byte);
    writeByte(start, byte, 1);
    writeByte(end - 3, byte);
    writeByte(start, byte, 2);
    if (length < 7) return pointer;
    writeByte(end - 4, byte);
    writeByte(start, byte, 3);
    if (length < 9) return pointer;

    const misalignment = (-start) & 3;
    const aligned = (start + misalignment) >>> 0;
    const word = Math.imul(byte, 16843009) >>> 0;
    writeWord(aligned, word);
    const roundedLength = ((length - misalignment) >>> 0) & 0xfffffffc;
    const alignedEnd = (aligned + roundedLength) >>> 0;
    writeWord((alignedEnd - 4) >>> 0, word);
    if (roundedLength < 9) return pointer;
    writeWord(aligned, word, 4);
    writeWord(aligned, word, 8);
    writeWord((alignedEnd - 8) >>> 0, word);
    writeWord((alignedEnd - 12) >>> 0, word);
    if (roundedLength < 25) return pointer;
    writeWord(aligned, word, 12);
    writeWord(aligned, word, 16);
    writeWord(aligned, word, 20);
    writeWord(aligned, word, 24);
    writeWord((alignedEnd - 16) >>> 0, word);
    writeWord((alignedEnd - 20) >>> 0, word);
    writeWord((alignedEnd - 24) >>> 0, word);
    writeWord((alignedEnd - 28) >>> 0, word);

    const skip = (aligned & 4) | 24;
    let remaining = (roundedLength - skip) >>> 0;
    if (remaining < 32) return pointer;
    let cursor = (aligned + skip) >>> 0;
    do {
      // The original multiplies the zero-extended word by 0x1_0000_0001,
      // making both halves of each 64-bit store the same word.
      writeWord(cursor, word);
      writeWord(cursor, word, 4);
      writeWord(cursor, word, 8);
      writeWord(cursor, word, 12);
      writeWord(cursor, word, 16);
      writeWord(cursor, word, 20);
      writeWord(cursor, word, 24);
      writeWord(cursor, word, 28);
      cursor = (cursor + 32) >>> 0;
      remaining = (remaining - 32) >>> 0;
    } while (remaining > 31);
    return pointer;
  }
  /** Original865: expose the same fill with (pointer, count, byte) argument order. */
  function fillMemoryByte(pointer, count, value) {
    return fillMemory(pointer, value & 255, count);
  }
  return Object.freeze({382: fillMemory, 865: fillMemoryByte});
}
