/** Recovered sp_server unsigned conversion to 80-bit long double (original 142).
 *
 * Normalizes a 32-bit unsigned value through 55 and assembles the 80-bit
 * significand/exponent pair stored at the destination.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([142]);

const scratch = 0x3f30000;

export function createUintToLongDoubleHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    142(destination, value) {
      const memory = memoryView();
      const self = destination >>> 0;
      if ((value >>> 0) === 0) {
        memory.setBigUint64(self, 0n, true);
        memory.setBigUint64(self + 8, 0n, true);
        return;
      }
      const leading = Math.clz32(value >>> 0);
      runtime.call(55, scratch, BigInt(value >>> 0), 0n, leading + 81);
      const low = memory.getBigUint64(scratch, true);
      const high = (memory.getBigUint64(scratch + 8, true) ^ 281474976710656n)
        + (BigInt(16414 - leading) << 48n);
      memory.setBigUint64(self, low, true);
      memory.setBigUint64(self + 8, high, true);
      new Uint8Array(runtime.memory.buffer).fill(0, scratch, scratch + 16);
    },
  });
}
