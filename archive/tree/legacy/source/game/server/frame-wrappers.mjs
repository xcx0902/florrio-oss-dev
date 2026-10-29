/** Recovered server frame wrappers (originals 555,562).
 *
 * Both copy fixed data into a stack frame and forward the six arguments plus frame
 * pointers to 99 or 100, returning its result.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([555, 562]);

export function createFrameWrapperHooks(runtime) {
  function run(callback, frameSize, seed) {
    const saved = runtime.stackPointer.value;
    const frame = (saved - frameSize) >>> 0;
    runtime.stackPointer.value = frame;
    seed(frame);
    const result = callback(frame);
    runtime.stackPointer.value = saved;
    return result;
  }

  return Object.freeze({
    555(a, b, c, d, e, f) {
      return run(frame => {
        const view = new DataView(runtime.memory.buffer);
        for (const [offset, source] of [[24, 13352], [16, 13344], [8, 13336], [0, 13328]])
          view.setBigUint64(frame + offset, view.getBigUint64(source, true), true);
        return runtime.call(99, a, b, c, d, e, f, frame, frame + 32);
      }, 32, () => {});
    },
    562(a, b, c, d, e, f) {
      return run(frame => {
        new DataView(runtime.memory.buffer).setBigUint64(frame + 8, 5991258982297782309n, true);
        return runtime.call(100, a, b, c, d, e, f, frame + 8, frame + 16);
      }, 16, () => {});
    },
  });
}
