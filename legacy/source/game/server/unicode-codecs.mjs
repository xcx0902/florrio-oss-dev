/** Recovered sp_server Unicode codecs (original functions 487 and 488).
 *
 * Both are cursor-based converters with the same eight-argument ABI as the
 * recovered 485/486 family:
 *
 *   codec(frame, scratch, source, sourceEnd, sourceCursorOut,
 *         destination, destinationEnd, destinationCursorOut)
 *
 * The first two arguments are unused: the native body overwrites `frame` with
 * the global stack pointer, stores the source and destination cursors at
 * stack_pointer-4 and stack_pointer-8, and writes the final cursors through the
 * two out-pointers.
 *
 * 487 decodes UTF-8 into UTF-32 (one little-endian u32 per code point). It
 * returns 0 when the source is exhausted, 1 when the destination has no room
 * or the final sequence is truncated, and 2 for an invalid UTF-8 sequence.
 * The capacity test is per 32-bit slot, not per byte: a slot is written whole
 * even when fewer than four bytes remain before destinationEnd.
 *
 * 488 encodes UTF-32 code points as UTF-8. It stops with 0 at end of source,
 * 1 when the destination cannot hold the next complete sequence (nothing of
 * that sequence is written), and 2 for a surrogate or a value above U+10FFFF.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([487, 488]);

const TRUNCATED = 1;
const INVALID_CODE_POINT = 2;
const MAX_CODE_POINT = 0x10ffff;

function isContinuation(byte) {
  return (byte & 0xc0) === 0x80;
}

export function createUnicodeCodecHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 487: decode UTF-8 source into UTF-32 code points. */
  function decodeUtf8ToUtf32(_frame, _scratch, source, sourceEnd, sourceCursorOut,
    destination, destinationEnd, destinationCursorOut) {
    try {
      const memory = memoryView();
      let read = source >>> 0;
      let write = destination >>> 0;
      const readEnd = sourceEnd >>> 0;
      const writeEnd = destinationEnd >>> 0;
      const frameBase = ((runtime.stackPointer.value >>> 0) - 16) >>> 0;
      memory.setUint32((frameBase + 12) >>> 0, read, true);
      memory.setUint32((frameBase + 8) >>> 0, write, true);

      let result = 0;
      while (read < readEnd) {
        if (write >= writeEnd) { result = 1; break; }
        const lead = memory.getUint8(read);
        let codePoint, length;
        if (lead < 0x80) {
          codePoint = lead;
          length = 1;
        } else if (lead < 0xc2) {
          result = 2;
          break;
        } else if (lead <= 0xdf) {
          if (readEnd - read < 2) { result = 1; break; }
          const second = memory.getUint8(read + 1);
          if (!isContinuation(second)) { result = 2; break; }
          codePoint = (lead << 6 & 0x7c0) | (second & 0x3f);
          length = 2;
        } else if (lead <= 0xef) {
          if (readEnd - read < 3) { result = 1; break; }
          const second = memory.getUint8(read + 1);
          const third = memory.getUint8(read + 2);
          if (lead === 0xe0) {
            if ((second & 0xe0) !== 0xa0) { result = 2; break; }
          } else if (lead === 0xed) {
            if ((second & 0xe0) !== 0x80) { result = 2; break; }
          } else if (!isContinuation(second)) { result = 2; break; }
          if (!isContinuation(third)) { result = 2; break; }
          codePoint = ((lead << 12) & 0xf000) | ((second & 0x3f) << 6) | (third & 0x3f);
          length = 3;
        } else if (lead <= 0xf4) {
          if (readEnd - read < 4) { result = 1; break; }
          const second = memory.getUint8(read + 1);
          const third = memory.getUint8(read + 2);
          const fourth = memory.getUint8(read + 3);
          if (lead === 0xf0) {
            if (((second + 0x70) & 0xff) >= 0x30) { result = 2; break; }
          } else if (lead === 0xf4) {
            if ((second & 0xf0) !== 0x80) { result = 2; break; }
          } else if (!isContinuation(second)) { result = 2; break; }
          if (!isContinuation(third) || !isContinuation(fourth)) { result = 2; break; }
          codePoint = (((lead << 18) & 0x1c0000) | ((second & 0x3f) << 12)
            | ((third & 0x3f) << 6) | (fourth & 0x3f)) >>> 0;
          if (codePoint > MAX_CODE_POINT) { result = 2; break; }
          length = 4;
        } else {
          result = 2;
          break;
        }
        memory.setUint32(write, codePoint, true);
        read += length;
        write += 4;
      }
      memory.setUint32((frameBase + 12) >>> 0, read, true);
      memory.setUint32((frameBase + 8) >>> 0, write, true);
      memory.setUint32(sourceCursorOut >>> 0, read, true);
      memory.setUint32(destinationCursorOut >>> 0, write, true);
      return result;
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  /** Original 488: encode UTF-32 code points as UTF-8. */
  function encodeUtf32ToUtf8(_frame, _scratch, source, sourceEnd, sourceCursorOut,
    destination, destinationEnd, destinationCursorOut) {
    try {
      const memory = memoryView();
      let read = source >>> 0;
      let write = destination >>> 0;
      const readEnd = sourceEnd >>> 0;
      const writeEnd = destinationEnd >>> 0;
      const frameBase = ((runtime.stackPointer.value >>> 0) - 16) >>> 0;
      memory.setUint32((frameBase + 12) >>> 0, read, true);
      memory.setUint32((frameBase + 8) >>> 0, write, true);

      let result = 0;
      for (;;) {
        if (read >= readEnd) { result = 0; break; }
        const codePoint = memory.getUint32(read, true) >>> 0;
        if ((codePoint & 0xfffff800) === 0xd800 || codePoint > MAX_CODE_POINT) {
          result = INVALID_CODE_POINT; break;
        }
        if (codePoint <= 0x7f) {
          if (((writeEnd - write) | 0) < 1) { result = TRUNCATED; break; }
          memory.setUint8(write, codePoint); write += 1;
        } else if (codePoint <= 0x7ff) {
          if (((writeEnd - write) | 0) < 2) { result = TRUNCATED; break; }
          memory.setUint8(write, 0xc0 | (codePoint >>> 6));
          memory.setUint8(write + 1, 0x80 | (codePoint & 0x3f));
          write += 2;
        } else if (codePoint <= 0xffff) {
          if (((writeEnd - write) | 0) < 3) { result = TRUNCATED; break; }
          memory.setUint8(write, 0xe0 | (codePoint >>> 12));
          memory.setUint8(write + 1, 0x80 | ((codePoint >>> 6) & 0x3f));
          memory.setUint8(write + 2, 0x80 | (codePoint & 0x3f));
          write += 3;
        } else {
          if (((writeEnd - write) | 0) < 4) { result = TRUNCATED; break; }
          memory.setUint8(write, 0xf0 | (codePoint >>> 18));
          memory.setUint8(write + 1, 0x80 | ((codePoint >>> 12) & 0x3f));
          memory.setUint8(write + 2, 0x80 | ((codePoint >>> 6) & 0x3f));
          memory.setUint8(write + 3, 0x80 | (codePoint & 0x3f));
          write += 4;
        }
        read += 4;
      }

      memory.setUint32((frameBase + 12) >>> 0, read, true);
      memory.setUint32((frameBase + 8) >>> 0, write, true);
      memory.setUint32(sourceCursorOut >>> 0, read, true);
      memory.setUint32(destinationCursorOut >>> 0, write, true);
      return result;
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({487: decodeUtf8ToUtf32, 488: encodeUtf32ToUtf8});
}
