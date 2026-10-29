/** Recovered client particle-path record update (original 683).
 *
 * Arguments: a descriptor carrying a count pointer at +0, a 40-byte record
 * array at +4, a four-float source struct at +8, and a six-float accumulator at
 * +12. The function appends one record, folds the four source values through
 * paired min/max loops, and updates both the accumulator and the source. Float
 * comparisons preserve the original swap-loop order, including NaN and zero
 * behaviour. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([683, 1105]);

export function createParticleRecordHooks(runtime) {
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
  const i32At = address => access('getInt32', address, true);
  const u32At = address => access('getUint32', address, true);
  const f32At = address => access('getFloat32', address, true);
  const set32 = (address, value) => access('setInt32', address, value, true);
  const setF32 = (address, value) => access('setFloat32', address, value, true);
  const f32 = Math.fround;

  // The WAT swaps its two locals before every comparison, so a NaN pair exits
  // in swapped order instead of propagating a conventional min/max.
  function orderedPair(first, second) {
    let a = f32(first), b = f32(second);
    for (;;) {
      const x = b, y = a;
      if (!(x > y)) return [x, y];
      a = x;
      b = y;
    }
  }
  function fmax(a, b) {
    const left = f32(a), right = f32(b);
    if (Number.isNaN(left) || Number.isNaN(right)) return NaN;
    if (left === 0 && right === 0) {
      if (Object.is(left, -0) && Object.is(right, -0)) return -0;
      return 0;
    }
    return left > right ? left : right;
  }
  const select = (condition, whenTrue, whenFalse) =>
    condition ? whenTrue : whenFalse;


  function append1105(descriptor) {
    const countPointer = u32At(descriptor);
    const count = (i32At(countPointer) + 1) | 0;
    set32(countPointer, count);
    const record = (u32At(descriptor + 4) + Math.imul(count, 40)) >>> 0;
    const source = u32At(descriptor + 8);
    const accumulator = u32At(descriptor + 12);
    const first = f32At(source);
    const second = f32At(source + 4);
    const third = f32At(source + 8);
    const fourth = f32At(source + 12);

    set32(record + 32, u32At(source + 8));
    set32(record + 36, u32At(source + 12));
    set32(record + 24, u32At(source));
    set32(record + 28, u32At(source + 4));

    const [minA, maxA] = orderedPair(first, 0);
    const [minB, maxB] = orderedPair(second, 0);
    const [minC, maxC] = orderedPair(third, 0);
    const [minD, maxD] = orderedPair(fourth, 0);

    const value60 = select(minD > 10, minD, select(maxD < 10, maxD, 10));
    const value56 = select(minC > 0, minC, select(maxC < 0, maxC, 0));
    const value44 = select(minB > 10, minB, select(maxB < 10, maxB, 10));
    const value40 = select(minA > 0, minA, select(maxA < 0, maxA, 0));

    setF32(record + 60, value60);
    setF32(record + 56, value56);
    setF32(record + 48, 0);
    setF32(record + 52, 10);
    setF32(record + 44, value44);
    setF32(record + 40, value40);

    setF32(accumulator + 8, fmax(f32At(accumulator + 8), 0));
    setF32(accumulator + 4, f32(f32At(accumulator + 4) + value44));
    setF32(accumulator + 20, f32(f32At(accumulator + 20) + value60));
    setF32(accumulator + 12, f32(f32At(accumulator + 12) + 10));
    const oldZero = f32At(accumulator);
    setF32(accumulator, select(value40 > oldZero, value40, oldZero));
    const oldSixteen = f32At(accumulator + 16);
    setF32(accumulator + 16, select(value56 > oldSixteen, value56, oldSixteen));

    setF32(source + 4, fmax(f32(f32At(source + 4) - value44), 0));
    setF32(source + 12, fmax(f32(f32At(source + 12) - value60), 0));
  }

  return {
    683: descriptor => {
      const countPointer = u32At(descriptor);
      const count = (i32At(countPointer) + 1) | 0;
      set32(countPointer, count);
      const record = (u32At(descriptor + 4) + Math.imul(count, 40)) >>> 0;
      const source = u32At(descriptor + 8);
      const accumulator = u32At(descriptor + 12);

      const first = f32At(source);
      const second = f32At(source + 4);
      const third = f32At(source + 8);
      const fourth = f32At(source + 12);

      set32(record + 32, u32At(source + 8));
      set32(record + 36, u32At(source + 12));
      set32(record + 24, u32At(source));
      set32(record + 28, u32At(source + 4));

      const [minA, maxA] = orderedPair(first, 0);
      const [minB, maxB] = orderedPair(second, 0);
      const [minC, maxC] = orderedPair(third, 0);
      const [minD, maxD] = orderedPair(fourth, 0);

      const value60 = select(second < minD, minD,
        select(second > maxD, maxD, second));
      const value56 = select(minC > 5, minC, select(maxC < 5, maxC, 5));
      const value44 = select(minB > second, minB,
        select(second > maxB, maxB, second));
      const value40 = select(minA > 5, minA, select(maxA < 5, maxA, 5));

      setF32(record + 60, value60);
      setF32(record + 56, value56);
      setF32(record + 52, second);
      setF32(record + 48, 5);
      setF32(record + 44, value44);
      setF32(record + 40, value40);

      setF32(accumulator, f32(f32At(accumulator) + value40));
      setF32(accumulator + 16, f32(f32At(accumulator + 16) + value56));
      setF32(accumulator + 8, f32(f32At(accumulator + 8) + 5));
      const oldFour = f32At(accumulator + 4);
      setF32(accumulator + 4, select(value44 > oldFour, value44, oldFour));
      const oldTwenty = f32At(accumulator + 20);
      setF32(accumulator + 20, select(oldTwenty < value60, value60, oldTwenty));
      const oldTwelve = f32At(accumulator + 12);
      setF32(accumulator + 12, select(second > oldTwelve, second, oldTwelve));

      setF32(source, fmax(f32(f32At(source) - value40), 0));
      setF32(source + 8, fmax(f32(f32At(source + 8) - value56), 0));
    },
    1105: append1105,
  };
}
