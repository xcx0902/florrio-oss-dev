/** Recovered sp_server mbrtowc (original function 184).
 *
 * Decodes one multibyte character from `bytes` into `codePoint` (or a stack
 * scratch word when the destination is null). The conversion uses three
 * states:
 *
 * - C locale (the default): every non-ASCII byte is stored unchanged with the
 *   `0x2000` bit cleared, and one byte is consumed.
 * - UTF-8: strict shortest-form UTF-8. Leads C2..F4 are accepted; overlong
 *   encodings, surrogates, values above U+10FFFF and malformed continuations
 *   are rejected.
 * - A partial character is persisted in `state` as an encoded accumulator:
 *   its high bits remember the allowed range of the next continuation byte
 *   and its low bits accumulate the code point. The same encoded word is
 *   written back to the caller's state block, so a later call resumes exactly
 *   where this one stopped.
 *
 * Return values: -2 incomplete, -1 invalid, 0 for a decoded NUL, otherwise
 * the number of bytes consumed by this call.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([184]);
export const STATIC_STATE = 8570440;
const ERRNO_CELL = 8569384;
const EILSEQ = 25;
const LOCALE_POINTER_CELL = 22540;

const C0000000 = 0xc0000000;
const C3000000 = 0xc3000000;
const C30C0000 = 0xc30c0000;

export function createMbrtowcHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Initial accumulator for a UTF-8 lead byte, encoding its legal range. */
  function initialState(lead) {
    if (lead <= 0xdf) return (C0000000 | (lead & 0x1f)) >>> 0;
    if (lead === 0xe0) return 0xb3000000;
    if (lead === 0xed) return 0xd300000d;
    if (lead <= 0xef) return (C3000000 | (lead & 0x0f)) >>> 0;
    if (lead === 0xf0) return 0xbb0c0000;
    if (lead === 0xf4) return 0xd30c0004;
    return (C30C0000 | (lead & 0x03)) >>> 0;
  }

  /** Whether `byte` is a legal continuation for the encoded accumulator. */
  function continuationAllowed(accumulator, byte) {
    const high = byte >> 3;
    const range = ((high - 16) | (((accumulator | 0) >> 26) + high)) >>> 0;
    return range <= 7;
  }

  function isUtf8Locale(view) {
    const locale = view.getUint32(LOCALE_POINTER_CELL, true) >>> 0;
    return view.getUint32(locale, true) !== 0;
  }

  /** Original 184: mbrtowc(codePoint, bytes, count, state). */
  function mbrtowc(codePoint, bytes, count, statePointer) {
    try {
      const view = dataView();
      const stateCell = statePointer === 0 ? STATIC_STATE : statePointer >>> 0;
      let accumulator = view.getUint32(stateCell, true);

      // A null input pointer probes or resets the state.
      if (bytes === 0) {
        if (accumulator !== 0) {
          view.setUint32(stateCell, 0, true);
          view.setUint32(ERRNO_CELL, EILSEQ, true);
          return -1;
        }
        return 0;
      }

      if (count === 0) return -2;

      const destination = codePoint === 0
        ? (runtime.stackPointer.value - 4) >>> 0
        : codePoint >>> 0;
      const utf8 = isUtf8Locale(view);
      let remaining = count >>> 0;
      let cursor = bytes >>> 0;

      if (accumulator === 0) {
        const first = view.getUint8(cursor);
        const signed = (first << 24) >> 24;
        if (signed >= 0) {
          view.setUint32(destination, first, true);
          return signed === 0 ? 0 : 1;
        }
        if (!utf8) {
          view.setUint32(destination, signed & 57343, true);
          return 1;
        }
        if (first < 0xc2 || first > 0xf4) {
          view.setUint32(stateCell, 0, true);
          view.setUint32(ERRNO_CELL, EILSEQ, true);
          return -1;
        }
        accumulator = initialState(first);
        remaining--;
        if (remaining === 0) {
          view.setUint32(stateCell, accumulator, true);
          return -2;
        }
        cursor++;
      }

      for (;;) {
        let byte = view.getUint8(cursor);
        if (!continuationAllowed(accumulator, byte)) {
          view.setUint32(stateCell, 0, true);
          view.setUint32(ERRNO_CELL, EILSEQ, true);
          return -1;
        }
        for (;;) {
          remaining--;
          accumulator = ((byte - 128) | (accumulator << 6)) | 0;
          if (accumulator >= 0) {
            view.setUint32(stateCell, 0, true);
            view.setUint32(destination, accumulator, true);
            return (count - remaining) >>> 0;
          }
          if (remaining === 0) {
            view.setUint32(stateCell, accumulator >>> 0, true);
            return -2;
          }
          cursor++;
          byte = view.getUint8(cursor);
          if ((byte & 0xc0) === 0x80) continue;
          view.setUint32(stateCell, 0, true);
          view.setUint32(ERRNO_CELL, EILSEQ, true);
          return -1;
        }
      }
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({184: mbrtowc});
}
