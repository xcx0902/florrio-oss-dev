/** Recovered sp_server UTF-8 encoder (original 124).
 *
 * Encodes one code point into up to four bytes at `output` and returns the
 * byte count. ASCII and the locale-dependent 0xDF80 range take one byte; up to
 * 0x7FF takes two; non-surrogate values up to 0xFFFF take three; 0x10000–
 * 0x10FFFF takes four. Invalid values set error 25 at 8569384 and return -1.
 * When the output pointer is zero the function returns 1 without writing.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([124]);

export function createUtf8EncodeCodepointHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    124(output, codePoint) {
      const memory = memoryView();
      const out = output >>> 0;
      const value = codePoint >>> 0;
      if (out === 0) return 1;
      if (value <= 127) {
        memory.setUint8(out, value);
        return 1;
      }
      const locale = memory.getUint32(memory.getUint32(22540, true) >>> 0, true);
      if (locale === 0) {
        if ((value & 0xffffff80) === 57216) {
          memory.setUint8(out, value);
          return 1;
        }
      } else {
        if (value <= 2047) {
          memory.setUint8(out, (value >>> 6) | 192);
          memory.setUint8(out + 1, (value & 63) | 128);
          return 2;
        }
        if (value < 55296 || (value & 0xffffe000) === 57344) {
          memory.setUint8(out, (value >>> 12) | 224);
          memory.setUint8(out + 1, ((value >>> 6) & 63) | 128);
          memory.setUint8(out + 2, (value & 63) | 128);
          return 3;
        }
        if (((value - 65536) >>> 0) <= 1048575) {
          memory.setUint8(out, (value >>> 18) | 240);
          memory.setUint8(out + 1, ((value >>> 12) & 63) | 128);
          memory.setUint8(out + 2, ((value >>> 6) & 63) | 128);
          memory.setUint8(out + 3, (value & 63) | 128);
          return 4;
        }
      }
      memory.setUint32(8569384, 25, true);
      return -1;
    },
  });
}
