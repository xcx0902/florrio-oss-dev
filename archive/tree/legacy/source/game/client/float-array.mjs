/** Recovered client 128-bit float composition and sorted-array helpers.
 *
 * 468 widens a signed i32 into a 128-bit pair through 442. 509 widens an f64
 * into the same pair. 732 builds a sorted pointer array with 571 and moves it
 * with 913. 1768 updates parser duplicate/error state after 463 comparisons.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;
const as64 = value => BigInt.asUintN(64, value);

export const functionIds = Object.freeze([468, 509, 732, 1768]);

export function createFloatArrayHooks(runtime) {
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
  const u32At = address => access('getUint32', address, true);
  const i64At = address => access('getBigUint64', address, true);
  const set8 = (address, value) => access('setUint8', address, value);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const set64 = (address, value) => access('setBigUint64', address, as64(value), true);
  const doubleScratch = new DataView(new ArrayBuffer(8));

  return {
    // 468: sign-preserving i32 to 128-bit conversion.
    468: (p0, p1) => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      let low = 0n, high = 0n;
      if (p1 !== 0) {
        const sign = (p1 | 0) >> 31;
        const magnitude = u32(((p1 | 0) + sign) ^ sign);
        const leading = Math.clz32(magnitude);
        runtime.call(442, frame, BigInt(magnitude), 0n, (leading + 81) | 0);
        low = i64At(frame);
        high = as64((i64At(at(frame, 8)) ^ 0x1000000000000n)
          + (BigInt(u32(16414 - leading)) << 48n));
        high = as64(high | (BigInt(u32((p1 | 0) & 0x80000000)) << 32n));
      }
      set64(p0, low);
      set64(at(p0, 8), high);
      runtime.stackPointer.value = u32(frame + 16);
    },

    // 509: f64 to 128-bit conversion with the original four ranges.
    509: (p0, value) => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      doubleScratch.setFloat64(0, value, true);
      const bits = doubleScratch.getBigUint64(0, true);
      const magnitude = bits & 0x7fffffffffffffffn;
      let low = 0n, high = 0n;
      if (as64(magnitude - 0x10000000000000n) <= 9214364837600034815n) {
        low = as64(magnitude << 60n);
        high = as64((magnitude >> 4n) + 4323455642275676160n);
      } else if (magnitude >= 0x7ff0000000000000n) {
        low = as64(bits << 60n);
        high = as64((bits >> 4n) | 9223090561878065152n);
      } else if (magnitude !== 0n) {
        const lowWord = Number(magnitude & 0xffffffffn);
        const highWord = Number(magnitude >> 32n);
        const leading = magnitude < 0x100000000n
          ? Math.clz32(lowWord) + 32
          : Math.clz32(highWord);
        runtime.call(442, frame, magnitude, 0n, (leading + 49) | 0);
        low = i64At(frame);
        high = as64((i64At(at(frame, 8)) ^ 0x1000000000000n)
          | (BigInt(u32(15372 - leading)) << 48n));
      }
      set64(p0, low);
      set64(at(p0, 8), as64(high | (bits & 0x8000000000000000n)));
      runtime.stackPointer.value = u32(frame + 16);
    },

    // 732: insertion-sort a pointer prefix using record comparisons.
    732: (p0, p1, p2) => {
      const frame = u32(runtime.stackPointer.value - 240);
      runtime.stackPointer.value = frame;
      set32(frame, p0);
      let count = 1;
      if ((p1 | 0) >= 2) {
        let cursor = u32(p0);
        for (;;) {
          cursor = u32(cursor - 20);
          const target = u32(p0 - u32At(at(p2, ((p1 | 0) - 2) << 2)));
          if ((runtime.call(571, p0, target) | 0) >= 0 &&
              (runtime.call(571, p0, cursor) | 0) > -1) break;
          const preferTarget = (runtime.call(571, target, cursor) | 0) > -1;
          set32(at(frame, count << 2), preferTarget ? target : cursor);
          count++;
          p1 = preferTarget ? (p1 - 1) | 0 : (p1 - 2) | 0;
          if ((p1 | 0) > 1) continue;
          break;
        }
      }
      runtime.call(913, frame, count);
      runtime.stackPointer.value = u32(frame + 240);
    },

    // 1768: duplicate/error fallback after component comparisons.
    1768: (p0, p1, p2, p3, p4) => {
      if (runtime.call(463, p0, u32At(at(p1, 8)), p4)) {
        if (u32At(at(p1, 4)) === u32(p2) && u32At(at(p1, 28)) !== 1)
          set32(at(p1, 28), p3);
        return;
      }
      if (!runtime.call(463, p0, u32At(p1), p4)) return;
      if ((u32(p2) === u32At(at(p1, 16)) || u32(p2) === u32At(at(p1, 20))) && u32(p3) === 1) {
        set32(at(p1, 32), 1);
        return;
      }
      set32(at(p1, 20), p2);
      set32(at(p1, 32), p3);
      set32(at(p1, 40), u32(u32At(at(p1, 40)) + 1));
      if (u32At(at(p1, 36)) === 1 && u32At(at(p1, 24)) === 2) set8(at(p1, 54), 1);
      set32(at(p1, 44), 4);
    },
  };
}
