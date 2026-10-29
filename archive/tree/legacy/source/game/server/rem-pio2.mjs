/** Recovered sp_server double-precision argument reduction (original 283).
 *
 * `rem_pio2(x, out)` returns n = nearest integer to x*2/pi and writes the two
 * f64 words of x - n*pi/2 to out[0..1]. Small magnitudes use one of four
 * fixed quadrants or the f64 medium path; large magnitudes split the scaled
 * mantissa into 24-bit limbs and delegate to native 285 (Payne–Hanek).
 *
 * The original reserves a 48-byte frame at stack_pointer-48. Words +0/+8 hold
 * the two outputs, +16/+24/+32 hold the large-case limbs.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([283]);

const TWO_OVER_PI = 0.6366197723675814;
const ROUND_MAGIC = 6755399441055744;
const PIO2_1 = 1.5707963267341256; // 0x1.921fb544p+0
const PIO2_1T = 6.077100506506192e-11; // 0x1.0b4611a626331p-34
const PIO2_2 = 6.077100506303966e-11; // 0x1.0b4611a6p-34
const PIO2_2T = 2.0222662487959506e-21; // 0x1.3198a2e037073p-69
const PIO2_3 = 2.0222662487111665e-21; // 0x1.3198a2ep-69
const PIO2_3T = 8.4784276603689e-32; // 0x1.b839a252049c1p-104
const SCALED_MANTISSA = 0x4160000000000000n;

export function createRemPio2Hook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 283: two-word reduction of x modulo pi/2. */
  function remPio2(x, out) {
    const memory = memoryView();
    const bits = f64Bits(x);
    const high = Number(bits >> 32n) >>> 0;
    const magnitude = high & 0x7fffffff;
    const negative = bits >> 63n !== 0n;
    const write = (pointer, value) => memory.setFloat64(pointer >>> 0, value, true);

    function quadrant(k, highPart, lowPart) {
      const z = negative ? x + k * highPart : x - k * highPart;
      const y0 = negative ? z + k * lowPart : z - k * lowPart;
      const y1 = negative ? (z - y0) + k * lowPart : (z - y0) - k * lowPart;
      write(out, y0);
      write((out >>> 0) + 8, y1);
      return negative ? -k : k;
    }

    function medium() {
      const n = x * TWO_OVER_PI + ROUND_MAGIC - ROUND_MAGIC;
      let base = x - n * PIO2_1;
      let low = n * PIO2_1T;
      let y0 = base - low;
      write(out, y0);
      let yBase = base;
      if ((magnitude >>> 20) - f64Exponent(y0) >= 17) {
        const w = n * PIO2_2;
        const t = base - w;
        const residual = n * PIO2_2T - ((base - t) - w);
        y0 = t - residual;
        write(out, y0);
        low = residual;
        if ((magnitude >>> 20) - f64Exponent(y0) >= 50) {
          const w3 = n * PIO2_3;
          const t2 = t - w3;
          const residual3 = n * PIO2_3T - ((t - t2) - w3);
          y0 = t2 - residual3;
          write(out, y0);
          low = residual3;
          yBase = t2;
        } else {
          yBase = t;
        }
      }
      write((out >>> 0) + 8, (yBase - y0) - low);
      return n | 0;
    }

    function large() {
      if (magnitude >= 0x7ff00000) {
        const nan = x - x;
        write(out, nan);
        write((out >>> 0) + 8, nan);
        return 0;
      }
      const stackPointer = runtime.stackPointer.value >>> 0;
      const frame = (stackPointer - 48) >>> 0;
      runtime.stackPointer.value = frame;
      try {
        let scaled = fromF64Bits((bits & 0xfffffffffffffn) | SCALED_MANTISSA);
        for (let index = 0; index < 2; index++) {
          const limb = Math.trunc(scaled);
          write(frame + 16 + index * 8, limb);
          scaled = (scaled - limb) * 16777216;
        }
        write(frame + 32, scaled);
        let count;
        if (scaled !== 0) {
          count = 2;
        } else {
          count = 1;
          while (memory.getFloat64(frame + 16 + count * 8, true) === 0) count--;
        }
        let n = runtime.call(285, frame + 16, frame, (magnitude >>> 20) - 1046, count + 1, 1) | 0;
        let y0 = memory.getFloat64(frame, true);
        let y1 = memory.getFloat64(frame + 8, true);
        if (negative) {
          y0 = -y0;
          y1 = -y1;
          n = -n | 0;
        }
        write(out, y0);
        write((out >>> 0) + 8, y1);
        return n;
      } finally {
        runtime.stackPointer.value = stackPointer;
      }
    }

    if (magnitude <= 0x400f6a7a) {
      if ((magnitude & 0xfffff) === 0x921fb) return medium();
      if (magnitude <= 0x4002d97c) return quadrant(1, PIO2_1, PIO2_1T);
      return quadrant(2, PIO2_1, PIO2_1T);
    }
    if (magnitude <= 0x401c463b) {
      if (magnitude <= 0x4015fdbc) {
        if (magnitude === 0x4012d97c) return medium();
        return quadrant(3, PIO2_1, PIO2_1T);
      }
      if (magnitude === 0x401921fb) return medium();
      return quadrant(4, PIO2_1, PIO2_1T);
    }
    if (magnitude <= 0x413921fa) return medium();
    return large();
  }

  return Object.freeze({283: remPio2});
}

const scratch = new DataView(new ArrayBuffer(8));
function f64Bits(value) {
  scratch.setFloat64(0, value, true);
  return scratch.getBigUint64(0, true);
}
function fromF64Bits(bits) {
  scratch.setBigUint64(0, BigInt(bits), true);
  return scratch.getFloat64(0, true);
}
function f64Exponent(value) {
  return Number((f64Bits(value) >> 52n) & 0x7ffn);
}
