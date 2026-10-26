/** Recovered client allocateZeroedArray (original function 1764).
 *
 * Allocates `count * elementSize` bytes and zero-fills them. The multiplication
 * is performed in 64 bits: when either operand reaches 65536 the high word is
 * checked and an overflow requests an impossible 0xffffffff-byte allocation
 * instead of wrapping. A null malloc result is returned as null; when malloc's
 * header says the block is already zero, the fill is skipped.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([1764]);
export const dependencyIds = Object.freeze([368, 382]);
const OVERFLOW_SIZE = 0xffffffff;
const LARGE_ALLOCATION = 65536;

export function createAllocateZeroedArrayHook(runtime) {
  function allocateZeroedArray(count, elementSize) {
    const unsignedCount = count >>> 0;
    const unsignedSize = elementSize >>> 0;
    let byteLength = 0;
    if (unsignedCount !== 0) {
      const product = BigInt(unsignedCount) * BigInt(unsignedSize);
      if (((unsignedCount | unsignedSize) >>> 0) < LARGE_ALLOCATION) {
        byteLength = Number(product & 0xffffffffn);
      } else if ((product >> 32n) !== 0n) {
        byteLength = OVERFLOW_SIZE;
      } else {
        byteLength = Number(product);
      }
    }
    const block = runtime.call(368, byteLength) >>> 0;
    if (block === 0) return 0;
    const headerFlags = new DataView(runtime.memory.buffer).getUint8((block - 4) >>> 0) & 3;
    if (headerFlags !== 0) runtime.call(382, block, 0, byteLength);
    return block;
  }
  return {1764: allocateZeroedArray};
}
