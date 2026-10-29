/** Recovered client micro wrappers (16 originals).
 *
 * Small slots that store a computed word, read an imported capability, forward a
 * record to a lookup helper, run a guarded hook or bridge to a 64-bit helper.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([
  396, 725, 844, 892, 912, 1974, 2216, 2217, 2218, 2219, 2291, 2292, 2486, 2584, 2614, 3245,
]);

export function createMiscTinyWrapperHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    396(record, text) { runtime.call(423, record, text); },
    725(record, first, second) { return runtime.call(730, record, first, second, -1n); },
    844(record) {
      memoryView().setUint32(record >>> 0, runtime.call(405, record), true);
    },
    892(record, first, second) { return runtime.call(912, record, first, second); },
    912(record, first, second) {
      return runtime.call(730, record, first, second, -9223372036854775808n);
    },
    1974(record) { return runtime.host('a', 'N', memoryView().getInt32((record + 60) >>> 0, true)); },
    2216(record) { runtime.call(664, record, 100256); },
    2217(record) { runtime.call(664, record, 98208); },
    2218(record) { runtime.call(664, record, 96160); },
    2219(record) { runtime.call(664, record, 94112); },
    2291(_first, _second, _third, record) { runtime.call(981, record, 7944412); },
    2292(_first, _second, _third, record) { runtime.call(981, record, 7944424); },
    2486(record) {
      runtime.call(675, record);
      runtime.call(362, record);
    },
    2584() { runtime.call(675, 7919512); },
    2614() {
      if (memoryView().getUint8(379560) !== 0) runtime.call(585, 378280);
    },
    3245() {
      runtime.call(1);
      throw new WebAssembly.RuntimeError('unreachable');
    },
  });
}
