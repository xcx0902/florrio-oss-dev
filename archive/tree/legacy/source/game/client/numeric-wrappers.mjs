/** Recovered client numeric and cookie wrappers (originals 775,1891).
 *
 * 1891 places a 64-bit cookie in a frame and forwards six arguments plus frame
 * pointers to 513.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([1891]);

export function createNumericWrapperHooks(runtime) {
  return Object.freeze({
    1891(a, b, c, d, e, f) {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 16) >>> 0;
      runtime.stackPointer.value = frame;
      new DataView(runtime.memory.buffer).setBigUint64(frame + 8, 5991258982297782309n, true);
      const result = runtime.call(513, a, b, c, d, e, f, frame + 8, frame + 16);
      runtime.stackPointer.value = saved;
      return result;
    },
  });
}
