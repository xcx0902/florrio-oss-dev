/** Recovered sp_server single-precision argument reduction (original 284).
 *
 * `rem_pio2f(x, out)` returns the nearest integer `n` to `x * 2/pi` and stores
 * `x - n*pi/2` at `out` as an f64. Three ranges:
 *
 *  - |x| <= 1305022426: two-term reduction entirely in f64;
 *  - |x| >= 0x7f800000: Inf/NaN stores `x - x` and returns 0;
 *  - otherwise: scale the magnitude into [2^23, 2^24) and delegate the
 *    Payne–Hanek reduction to original 285 (not recovered, called natively).
 *
 * The original uses a 16-byte frame at stack_pointer-16: the reduced value is
 * stored at +0 and the scaled input at +8. Mirroring that frame keeps the
 * native dependency's own stack usage byte-identical.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([284]);

const TWO_OVER_PI = 0.6366197723675814;
const ROUND_MAGIC = 6755399441055744; // 0x1.8p+52
const PIO2_HIGH = -1.5707963109016418; // -0x1.921fb5p+0
const PIO2_LOW = -1.5893254773528196e-8; // -0x1.110b4611a6263p-26
const LARGE_MAGNITUDE = 1305022426;
const EXPONENT_MASK = 0x7f800000;

export function createRemPio2fHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 284: `x - n*pi/2` with n = nearest integer to `x*2/pi`. */
  function remPio2f(x, out) {
    const memory = memoryView();
    const magnitude = f32Bits(x) & 0x7fffffff;
    const signBit = f32Bits(x) >>> 31;
    if (magnitude <= LARGE_MAGNITUDE) {
      const f = Math.fround(x);
      let n = f * TWO_OVER_PI + ROUND_MAGIC - ROUND_MAGIC;
      const reduced = f + n * PIO2_HIGH + n * PIO2_LOW;
      memory.setFloat64(out >>> 0, reduced, true);
      return Number.isFinite(n) && Math.abs(n) < 0x80000000 ? n | 0 : -0x80000000;
    }
    if (magnitude >= EXPONENT_MASK) {
      memory.setFloat64(out >>> 0, Math.fround(x) - Math.fround(x), true);
      return 0;
    }
    const stackPointer = runtime.stackPointer.value >>> 0;
    const frame = (stackPointer - 16) >>> 0;
    runtime.stackPointer.value = frame;
    try {
      const exponent = (magnitude >>> 23) - 150;
      const scaledBits = (magnitude - (exponent << 23)) >>> 0;
      memory.setFloat64(frame + 8, Math.fround(fromF32Bits(scaledBits)), true);
      let n = runtime.call(285, frame + 8, frame, exponent, 1, 0) | 0;
      const reduced = memory.getFloat64(frame, true);
      if (signBit !== 0) {
        memory.setFloat64(out >>> 0, -reduced, true);
        n = -n | 0;
      } else {
        memory.setFloat64(out >>> 0, reduced, true);
      }
      return n;
    } finally {
      runtime.stackPointer.value = stackPointer;
    }
  }

  return Object.freeze({284: remPio2f});
}

const scratch = new DataView(new ArrayBuffer(4));
function f32Bits(value) {
  scratch.setFloat32(0, value, true);
  return scratch.getUint32(0, true);
}
function fromF32Bits(bits) {
  scratch.setUint32(0, bits >>> 0, true);
  return scratch.getFloat32(0, true);
}
