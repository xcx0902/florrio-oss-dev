/** Recovered client indirect dispatch helpers (originals 1859,1949,2019,2025,2033,2056,2345).
 *
 * Each loads a function index from an object vtable and forwards the documented
 * argument list, with optional guards on the object, stream or entity state.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([1859, 1949, 2019, 2025, 2033, 2056, 2345]);

export function createIndirectHelperHooks(runtime) {
  return Object.freeze({
    1859(object) {
      const view = new DataView(runtime.memory.buffer);
      const index = view.getUint32(view.getUint32(object >>> 0, true) + 4, true);
      runtime.indirect({parameters: ['i32'], results: []}, index, object);
    },
    1949(a, b, c, d) {
      const view = new DataView(runtime.memory.buffer);
      const value = view.getBigUint64((c >>> 0) + 8, true);
      const index = view.getUint32(view.getUint32(b >>> 0, true) + 16, true);
      runtime.indirect(
        {parameters: ['i32', 'i32', 'i64', 'i32', 'i32'], results: []},
        index, a, b, value, 0, d);
    },
    2019(object) {
      if (object === 0) return;
      const view = new DataView(runtime.memory.buffer);
      runtime.indirect({parameters: ['i32'], results: []}, view.getUint32(132088, true), object);
      view.setUint32(132092, view.getUint32(132092, true) - 1, true);
    },
    2025(object, value) {
      const view = new DataView(runtime.memory.buffer);
      const stream = view.getUint32((object >>> 0) + 992, true);
      if (stream === 0) return 0;
      return runtime.indirect(
        {parameters: ['i32'], results: ['i32']}, view.getUint32(stream + 56, true), value);
    },
    2033(object, value) {
      const view = new DataView(runtime.memory.buffer);
      const stream = view.getUint32((object >>> 0) + 992, true);
      if (stream === 0 || value === 0) return;
      runtime.indirect(
        {parameters: ['i32', 'i32'], results: ['i32']},
        view.getUint32(stream + 68, true), view.getUint32(stream + 8, true), value);
    },
    2056(object, entity) {
      const view = new DataView(runtime.memory.buffer);
      if (view.getUint8((entity >>> 0) + 12) !== 7) return;
      const index = view.getUint32(view.getUint32((object >>> 0) + 436, true) + 84, true);
      runtime.indirect({parameters: [], results: []}, index);
    },
    2345(object) {
      const view = new DataView(runtime.memory.buffer);
      const index = view.getUint32(view.getUint32(object >>> 0, true) + 20, true);
      runtime.indirect({parameters: ['i32'], results: []}, index, object);
    },
  });
}
