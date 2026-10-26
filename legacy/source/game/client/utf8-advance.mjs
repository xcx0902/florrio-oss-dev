/** Recovered client UTF-8 span validator (original 1813).
 *
 * Arguments: ignored, ignored, start, end, characterLimit. Starting at `start`,
 * the function walks complete UTF-8 sequences until it reaches `end`, reaches
 * the character limit, or finds an invalid sequence, and returns the number of
 * bytes consumed. Signed byte loads, unsigned bounds checks and the exact
 * surrogate/overlong/max-code-point guards are preserved. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([1810, 1813]);

export function createUtf8AdvanceHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function access(method, address, ...args) {
    try {
      return dataView()[method](address, ...args);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const u8 = address => access('getUint8', address);
  const i8 = address => access('getInt8', address);

  function advanceSpan(startValue, endValue, limitValue, widePairs) {
      const start = startValue >>> 0;
      const end = endValue >>> 0;
      const limit = limitValue >>> 0;
      let position = start;
      let characters = 0;
      for (;;) {
        if (position >= end || limit <= characters) break;
        const signed = i8(position);
        if (signed > -1) {
          characters++;
          position++;
          continue;
        }
        const first = signed & 255;
        if (first < 194) break;
        if (first <= 223) {
          if ((end - position) < 2) break;
          if ((u8(position + 1) & 192) !== 128) break;
          characters++;
          position += 2;
          continue;
        }
        if (first <= 239) {
          if ((end - position) < 3) break;
          const second = u8(position + 1);
          const third = u8(position + 2);
          let validSecond;
          if (first === 237) validSecond = (second & 224) === 128;
          else if (first === 224) validSecond = (second & 224) === 160;
          else validSecond = (second & 192) === 128;
          if (!validSecond || (third & 192) !== 128) break;
          characters++;
          position += 3;
          continue;
        }
        if (first > 244) break;
        if ((end - position) < 4) break;
        if (widePairs && (limit - characters) < 2) break;
        const second = u8(position + 1);
        const third = u8(position + 2);
        const fourth = u8(position + 3);
        let validSecond;
        if (first === 240) validSecond = ((second + 112) & 255) < 48;
        else if (first === 244) validSecond = (second & 192) === 128;
        else validSecond = (second & 240) === 128;
        if (!validSecond || (third & 192) !== 128 || (fourth & 192) !== 128)
          break;
        const codepoint = (((first << 18) & 1835008)
          | ((second & 48) << 12)) >>> 0;
        if (codepoint > 1114111) break;
        characters += widePairs ? 2 : 1;
        position += 4;
      }
      return (position - start) | 0;
  }

  return {
    1810: (_ignored0, _ignored1, start, end, limit) =>
      advanceSpan(start, end, limit, true),
    1813: (_ignored0, _ignored1, start, end, limit) =>
      advanceSpan(start, end, limit, false),
  };
}
