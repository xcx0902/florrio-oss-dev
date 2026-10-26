/** Recovered sp_server UTF-8 to UTF-16 decoder (original 484).
 *
 * Decodes UTF-8 from `input` until `inputEnd` into UTF-16 units at `output`
 * until `outputEnd`. Returns 0 when the input is exhausted, 1 when more input
 * or output is needed (truncated sequence or full output), and 2 for an
 * invalid lead byte / overlong or bad continuation where the original branches
 * to its error label. `inputCursor` and `outputCursor` receive the consumed
 * positions. Four-byte code points become a surrogate pair.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([484]);

export function createUtf8ToUtf16Hook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    484(_state, _unused, input, inputEnd, inputCursor, output, outputEnd, outputCursor) {
      const memory = memoryView();
      const inStart = input >>> 0;
      const inEnd = inputEnd >>> 0;
      const outStart = output >>> 0;
      const outEnd = outputEnd >>> 0;
      const inputOut = inputCursor >>> 0;
      const outputOut = outputCursor >>> 0;
      let cursor = inStart;
      let out = outStart;

      function finish(status) {
        memory.setUint32(inputOut, cursor, true);
        memory.setUint32(outputOut, out, true);
        return status;
      }

      while (cursor < inEnd && out < outEnd) {
        const first = memory.getUint8(cursor);
        if (first < 128) {
          memory.setUint16(out, first, true);
          cursor += 1;
          out += 2;
          continue;
        }
        if (first < 194) return finish(2);
        if (first <= 223) {
          if (inEnd - cursor < 2) return finish(1);
          const second = memory.getUint8(cursor + 1);
          if ((second & 192) !== 128) return finish(2);
          memory.setUint16(out, ((first << 6) & 1984) | (second & 63), true);
          cursor += 2;
          out += 2;
          continue;
        }
        if (first <= 239) {
          if (inEnd - cursor < 3) return finish(1);
          const second = memory.getUint8(cursor + 1);
          const third = memory.getUint8(cursor + 2);
          if (first === 237) {
            if ((second & 224) !== 128) return finish(2);
          } else if (first === 224) {
            if ((second & 224) !== 160) return finish(2);
          } else if ((second & 192) !== 128) {
            return finish(2);
          }
          if ((third & 192) !== 128) return finish(2);
          const codePoint = ((first & 15) << 12) | ((second & 63) << 6) | (third & 63);
          memory.setUint16(out, codePoint, true);
          cursor += 3;
          out += 2;
          continue;
        }
        if (first > 244) return finish(2);
        if (inEnd - cursor < 4) return finish(1);
        const second = memory.getUint8(cursor + 1);
        const third = memory.getUint8(cursor + 2);
        const fourth = memory.getUint8(cursor + 3);
        const lead = first - 240;
        if (lead === 0) {
          if ((((second + 112) & 255) >= 48)) return finish(2);
        } else if (lead >= 1 && lead <= 3) {
          if ((second & 240) !== 128) return finish(2);
        } else if (lead === 4) {
          if ((second & 192) !== 128) return finish(2);
        } else {
          return finish(2);
        }
        if ((third & 192) !== 128 || (fourth & 192) !== 128) return finish(2);
        if (outEnd - out < 4) return finish(1);
        const codePoint = ((second & 63) << 12) | ((first & 7) << 18)
          | ((third & 63) << 6) | (fourth & 63);
        if (codePoint > 1114111) return finish(1);
        const adjusted = codePoint - 65536;
        memory.setUint16(out, 0xd800 | (adjusted >>> 10), true);
        memory.setUint16(out + 2, 0xdc00 | (adjusted & 1023), true);
        cursor += 4;
        out += 4;
      }
      return finish(cursor < inEnd ? 1 : 0);
    },
  });
}
