/** Recovered sp_server memory copy and clear (original 75, 79).
 *
 * 75 copies `count` bytes from source to destination and returns destination.
 * 79 clears three 32-bit words at the record.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([75, 79]);

export function createMemoryCopyHooks(runtime) {
  return Object.freeze({
    75(destination, source, count) {
      if (count !== 0) {
        new Uint8Array(runtime.memory.buffer).copyWithin(destination >>> 0, source >>> 0,
          (source + count) >>> 0);
      }
      return destination;
    },
    79(record) {
      const memory = new DataView(runtime.memory.buffer);
      memory.setBigUint64(record >>> 0, 0n, true);
      memory.setUint32((record >>> 0) + 8, 0, true);
    },
  });
}
