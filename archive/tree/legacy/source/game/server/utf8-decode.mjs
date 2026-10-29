/** Recovered sp_server UTF-8 prefix scanner (original function 486).
 *
 * Counts complete UTF-8 code points from `start` up to `end`, stopping after
 * `budget` code points or at the first invalid/truncated sequence, and returns
 * the number of bytes covered by those complete code points. The failing
 * sequence is never consumed. This is the code-point sibling of the recovered
 * 483 UTF-16-unit scanner; it writes no out-pointer, and the original ignores
 * its first two arguments.
 *
 * Validity follows the shortest-form table:
 *   ASCII 00..7F
 *   C2..DF + continuation
 *   E0 A0..BF / E1..EC / ED 80..9F / EE..EF + two continuations
 *   F0 90..BF / F1..F3 / F4 80..8F + three continuations
 * Overlongs, surrogates, F5..FF and code points above U+10FFFF are rejected.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([486]);

function isContinuation(byte) {
  return (byte & 0xc0) === 0x80;
}

export function createUtf8DecodeHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 486: bytes covered by up to `budget` valid UTF-8 code points. */
  function scanUtf8CodePoints(_unusedA, _unusedB, start, end, budget) {
    start >>>= 0;
    end >>>= 0;
    budget >>>= 0;
    const memory = memoryView();
    let cursor = start;
    let codePoints = 0;
    while (cursor < end && budget > codePoints) {
      const lead = memory.getUint8(cursor);
      let length;
      if (lead < 0x80) {
        length = 1;
      } else if (lead < 0xc2) {
        break;
      } else if (lead <= 0xdf) {
        if (end - cursor < 2 || !isContinuation(memory.getUint8(cursor + 1))) break;
        length = 2;
      } else if (lead <= 0xef) {
        if (end - cursor < 3) break;
        const second = memory.getUint8(cursor + 1);
        const third = memory.getUint8(cursor + 2);
        if (lead === 0xed) {
          if ((second & 0xe0) !== 0x80) break;
        } else if (lead === 0xe0) {
          if ((second & 0xe0) !== 0xa0) break;
        } else if (!isContinuation(second)) {
          break;
        }
        if (!isContinuation(third)) break;
        length = 3;
      } else if (lead <= 0xf4) {
        if (end - cursor < 4) break;
        const second = memory.getUint8(cursor + 1);
        const third = memory.getUint8(cursor + 2);
        const fourth = memory.getUint8(cursor + 3);
        if (lead === 0xf0) {
          if (((second + 0x70) & 0xff) >= 0x30) break;
        } else if (lead === 0xf4) {
          if ((second & 0xf0) !== 0x80) break;
        } else if (!isContinuation(second)) {
          break;
        }
        if (!isContinuation(third) || !isContinuation(fourth)) break;
        // The original only checks lead/second against U+10FFFF; the low
        // twelve bits cannot push an otherwise valid prefix over the limit.
        const codePoint = ((lead << 18) & 0x1c0000) | ((second & 0x30) << 12);
        if (codePoint > 0x10ffff) break;
        length = 4;
      } else {
        break;
      }
      codePoints++;
      cursor += length;
    }
    return cursor - start;
  }

  return Object.freeze({486: scanUtf8CodePoints});
}
