/** Affine drawing helpers and level-dependent arena band positions.
 * Complete original bodies395/410/455/562/588/631/1131. The renderer's published memory ABI
 * and Canvas argument records remain intact, including exact f32 operations.
 */
export const functionIds = Object.freeze([ 395, 410, 455, 562, 588, 631, 1131 ]);

const f32 = Math.fround;

const add = (a, b) => a + b >>> 0;

export function createDrawingPrimitiveHooks(runtime) {
  let buffer, view;
  function memory(address, size) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    if (address < 0 || address + size > view.byteLength) throw new WebAssembly.RuntimeError("memory access out of bounds");
    return view;
  }
  const byte = a => memory(a, 1).getUint8(a), uint = a => memory(a, 4).getUint32(a, true);
  const float = a => memory(a, 4).getFloat32(a, true), double = a => memory(a, 8).getFloat64(a, true);
  const long = a => memory(a, 8).getBigUint64(a, true);
  const putByte = (a, v) => memory(a, 1).setUint8(a, v), put = (a, v) => memory(a, 4).setUint32(a, v, true);
  const putFloat = (a, v) => memory(a, 4).setFloat32(a, v, true), putDouble = (a, v) => memory(a, 8).setFloat64(a, v, true);
  const putLong = (a, v) => memory(a, 8).setBigUint64(a, v, true);
  const canvas = (code, signature, args) => +runtime.host("a", "a", code, signature, args) | 0;
  function copyCurrentTransformToCache(renderer) {
    putLong(renderer + 24, long(renderer));
    putLong(renderer + 40, long(renderer + 16));
    putLong(renderer + 32, long(renderer + 8));
  }
  /** Original395: fill first, then synchronize the live transform and stroke. */
  function fillAndStrokeCurrentPath(renderer) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -96);
    runtime.stackPointer.value = scratch;
    put(scratch + 80, uint(renderer + 96));
    canvas(136661, 31967, scratch + 80);
    if (byte(renderer + 48)) {
      putByte(renderer + 48, 0);
      if (runtime.call(366, add(renderer, 24), renderer, 24)) {
        copyCurrentTransformToCache(renderer);
        const c = float(renderer + 8), d = float(renderer + 12), tx = float(renderer + 16),
          a = float(renderer), context = uint(renderer + 96), b = float(renderer + 4);
        putDouble(add(scratch, 64), float(renderer + 20));
        putDouble(scratch + 56, tx);
        putDouble(scratch + 48, d);
        putDouble(scratch + 40, c);
        putDouble(scratch + 32, b);
        put(scratch + 16, context);
        putDouble(scratch + 24, a);
        canvas(136414, 32144, scratch + 16);
      }
    }
    put(scratch, uint(renderer + 96));
    canvas(136732, 31967, scratch);
    runtime.stackPointer.value = saved;
  }
  /** Original455: a missing stored path returns before reading the renderer. */
  function strokeStoredPath(renderer, path) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -80);
    runtime.stackPointer.value = scratch;
    let pathHandle = uint(path);
    if (pathHandle !== 4294967295) {
      if (byte(renderer + 48)) {
        putByte(renderer + 48, 0);
        if (runtime.call(366, add(renderer, 24), renderer, 24)) {
          copyCurrentTransformToCache(renderer);
          const c = float(renderer + 8), d = float(renderer + 12), tx = float(renderer + 16),
            a = float(renderer), context = uint(renderer + 96), b = float(renderer + 4);
          putDouble(add(scratch, 64), float(renderer + 20));
          putDouble(scratch + 56, tx);
          putDouble(scratch + 48, d);
          putDouble(scratch + 40, c);
          putDouble(scratch + 32, b);
          put(scratch + 16, context);
          putDouble(scratch + 24, a);
          canvas(136414, 32144, scratch + 16);
          pathHandle = uint(path);
        }
      }
      const context = uint(renderer + 96);
      put(scratch + 4, pathHandle);
      put(scratch, context);
      canvas(136763, 32052, scratch);
    }
    runtime.stackPointer.value = saved;
  }
  /** Original1131: crop a source canvas into a transformed unit image and timestamp its use. */
  function drawCachedImageRegion(renderer, source, sourceWidth, sourceHeight, x, y, width, height) {
    const savedStack = runtime.stackPointer.value, scratch = add(savedStack, -144);
    runtime.stackPointer.value = scratch;
    if (uint(source + 96) === 4294967295) {
      runtime.stackPointer.value = savedStack;
      return;
    }
    putLong(scratch + 120, long(renderer + 16));
    putLong(scratch + 112, long(renderer + 8));
    putLong(scratch + 104, long(renderer));
    putByte(renderer + 48, 0);
    // Keep the expanded affine composition: multiplying by zero is observable
    // for nonfinite values, and regrouping additions changes f32 rounding.
    const oldTx = float(renderer + 16), oldA = float(renderer), x32 = f32(x), oldC = float(renderer + 8), y32 = f32(y);
    const translatedX = f32(oldTx + f32(f32(oldA * x32) + f32(oldC * y32)));
    const zeroTranslationX = f32(translatedX * 0), zeroTx = f32(oldTx * 0);
    const translatedA = f32(f32(oldA + f32(oldC * 0)) + zeroTx), width32 = f32(width);
    const translatedC = f32(f32(f32(oldA * 0) + oldC) + zeroTx), zeroC = f32(translatedC * 0);
    const a = f32(zeroTranslationX + f32(f32(translatedA * width32) + zeroC));
    putFloat(renderer, a);
    const zeroA = f32(translatedA * 0), height32 = f32(height);
    const c = f32(zeroTranslationX + f32(zeroA + f32(translatedC * height32)));
    putFloat(renderer + 8, c);
    const tx = f32(translatedX + f32(zeroA + zeroC));
    putFloat(renderer + 16, tx);
    const oldB = float(renderer + 4), oldD = float(renderer + 12), oldTy = float(renderer + 20), zeroTy = f32(oldTy * 0);
    const translatedB = f32(f32(oldB + f32(oldD * 0)) + zeroTy), translatedD = f32(f32(f32(oldB * 0) + oldD) + zeroTy);
    const zeroD = f32(translatedD * 0), translatedY = f32(oldTy + f32(f32(oldB * x32) + f32(oldD * y32))), zeroTranslationY = f32(translatedY * 0);
    const b = f32(f32(f32(translatedB * width32) + zeroD) + zeroTranslationY);
    putFloat(renderer + 4, b);
    const zeroB = f32(translatedB * 0), d = f32(f32(zeroB + f32(translatedD * height32)) + zeroTranslationY);
    putFloat(renderer + 12, d);
    const ty = f32(translatedY + f32(zeroB + zeroD));
    putFloat(renderer + 20, ty);
    if (runtime.call(366, add(renderer, 24), renderer, 24)) {
      copyCurrentTransformToCache(renderer);
      const context = uint(renderer + 96);
      putDouble(scratch + 64, b);
      putDouble(scratch + 72, c);
      putDouble(scratch + 80, d);
      putDouble(scratch + 88, tx);
      putDouble(add(scratch, 96), ty);
      putDouble(scratch + 56, a);
      put(scratch + 48, context);
      canvas(136414, 32144, scratch + 48);
    }
    const context = uint(renderer + 96);
    const sourceContext = uint(source + 96);
    putDouble(scratch + 32, sourceHeight);
    putDouble(scratch + 24, sourceWidth);
    putLong(scratch + 16, 0n);
    putLong(scratch + 8, 0n);
    put(scratch + 4, sourceContext);
    put(scratch, context);
    canvas(138280, 32201, scratch);
    runtime.call(372, scratch + 128);
    putLong(source + 88, long(scratch + 136));
    putLong(source + 80, long(scratch + 128));
    putLong(renderer + 16, long(scratch + 120));
    putLong(renderer + 8, long(scratch + 112));
    putLong(renderer, long(scratch + 104));
    putByte(renderer + 48, 1);
    runtime.stackPointer.value = savedStack;
  }
  /** Original562: synchronize a dirty affine matrix, then append one line. */
  function appendPathLine(renderer, point) {
    const savedStack = runtime.stackPointer.value, scratch = add(savedStack, -96);
    runtime.stackPointer.value = scratch;
    const y = float(point + 4), x = float(point);
    if (byte(renderer + 48)) {
      putByte(renderer + 48, 0);
      if (runtime.call(366, add(renderer, 24), renderer, 24)) {
        copyCurrentTransformToCache(renderer);
        const c = float(renderer + 8), tx = float(renderer + 16), a = float(renderer), context = uint(renderer + 96), b = float(renderer + 4), d = float(renderer + 12);
        putDouble(scratch + 80, float(renderer + 20));
        putDouble(scratch + 72, tx);
        putDouble(add(scratch, 64), d);
        putDouble(scratch + 56, c);
        putDouble(scratch + 48, b);
        put(scratch + 32, context);
        putDouble(scratch + 40, a);
        canvas(136414, 32144, scratch + 32);
      }
    }
    const context = uint(renderer + 96);
    putDouble(scratch + 16, y);
    putDouble(scratch + 8, x);
    put(scratch, context);
    canvas(137843, 32166, scratch);
    runtime.stackPointer.value = savedStack;
  }
  /** Original410: draw a transformed unit rectangle, preserving the caller matrix. */
  function fillRectangle(renderer, x, y, width, height) {
    const savedStack = runtime.stackPointer.value, scratch = add(savedStack, -96);
    runtime.stackPointer.value = scratch;
    putLong(scratch + 88, long(renderer + 16));
    putLong(scratch + 80, long(renderer + 8));
    putLong(scratch + 72, long(renderer));
    putByte(renderer + 48, 0);
    // Keep the expanded affine composition: multiplying by zero is observable
    // for nonfinite values, and regrouping additions changes f32 rounding.
    const oldTx = float(renderer + 16), oldA = float(renderer), x32 = f32(x), oldC = float(renderer + 8), y32 = f32(y);
    const translatedX = f32(oldTx + f32(f32(oldA * x32) + f32(oldC * y32)));
    const zeroTranslationX = f32(translatedX * 0), zeroTx = f32(oldTx * 0);
    const translatedA = f32(f32(oldA + f32(oldC * 0)) + zeroTx), width32 = f32(width);
    const translatedC = f32(f32(f32(oldA * 0) + oldC) + zeroTx), zeroC = f32(translatedC * 0);
    const a = f32(zeroTranslationX + f32(f32(translatedA * width32) + zeroC));
    putFloat(renderer, a);
    const zeroA = f32(translatedA * 0), height32 = f32(height);
    const c = f32(zeroTranslationX + f32(zeroA + f32(translatedC * height32)));
    putFloat(renderer + 8, c);
    const tx = f32(translatedX + f32(zeroA + zeroC));
    putFloat(renderer + 16, tx);
    const oldB = float(renderer + 4), oldD = float(renderer + 12), oldTy = float(renderer + 20), zeroTy = f32(oldTy * 0);
    const translatedB = f32(f32(oldB + f32(oldD * 0)) + zeroTy), translatedD = f32(f32(f32(oldB * 0) + oldD) + zeroTy);
    const zeroD = f32(translatedD * 0), translatedY = f32(oldTy + f32(f32(oldB * x32) + f32(oldD * y32))), zeroTranslationY = f32(translatedY * 0);
    const b = f32(f32(f32(translatedB * width32) + zeroD) + zeroTranslationY);
    putFloat(renderer + 4, b);
    const zeroB = f32(translatedB * 0), d = f32(f32(zeroB + f32(translatedD * height32)) + zeroTranslationY);
    putFloat(renderer + 12, d);
    const ty = f32(translatedY + f32(zeroB + zeroD));
    putFloat(renderer + 20, ty);
    if (runtime.call(366, add(renderer, 24), renderer, 24)) {
      copyCurrentTransformToCache(renderer);
      const context = uint(renderer + 96);
      putDouble(scratch + 32, b);
      putDouble(scratch + 40, c);
      putDouble(scratch + 48, d);
      putDouble(scratch + 56, tx);
      putDouble(add(scratch, 64), ty);
      putDouble(scratch + 24, a);
      put(scratch + 16, context);
      canvas(136414, 32144, scratch + 16);
    }
    put(scratch, uint(renderer + 96));
    canvas(137096, 31967, scratch);
    putLong(renderer + 16, long(scratch + 88));
    putLong(renderer + 8, long(scratch + 80));
    putLong(renderer, long(scratch + 72));
    putByte(renderer + 48, 1);
    runtime.stackPointer.value = savedStack;
  }
  /** Original631: nearest integer, with halfway values rounded away from zero. */
  function roundF32(value) {
    value = f32(value);
    const magnitude = Math.abs(value);
    if (magnitude < .5) return f32(value * 0);
    if (!(magnitude < 8388608)) return value;
    const rounded = Math.floor(magnitude + .5);
    return f32(value < 0 ? -rounded : rounded);
  }
  /** Original588: compute a 50-unit arena-band boundary for a player level. */
  function arenaBandBoundary(settings, level) {
    let fraction;
    if (byte(settings + 249) === 1) {
      const scaledTime = double(settings + 344) * (5247073869855161 * 2 ** -72);
      const progress = scaledTime < 0 ? -.1 : Math.min(scaledTime, 1) * 1.1 + -.1;
      fraction = progress < 0 ? 0 : Math.min(progress, 1);
    } else {
      if (level < 15) return -Infinity;
      // These f64 constants originated from widened f32 values in the binary.
      fraction = level <= 29 ? .30000001192092896 : level <= 44 ? .6000000238418579 : .8999999761581421;
    }
    const extent = float(settings + 252), lower = f32(extent * -.5), span = f32(extent * .5) - lower;
    const coordinate = f32(span * fraction + lower), gridCoordinate = f32(coordinate * .019999999552965164);
    return f32(roundF32(gridCoordinate) * 50);
  }
  return Object.freeze({
    395: renderer => fillAndStrokeCurrentPath(renderer >>> 0),
    455: (renderer, path) => strokeStoredPath(renderer >>> 0, path >>> 0),
    1131: (renderer, source, sw, sh, x, y, width, height) => drawCachedImageRegion(renderer >>> 0, source >>> 0, +sw, +sh, +x, +y, +width, +height),
    410: (renderer, x, y, width, height) => fillRectangle(renderer >>> 0, +x, +y, +width, +height),
    562: (renderer, point) => appendPathLine(renderer >>> 0, point >>> 0),
    588: (settings, level) => arenaBandBoundary(settings >>> 0, level | 0),
    631: roundF32
  });
}
