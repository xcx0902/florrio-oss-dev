/** Recovered client iconv descriptor initialiser (original 2330).
 *
 * Fills a 136-byte descriptor, runs the worker initialiser and clears the flag for
 * stateful encodings.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2330]);

export function createIconvInitHooks(runtime) {
  return Object.freeze({
    2330(descriptor) {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 288) >>> 0;
      runtime.stackPointer.value = frame;
      const view = new DataView(runtime.memory.buffer);
      new Uint8Array(runtime.memory.buffer).fill(0, frame + 4, frame + 140);
      view.setUint32(frame + 132, 0x10000000, true);
      view.setUint32(frame, 249, true);
      runtime.call(88, descriptor, frame, frame + 144);
      if (descriptor === 2 || descriptor === 15) view.setUint8(7941640, 1);
      runtime.stackPointer.value = saved;
    },
  });
}
