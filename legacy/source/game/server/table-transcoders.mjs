/** Recovered sp_server table transcoders and helpers (112, 452, 456, 458, 461,
 * 465, 467, 469, 470, 471, 473, 482).
 *
 * 112 copies p2 32-bit words. 452/461 replace signed bytes / clamp words while
 * copying. 456/458 decode bytes in place through the 10352/11888 tables.
 * 465/467 decode 32-bit words in place. 469/470 scan for the first word whose
 * 9328 bitset entry misses the mask. 471 widens words into 16-bit table
 * entries. 473 returns min(end-start, limit). 482 clears 20 flag bytes.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([112, 452, 456, 458, 461, 465, 467, 469, 470, 471, 473, 482]);

export function createTableTranscoderHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    112(destination, source, words) {
      const memory = memoryView();
      let from = source >>> 0;
      let to = destination >>> 0;
      for (let remaining = words >>> 0; remaining !== 0; remaining--) {
        memory.setUint32(to, memory.getUint32(from, true), true);
        to += 4;
        from += 4;
      }
    },
    452(_self, begin, end, replacement, output) {
      const memory = memoryView();
      let source = begin >>> 0;
      let destination = output >>> 0;
      while (source !== (end >>> 0)) {
        const value = memory.getInt8(source);
        memory.setUint8(destination, value > -1 ? value : replacement);
        destination++;
        source++;
      }
      return end;
    },
    456(_self, begin, end) {
      const memory = memoryView();
      let cursor = begin >>> 0;
      while (cursor !== (end >>> 0)) {
        const value = memory.getInt8(cursor);
        const decoded = value >= 0 ? memory.getInt32(10352 + (value << 2), true) : value;
        memory.setUint8(cursor, decoded);
        cursor++;
      }
      return end;
    },
    458(_self, begin, end) {
      const memory = memoryView();
      let cursor = begin >>> 0;
      while (cursor !== (end >>> 0)) {
        const value = memory.getInt8(cursor);
        const decoded = value >= 0 ? memory.getInt32(11888 + (value << 2), true) : value;
        memory.setUint8(cursor, decoded);
        cursor++;
      }
      return end;
    },
    461(_self, begin, end, replacement, output) {
      const memory = memoryView();
      let source = begin >>> 0;
      let destination = output >>> 0;
      while (source !== (end >>> 0)) {
        const value = memory.getInt32(source, true);
        memory.setUint8(destination, (value >>> 0) < 128 ? value : replacement);
        destination++;
        source += 4;
      }
      return end;
    },
    465(_self, begin, end) {
      const memory = memoryView();
      let cursor = begin >>> 0;
      while (cursor !== (end >>> 0)) {
        const value = memory.getInt32(cursor, true);
        const decoded = (value >>> 0) <= 127 ? memory.getInt32(10352 + (value << 2), true) : value;
        memory.setInt32(cursor, decoded, true);
        cursor += 4;
      }
      return end;
    },
    467(_self, begin, end) {
      const memory = memoryView();
      let cursor = begin >>> 0;
      while (cursor !== (end >>> 0)) {
        const value = memory.getInt32(cursor, true);
        const decoded = (value >>> 0) <= 127 ? memory.getInt32(11888 + (value << 2), true) : value;
        memory.setInt32(cursor, decoded, true);
        cursor += 4;
      }
      return end;
    },
    469(_self, mask, begin, end) {
      const memory = memoryView();
      let cursor = begin >>> 0;
      while (cursor !== (end >>> 0)) {
        const value = memory.getUint32(cursor, true);
        if (value > 127) break;
        if ((memory.getUint16(9328 + (value << 1), true) & mask) === 0) break;
        cursor += 4;
      }
      return cursor;
    },
    470(_self, mask, begin, end) {
      const memory = memoryView();
      let cursor = begin >>> 0;
      while (cursor !== (end >>> 0)) {
        const value = memory.getUint32(cursor, true);
        if (value <= 127 && (memory.getUint16(9328 + (value << 1), true) & mask) === 0) {
          // Entries that miss the mask are skipped, not returned.
        }
        cursor += 4;
      }
      return end;
    },
    471(_self, begin, end, output) {
      const memory = memoryView();
      let source = begin >>> 0;
      let destination = output >>> 0;
      while (source !== (end >>> 0)) {
        const value = memory.getUint32(source, true);
        const bits = value <= 127 ? memory.getUint16(9328 + (value << 1), true) : 0;
        memory.setUint16(destination, bits, true);
        destination += 2;
        source += 4;
      }
      return end;
    },
    473(_self, _p1, begin, end, limit) {
      const span = ((end >>> 0) - (begin >>> 0)) >>> 0;
      return span < (limit >>> 0) ? span : limit;
    },
    482() {
      const memory = memoryView();
      for (let address = 8548116; address >= 8547828; address -= 16) memory.setUint8(address, 0);
    },
  });
}
