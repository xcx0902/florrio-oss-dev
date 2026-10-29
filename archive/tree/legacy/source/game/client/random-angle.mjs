/** Recovered client random-angle generator constructors (8 original functions).
 *
 * Every constructor advances the shared Park–Miller generator
 *
 *   seed = (seed * 48271) mod 2^31-1
 *
 * using Schrage's decomposition (q=44488, r=3399), then stores
 *
 *   angle = (seed - 1) * (pi / 2^30)
 *
 * rounded to f32 in the new object's second word. The vtable identifies the
 * concrete generator class; the generator state is the module global at
 * 7948176. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze(
  [827, 828, 834, 1489, 1500, 1511, 1576, 1674].sort((a, b) => a - b));

const VTABLES = Object.freeze({
  827: 34296,
  828: 33420,
  834: 33724,
  1489: 34340,
  1500: 34384,
  1511: 34252,
  1576: 33988,
  1674: 33332,
});
const SEED_ADDRESS = 7948176;
const MODULUS = 2147483647;
const MULTIPLIER = 48271;
const QUOTIENT = 44488;
const REMAINDER = 3399;
// Exact f32 0x1.921fb6p-29, the binary's pi / 2^30 constant.
const ANGLE_SCALE = new Float32Array(new Uint32Array([0x31490fdb]).buffer)[0];

export function createRandomAngleHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function access(method, address, ...args) {
    try {
      return dataView()[method](address, ...args);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const u32At = address => access('getUint32', address, true);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const setFloat32 = (address, value) => access('setFloat32', address, value, true);

  function advanceSeed() {
    const seed = u32At(SEED_ADDRESS);
    const quotient = Math.floor(seed / QUOTIENT);
    const remainder = (seed - quotient * QUOTIENT) >>> 0;
    const product = remainder * MULTIPLIER;
    const adjustment = quotient * REMAINDER;
    const next = (product < adjustment ? product + MODULUS : product) - adjustment;
    set32(SEED_ADDRESS, next >>> 0);
    return next >>> 0;
  }

  const hooks = {};
  for (const id of functionIds) {
    hooks[id] = () => {
      const object = runtime.call(371, 8) >>> 0;
      set32(object, VTABLES[id]);
      const seed = advanceSeed();
      const fraction = Math.fround((seed - 1) >>> 0);
      setFloat32((object + 4) >>> 0, Math.fround(fraction * ANGLE_SCALE));
      return object;
    };
  }
  return hooks;
}
