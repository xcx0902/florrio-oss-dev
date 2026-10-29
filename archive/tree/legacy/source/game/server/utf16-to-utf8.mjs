/** Recovered sp_server UTF-16 to UTF-8 transcoder (original function 485).
 *
 * The original is a cursor-based converter with two caller-visible cursors:
 *
 *   transcode(frame, unit, source, sourceEnd,
 *             sourceCursorOut, destination, destinationEnd, destinationCursorOut)
 *
 * The first two parameters are unused: the native body overwrites `frame`
 * with the global stack pointer before reading it, and `unit` is scratch. The
 * two cursor locals therefore live in the native stack frame below the
 * current stack pointer. `source` and `destination` are byte
 * addresses; the two `*Out` pointers receive the final cursors. The function
 * consumes one UTF-16 code unit per step and one extra unit for a surrogate
 * pair. It stops with:
 *
 *   0 - source exhausted;
 *   1 - source truncated inside a surrogate pair, or destination capacity
 *       too small for the next complete UTF-8 sequence;
 *   2 - unpaired high surrogate, unpaired low surrogate, or a high surrogate
 *       followed by a non-low-surrogate unit.
 *
 * Each unit is written atomically: capacity is checked before any byte of the
 * sequence is stored.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([485]);

const TRUNCATED = 1;
const INVALID_SURROGATE = 2;
const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;
const LOW_SURROGATE_START = 0xdc00;

export function createUtf16ToUtf8Hook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /**
   * Original 485. The native body stores its source/destination cursor
   * locals at stack_pointer-4 and stack_pointer-8; mirroring them preserves
   * the complete memory image.
   */
  function transcodeUtf16ToUtf8(_frame, _scratch, source, sourceEnd, sourceCursorOut,
    destination, destinationEnd, destinationCursorOut) {
    try {
      const view = dataView();
      let read = source >>> 0;
      let write = destination >>> 0;
      const end = sourceEnd >>> 0;
      const writeEnd = destinationEnd >>> 0;
      const frameBase = (runtime.stackPointer.value >>> 0) - 16;
      view.setUint32((frameBase + 12) >>> 0, read, true);
      view.setUint32((frameBase + 8) >>> 0, write, true);

      let result = 0;
      for (;;) {
        if (read >= end) {
          result = 0;
          break;
        }
        const unit = view.getUint16(read, true);
        if (unit <= 0x7f) {
          if (((writeEnd - write) | 0) < 1) { result = TRUNCATED; break; }
          view.setUint8(write, unit);
          write++;
        } else if (unit <= 0x7ff) {
          if (((writeEnd - write) | 0) < 2) { result = TRUNCATED; break; }
          view.setUint8(write, 0xc0 | (unit >>> 6));
          view.setUint8(write + 1, 0x80 | (unit & 0x3f));
          write += 2;
        } else if (unit <= 0xd7ff || unit >= 0xe000) {
          if (((writeEnd - write) | 0) < 3) { result = TRUNCATED; break; }
          view.setUint8(write, 0xe0 | (unit >>> 12));
          view.setUint8(write + 1, 0x80 | ((unit >>> 6) & 0x3f));
          view.setUint8(write + 2, 0x80 | (unit & 0x3f));
          write += 3;
        } else if (unit <= HIGH_SURROGATE_END) {
          // A pair needs four source bytes (two code units).
          if (((end - read) | 0) < 4) { result = TRUNCATED; break; }
          const low = view.getUint16(read + 2, true);
          if ((low & 0xfc00) !== 0xdc00) { result = INVALID_SURROGATE; break; }
          if (((writeEnd - write) | 0) < 4) { result = TRUNCATED; break; }
          const codePoint = 0x10000 + ((unit - HIGH_SURROGATE_START) << 10)
            + (low - LOW_SURROGATE_START);
          view.setUint8(write, 0xf0 | (codePoint >>> 18));
          view.setUint8(write + 1, 0x80 | ((codePoint >>> 12) & 0x3f));
          view.setUint8(write + 2, 0x80 | ((codePoint >>> 6) & 0x3f));
          view.setUint8(write + 3, 0x80 | (codePoint & 0x3f));
          write += 4;
          read += 2;
        } else {
          // Unpaired low surrogate (0xdc00..0xdfff).
          result = INVALID_SURROGATE;
          break;
        }
        read += 2;
      }

      view.setUint32((frameBase + 12) >>> 0, read, true);
      view.setUint32((frameBase + 8) >>> 0, write, true);
      view.setUint32(sourceCursorOut >>> 0, read, true);
      view.setUint32(destinationCursorOut >>> 0, write, true);
      return result;
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({485: transcodeUtf16ToUtf8});
}
