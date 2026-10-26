/** Recovered client entity growth updates (20 originals).
 *
 * Each original refreshes the render state of one entity family and rescales
 * its growth component.  All 20 bodies share one structure and differ only
 * in three constants: the bounds value, the render scale and the new
 * duration (which is also the rescale factor).
 *
 *   entity + 140 -> render state: bounds at +8 (f64), scale at +64 (f32)
 *   entity + 116 -> growth state: size at +8 (f32), duration at +12 (f32)
 *
 * When the old duration is positive the size is rescaled by
 * `newDuration / oldDuration`; otherwise it is reset to the new duration.
 * The property setters (404 double, 380 float, 399 float) already invalidate
 * the shared layout caches, so the hook only has to reproduce the arithmetic.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([
  813, 1120, 1187, 3419, 3452, 3552, 3585, 3607, 3798, 3918,
  3940, 4077, 4109, 4131, 4164, 4229, 4262, 4314, 4418, 4473,
]);

/** id -> [bounds, render scale, duration]. */
export { growthParameters }; 

const growthParameters = Object.freeze({
  813: [7.0, 8.0, 5.0], 1120: [7.0, 8.0, 20.0], 1187: [10.0, 1.0, 2000.0], 3419: [12.0, 20.0, 20.0], 3452: [14.0, 10.0, 90.0],
  3552: [6.0, 5.0, 5.0], 3585: [15.0, 15.0, 15.0], 3607: [10.0, 35.0, 10.0], 3798: [9.0, 5.0, 10.0], 3918: [13.0, 1.0, 50.0],
  3940: [15.0, 1.0, 50.0], 4077: [16.0, 10.0, 200.0], 4109: [7.0, 35.0, 8.0], 4131: [12.0, 15.0, 15.0], 4164: [10.0, 8.0, 5.0],
  4229: [10.0, 8.0, 10.0], 4262: [15.0, 5.0, 15.0], 4314: [10.0, 12.0, 20.0], 4418: [10.0, 10.0, 10.0], 4473: [10.0, 5.0, 5.0],
});

const RENDER_STATE = 140;
const BOUNDS = 8;
const RENDER_SCALE = 64;
const GROWTH_STATE = 116;
const SIZE = 8;
const DURATION = 12;
const FRAME_BYTES = 16;

const SET_BOUNDS = 404;
const SET_SCALE = 380;
const SET_DURATION = 399;

export function createEntityGrowthHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function read(method, address) {
    try {
      return dataView()[method](address >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function write(method, address, value) {
    try {
      dataView()[method](address >>> 0, value, true);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const readUint32 = address => read('getUint32', address);
  const readFloat = address => read('getFloat32', address);
  const writeFloat = (address, value) => write('setFloat32', address, value);
  const writeDouble = (address, value) => write('setFloat64', address, value);

  const hooks = {};
  for (const [id, [bounds, renderScale, duration]] of Object.entries(growthParameters)) {
    hooks[id] = (_dead, entity) => {
      const frame = (runtime.stackPointer.value - FRAME_BYTES) >>> 0;
      runtime.stackPointer.value = frame;
      const render = readUint32(entity + RENDER_STATE);
      writeDouble(frame, bounds);
      runtime.call(SET_BOUNDS, (render + BOUNDS) >>> 0, frame);
      writeFloat((render + RENDER_SCALE) >>> 0, renderScale);

      const growth = readUint32(entity + GROWTH_STATE);
      const size = (growth + SIZE) >>> 0;
      const remaining = (growth + DURATION) >>> 0;
      writeFloat(frame, duration);
      const oldDuration = readFloat(remaining);
      if (oldDuration <= 0) {
        runtime.call(SET_SCALE, size, frame);
      } else {
        writeFloat(frame + 12, Math.fround(Math.fround(readFloat(size) * duration) / oldDuration));
        runtime.call(SET_SCALE, size, (frame + 12) >>> 0);
      }
      runtime.call(SET_DURATION, remaining, frame);
      runtime.stackPointer.value = (frame + FRAME_BYTES) >>> 0;
    };
  }
  return Object.freeze(hooks);
}
