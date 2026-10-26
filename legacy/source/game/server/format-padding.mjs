/** Recovered sp_server formatting padding (original 63).
 *
 * Writes `target - current` copies of the low byte of `fill` through the facet
 * writer 51, in 256-byte batches. Flags 0x12000 suppress padding, as does a
 * non-positive span. A scratch batch is kept at 0x3f00000 and cleared afterwards.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([63]);

const scratch = 0x3f00000;

export function createFormatPaddingHook(runtime) {
  return Object.freeze({
    63(facet, fill, target, current, flags) {
      if ((flags & 0x12000) !== 0) return;
      let span = (target | 0) - (current | 0);
      if (span <= 0) return;
      const memory = new Uint8Array(runtime.memory.buffer);
      memory.fill(fill & 0xff, scratch, scratch + 256);
      while (span > 255) {
        runtime.call(51, facet, scratch, 256);
        span -= 256;
      }
      runtime.call(51, facet, scratch, span);
      memory.fill(0, scratch, scratch + 256);
    },
  });
}
