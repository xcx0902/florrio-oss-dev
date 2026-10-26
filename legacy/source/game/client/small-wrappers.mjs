/** Recovered client small wrappers (originals 390,412,896,998,2337,2380).
 *
 * Each forwards arguments through a 16-byte frame to a shared helper.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([390, 412, 896, 998]);

export function createSmallWrapperHooks(runtime) {
  function withFrame(work) {
    const saved = runtime.stackPointer.value;
    const frame = (saved - 16) >>> 0;
    runtime.stackPointer.value = frame;
    const result = work(frame);
    runtime.stackPointer.value = saved;
    return result;
  }

  return Object.freeze({
    390(a, b, c, d) {
      return withFrame(frame => {
        new DataView(runtime.memory.buffer).setUint32(frame + 12, d, true);
        return runtime.call(555, a, b, c === 0 ? 125873 : c, d);
      });
    },
    412(a, b, c, d) {
      return withFrame(frame => {
        new DataView(runtime.memory.buffer).setUint32(frame + 12, d, true);
        return runtime.call(555, a, b, c, d);
      });
    },
    896(a, b) {
      return withFrame(frame => {
        new DataView(runtime.memory.buffer).setUint32(frame + 12, b, true);
        return runtime.call(744, a, 15625, b);
      });
    },
    998(a, b) {
      return withFrame(frame => {
        new DataView(runtime.memory.buffer).setUint32(frame + 12, b, true);
        runtime.call(927, 133120, a, b);
      });
    },
  });
}
