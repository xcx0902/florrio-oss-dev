/** Recovered sp_server signed conversion to 80-bit long double (original 72).
 *
 * Converts a signed 32-bit value to its magnitude, normalizes it through 55,
 * assembles the 80-bit significand/exponent and restores the sign bit.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([72]);

const scratch = 0x3f40000;

export function createIntToLongDoubleHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    72(destination, value) {
      const memory = memoryView();
      const self = destination >>> 0;
      if ((value | 0) === 0) {
        memory.setBigUint64(self, 0n, true);
        memory.setBigUint64(self + 8, 0n, true);
        return;
      }
      const sign = (value | 0) >> 31;
      const magnitude = (((value | 0) + sign) ^ sign) >>> 0;
      const leading = Math.clz32(magnitude);
      runtime.call(55, scratch, BigInt(magnitude), 0n, leading + 81);
      const low = memory.getBigUint64(scratch, true);
      let high = (memory.getBigUint64(scratch + 8, true) ^ 281474976710656n)
        + (BigInt(16414 - leading) << 48n);
      const signBit = value < 0 ? (1n << 63n) : 0n;
      high |= signBit;
      memory.setBigUint64(self, low, true);
      memory.setBigUint64(self + 8, high, true);
      new Uint8Array(runtime.memory.buffer).fill(0, scratch, scratch + 16);
    },
  });
}
