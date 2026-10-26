/** Recovered sp_server UTF-8 scanner (original function 483).
 *
 * Walks a byte range and validates complete UTF-8 sequences until the range
 * ends or the output-unit budget is exhausted. The budget counts UTF-16 code
 * units: a four-byte sequence needs two units and is rejected when only one
 * remains. On success the returned value is the number of input bytes consumed;
 * an invalid or truncated sequence stops the scan without consuming it.
 *
 * The original's first two parameters are unused scratch (the first is
 * immediately overwritten); the meaningful inputs are start, end and budget.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([483]);

export function createUtf8ScanHook(runtime) {
  let buffer, bytes;
  function byteView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      bytes = new Uint8Array(buffer);
    }
    return bytes;
  }

  /** Original 483: scan complete UTF-8 sequences within the unit budget. */
  function scanUtf8(_unusedA, _unusedB, start, end, unitBudget) {
    const memory = byteView();
    const begin = start >>> 0;
    const limit = end >>> 0;
    const budget = unitBudget >>> 0;
    let cursor = begin;
    let units = 0;
    while (cursor < limit && units < budget) {
      const lead = memory[cursor];
      let length;
      if (lead < 0x80) {
        length = 1;
      } else if (lead < 0xc2) {
        break;
      } else if (lead <= 0xdf) {
        if (limit - cursor < 2) break;
        if ((memory[cursor + 1] & 0xc0) !== 0x80) break;
        length = 2;
      } else if (lead <= 0xef) {
        if (limit - cursor < 3) break;
        const second = memory[cursor + 1];
        const third = memory[cursor + 2];
        if (lead === 0xed) {
          if ((second & 0xe0) !== 0x80) break;
        } else if (lead === 0xe0) {
          if ((second & 0xe0) !== 0xa0) break;
        } else if ((second & 0xc0) !== 0x80) {
          break;
        }
        if ((third & 0xc0) !== 0x80) break;
        length = 3;
      } else {
        if (lead > 0xf4) break;
        if (limit - cursor < 4) break;
        if (budget - units < 2) break;
        const second = memory[cursor + 1];
        const third = memory[cursor + 2];
        const fourth = memory[cursor + 3];
        if (lead === 0xf0) {
          if (((second + 0x70) & 0xff) >= 0x30) break;
        } else if (lead === 0xf4) {
          if ((second & 0xf0) !== 0x80) break;
        } else if ((second & 0xc0) !== 0x80) {
          break;
        }
        if ((third & 0xc0) !== 0x80) break;
        if ((fourth & 0xc0) !== 0x80) break;
        const codePoint = ((lead << 18) & 0x1c0000)
          | ((second & 0x30) << 12)
          | ((third & 0x3f) << 6)
          | (fourth & 0x3f);
        if (codePoint > 0x10ffff) break;
        units += 1;
        length = 4;
      }
      units += 1;
      cursor += length;
    }
    return (cursor - begin) >>> 0;
  }

  return Object.freeze({483: scanUtf8});
}
