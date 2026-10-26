/** Recovered client palette lookup, bitmap decoding and UTF-8 emission.
 *
 * 1423 clears 39 sparse globals. 2269 expands a 1-bit row stream through a
 * palette. 602 returns a nearest-color index or the masked channel word. 543
 * writes one to four UTF-8 bytes and reports invalid code points.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([1423, 2498, 2269, 2265, 2268, 2270, 2264, 2266, 602, 543]);

export function createBitmapDecodeHooks(runtime) {
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
  const u16 = address => access('getUint16', address, true);
  const u32At = address => access('getUint32', address, true);
  const set8 = (address, value) => access('setUint8', address, value);
  const set16 = (address, value) => access('setUint16', address, value, true);
  const set32 = (address, value) => access('setUint32', address, value, true);

  const cleared = [383992, 384044, 383940, 383888, 383836, 383784, 383732,
    383680, 383628, 383576, 383524, 383472, 383420, 383368, 383316, 383264,
    383212, 383160, 383108, 383004, 383056, 382952, 382900, 382848, 382796,
    382744, 382692, 382640, 382588, 382536, 382484, 382432, 382380, 382328,
    382276, 382224, 382172, 382120, 382068];

  const sparseLeft = [386652, 386680, 386564, 386536, 386448, 386420, 386332,
    386304, 386216, 386188, 386100, 386072, 385984, 385956, 385868, 385840,
    385752, 385724, 385636, 385520, 385608, 385492, 385404, 385376, 385288,
    385260, 385172, 385144, 385056, 385028, 384940, 384912, 384824, 384796,
    384708, 384680, 384592, 384564, 384476, 384448, 384360, 384332, 384244,
    384216, 384128, 384100];

  return {
    // 1423: clear the sparse byte globals in the original order.
    1423: _p0 => {
      for (const address of cleared) set8(address, 0);
    },

    // 2498: clear the second sparse byte-global block.
    2498: _p0 => {
      for (const address of sparseLeft) set8(address, 0);
    },

    // 2265: decode one-bit rows into three palette bytes per pixel.
    2265: p0 => {
      const width = u32At(at(p0, 24));
      const stride = Math.trunc(((width | 0) + 7) / -8) | 0;
      let rows = u32At(at(p0, 28));
      if (!rows) return;
      const rowAdvance = u32(u32At(at(p0, 16)) + (stride + width));
      const palette = u32At(at(p0, 48));
      const destinationAdvance = u32At(at(p0, 36));
      let source = u32At(p0);
      let destination = u32At(at(p0, 20));
      const empty = (width | 0) < 1;
      while (rows-- !== 0) {
        let bits = 0, column = 0;
        if (!empty) {
          do {
            if ((column & 7) === 0) {
              bits = u8(source);
              source = u32(source + 1);
            }
            const index = (bits >>> 5) & 4;
            set8(destination, u8(u32(palette + index)));
            set8(at(destination, 1), u8(u32(palette + (index | 1))));
            set8(at(destination, 2), u8(u32(palette + (index | 2))));
            destination = u32(destination + 3);
            bits = bits << 1;
            column = (column + 1) | 0;
          } while (column !== (width | 0));
        }
        destination = u32(destination + destinationAdvance);
        source = u32(source + rowAdvance);
      }
    },

    // 2268: decode one-bit rows into 32-bit palette entries.
    2268: p0 => {
      const destinationAdvance = u32(Math.trunc((u32At(at(p0, 36)) | 0) / 4) * 4);
      const width = u32At(at(p0, 24));
      const stride = Math.trunc(((width | 0) + 7) / -8) | 0;
      let rows = u32At(at(p0, 28));
      if (!rows) return;
      const rowAdvance = u32(u32At(at(p0, 16)) + (stride + width));
      const palette = u32At(at(p0, 48));
      const previous = u32At(at(p0, 56));
      let source = u32At(p0);
      let destination = u32At(at(p0, 20));
      const empty = (width | 0) < 1;
      while (rows-- !== 0) {
        let bits = 0, column = 0;
        if (!empty) {
          do {
            if ((column & 7) === 0) {
              bits = u8(source);
              source = u32(source + 1);
            }
            const bit = (bits >>> 7) & 1;
            if (bit !== previous) set32(destination, u32At(u32(palette + bit * 4)));
            destination = u32(destination + 4);
            bits = bits << 1;
            column = (column + 1) | 0;
          } while (column !== (width | 0));
        }
        destination = u32(destination + destinationAdvance);
        source = u32(source + rowAdvance);
      }
    },

    // 2270: decode one-bit rows into 16-bit palette entries.
    2270: p0 => {
      const destinationAdvance = u32(Math.trunc((u32At(at(p0, 36)) | 0) / 2) * 2);
      const width = u32At(at(p0, 24));
      const stride = Math.trunc(((width | 0) + 7) / -8) | 0;
      let rows = u32At(at(p0, 28));
      if (!rows) return;
      const rowAdvance = u32(u32At(at(p0, 16)) + (stride + width));
      const palette = u32At(at(p0, 48));
      const previous = u32At(at(p0, 56));
      let source = u32At(p0);
      let destination = u32At(at(p0, 20));
      const empty = (width | 0) < 1;
      while (rows-- !== 0) {
        let bits = 0, column = 0;
        if (!empty) {
          do {
            if ((column & 7) === 0) {
              bits = u8(source);
              source = u32(source + 1);
            }
            const bit = (bits >>> 7) & 1;
            if (bit !== previous)
              set16(destination, u16(u32(palette + (bit << 1))));
            destination = u32(destination + 2);
            bits = bits << 1;
            column = (column + 1) | 0;
          } while (column !== (width | 0));
        }
        destination = u32(destination + destinationAdvance);
        source = u32(source + rowAdvance);
      }
    },

    // 2264: write two 32-bit palette entries per loop step, plus an odd tail.
    2264: p0 => {
      const destinationAdvance = u32((Math.trunc((u32At(at(p0, 36)) | 0) / 4) | 0) * 4);
      const width = u32At(at(p0, 24));
      const stride = Math.trunc(((width | 0) + 7) / -8) | 0;
      let rows = u32At(at(p0, 28));
      if (!rows) return;
      const rowAdvance = u32(u32At(at(p0, 16)) + (stride + width));
      const palette = u32At(at(p0, 48));
      const evenCount = width & 0xfffffffe;
      const odd = width & 1;
      let source = u32At(p0);
      let destination = u32At(at(p0, 20));
      while (rows-- !== 0) {
        let bits = 0, bitIndex = 0, leftover = 0, savedSource = source;
        if ((width | 0) >= 1) {
          leftover = evenCount;
          if ((width | 0) !== 1) {
            let remaining = evenCount;
            do {
              if ((bitIndex & 6) === 0) {
                bits = u8(source);
                source = u32(source + 1);
              }
              set32(destination, u32At(u32(palette + (((bits & 255) >>> 5) & 4))));
              set32(at(destination, 4), u32At(u32(palette + (((bits & 255) >>> 4) & 4))));
              bitIndex = (bitIndex + 2) | 0;
              destination = u32(destination + 8);
              bits = bits << 2;
              remaining = (remaining - 2) | 0;
            } while (remaining !== 0);
            leftover = evenCount;
            savedSource = source;
          }
          if (odd !== 0) {
            if ((leftover & 6) !== 0) savedSource = source;
            else {
              bits = u8(source);
              source = u32(source + 1);
              savedSource = source;
            }
            set32(destination, u32At(u32(palette + (((bits & 128) >>> 5)))));
            destination = u32(destination + 4);
          }
        }
        source = u32(savedSource + rowAdvance);
        destination = u32(destination + destinationAdvance);
      }
    },

    // 2266: write two 16-bit palette entries per loop step, plus an odd tail.
    2266: p0 => {
      const destinationAdvance = u32((Math.trunc((u32At(at(p0, 36)) | 0) / 2) | 0) * 2);
      const width = u32At(at(p0, 24));
      const stride = Math.trunc(((width | 0) + 7) / -8) | 0;
      let rows = u32At(at(p0, 28));
      if (!rows) return;
      const rowAdvance = u32(u32At(at(p0, 16)) + (stride + width));
      const palette = u32At(at(p0, 48));
      const evenCount = width & 0xfffffffe;
      const odd = width & 1;
      let source = u32At(p0);
      let destination = u32At(at(p0, 20));
      while (rows-- !== 0) {
        let bits = 0, bitIndex = 0, leftover = 0, savedSource = source;
        if ((width | 0) >= 1) {
          leftover = evenCount;
          if ((width | 0) !== 1) {
            let remaining = evenCount;
            do {
              if ((bitIndex & 6) === 0) {
                bits = u8(source);
                source = u32(source + 1);
              }
              set16(destination, u16(u32(palette + (((bits & 255) >>> 6) & 2))));
              set16(at(destination, 2), u16(u32(palette + (((bits & 255) >>> 5) & 2))));
              bitIndex = (bitIndex + 2) | 0;
              destination = u32(destination + 4);
              bits = bits << 2;
              remaining = (remaining - 2) | 0;
            } while (remaining !== 0);
            leftover = evenCount;
            savedSource = source;
          }
          if (odd !== 0) {
            if ((leftover & 6) !== 0) savedSource = source;
            else {
              bits = u8(source);
              source = u32(source + 1);
              savedSource = source;
            }
            set16(destination, u16(u32(palette + ((bits & 128) >>> 6))));
            destination = u32(destination + 2);
          }
        }
        source = u32(savedSource + rowAdvance);
        destination = u32(destination + destinationAdvance);
      }
    },

    // 2269: decode rows of one-bit palette indices.
    2269: p0 => {
      const width = u32At(at(p0, 24));
      const stride = Math.trunc(((width | 0) + 7) / -8) | 0;
      let rows = u32At(at(p0, 28));
      if (!rows) return;
      const rowAdvance = u32(u32At(at(p0, 16)) + (stride + width));
      const palette = u32At(at(p0, 48));
      const previous = u32At(at(p0, 56));
      const destinationAdvance = u32At(at(p0, 36));
      let source = u32At(p0);
      let destination = u32At(at(p0, 20));
      const empty = (width | 0) < 1;
      while (rows-- !== 0) {
        let bits = 0, column = 0;
        if (!empty) {
          do {
            if ((column & 7) === 0) {
              bits = u8(source);
              source = u32(source + 1);
            }
            const bit = (bits >>> 7) & 1;
            if (bit !== previous) {
              const entry = u32(palette + bit * 4);
              set16(destination, u16(entry));
              set8(at(destination, 2), u8(at(entry, 2)));
            }
            destination = u32(destination + 3);
            bits = bits << 1;
            column = (column + 1) | 0;
          } while (column !== (width | 0));
        }
        destination = u32(destination + destinationAdvance);
        source = u32(source + rowAdvance);
      }
    },

    // 602: nearest palette entry, or a masked channel word when no table exists.
    602: (p0, p1, p2, p3, p4) => {
      let table = u32At(at(p0, 4));
      if (!table) {
        return u32(u32At(at(p0, 24))
          & ((((p4 >>> u8(at(p0, 31))) << u8(at(p0, 35)))) | 0))
          | (((p2 >>> u8(at(p0, 29))) << u8(at(p0, 33))) | 0)
          | (((p1 >>> u8(at(p0, 28))) << u8(at(p0, 32))) | 0)
          | (((p3 >>> u8(at(p0, 30))) << u8(at(p0, 34))) | 0);
      }
      const count = u32At(table);
      if ((count | 0) < 1) return 0;
      const entries = u32At(at(table, 4));
      let best = 0xffffffff, bestIndex = 0;
      for (let index = 0; index !== count; index++) {
        const entry = u32(entries + (index << 2));
        const d1 = (u8(at(entry, 1)) - p2) | 0;
        const d2 = (u8(entry) - p1) | 0;
        const d3 = (u8(at(entry, 2)) - p3) | 0;
        const d4 = (u8(at(entry, 3)) - p4) | 0;
        const distance = u32(u32(u32(d1 * d1) + u32(d2 * d2))
          + u32(u32(d3 * d3) + u32(d4 * d4)));
        if (best > distance) {
          bestIndex = index;
          best = distance;
          if (distance === 0) break;
        }
      }
      return bestIndex & 0xff;
    },

    // 543: UTF-8 encoder with the original overlong and surrogate rules.
    543: (p0, p1) => {
      const value = u32(p1);
      if (!p0) return 1;
      if (value <= 127) {
        set8(p0, value);
        return 1;
      }
      if (!u32At(u32At(133584))) {
        if ((value & 0xffffff80) === 57216) {
          set8(p0, value);
          return 1;
        }
        set32(7944552, 25);
        return -1;
      }
      if (value <= 2047) {
        set8(at(p0, 1), (value & 63) | 128);
        set8(p0, (value >>> 6) | 192);
        return 2;
      }
      const surrogate = value >= 55296 && (value & 0xffffe000) !== 57344;
      if (!surrogate) {
        set8(at(p0, 2), (value & 63) | 128);
        set8(p0, (value >>> 12) | 224);
        set8(at(p0, 1), ((value >>> 6) & 63) | 128);
        return 3;
      }
      if (u32(value - 65536) <= 1048575) {
        set8(at(p0, 3), (value & 63) | 128);
        set8(p0, (value >>> 18) | 240);
        set8(at(p0, 2), ((value >>> 6) & 63) | 128);
        set8(at(p0, 1), ((value >>> 12) & 63) | 128);
        return 4;
      }
      set32(7944552, 25);
      return -1;
    },
  };
}
