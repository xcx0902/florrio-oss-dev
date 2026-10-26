/** Recovered client buffer helper (original 706).
 *
 * 706 requests a product from 820 and returns whole rows written. 908 reads four
 * random bytes and aborts when the host entropy source fails.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([706, 908]);

export function createBufferHelperHooks(runtime) {
  return Object.freeze({
    908() {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 16) >>> 0;
      runtime.stackPointer.value = frame;
      if (runtime.host('a', 'Ga', frame + 12, 4) !== 0) {
        runtime.call(406);
        throw new WebAssembly.RuntimeError('unreachable');
      }
      const value = new DataView(runtime.memory.buffer).getUint32(frame + 12, true);
      runtime.stackPointer.value = saved;
      return value;
    },
    706(buffer, length, count, object) {
      const size = Math.imul(length, count) >>> 0;
      const filled = runtime.call(820, buffer, size, object);
      if (filled === size) return length === 0 ? count : 0;
      return Math.floor(filled / length) >>> 0;
    },
  });
}
