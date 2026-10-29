/** Label strings, text measurement, raster caches and cached-canvas drawing.
 * Complete bodies385/392/443/444/472/496/556/561/590/632/633/634/636/817/818/819.
 * Memory comparison/copy, allocation and fatal error services remain dependencies.
 */
export const functionIds = Object.freeze([ 385, 392, 443, 444, 472, 496, 556, 561, 590, 632, 633, 634, 636, 817, 818, 819 ]);

const f32 = Math.fround, add = (a, b) => a + b >>> 0;

export function createTextHooks(runtime) {
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
  const float = a => memory(a, 4).getFloat32(a, true), long = a => memory(a, 8).getBigUint64(a, true);
  const putByte = (a, v) => memory(a, 1).setUint8(a, v), putShort = (a, v) => memory(a, 2).setUint16(a, v, true), put = (a, v) => memory(a, 4).setUint32(a, v, true);
  const putFloat = (a, v) => memory(a, 4).setFloat32(a, v, true), putDouble = (a, v) => memory(a, 8).setFloat64(a, v, true), putLong = (a, v) => memory(a, 8).setBigUint64(a, v, true);
  const canvas = (code, signature, args) => +runtime.host("a", "a", code, signature, args) | 0;
  const signedByte = value => value << 24 >> 24;
  const integerOrSentinel = value => Math.abs(value) < 2147483648 ? Math.trunc(value) | 0 : -2147483648;
  function copyCurrentTransformToCache(renderer) {
    putLong(renderer + 24, long(renderer));
    putLong(renderer + 40, long(renderer + 16));
    putLong(renderer + 32, long(renderer + 8));
  }
  function storeTextSlice(label, destination) {
    const storage = uint(label + 124), heapLength = uint(label + 128), tag = byte(label + 135), isHeap = signedByte(tag) < 0;
    put(destination + 4, isHeap ? heapLength : tag);
    put(destination, isHeap ? storage : add(label, 124));
  }
  /** Original818: initialize renderer fields while retaining exact packed stores. */
  function initializeRenderer(renderer, color) {
    putLong(renderer + 56, 4607182418800017408n);
    putByte(renderer + 50, 2);
    putShort(renderer + 48, 1);
    putLong(renderer + 24, 1065353216n);
    putLong(renderer + 16, 0n);
    putLong(renderer + 8, 4575657221408423936n);
    putLong(renderer, 1065353216n);
    putLong(renderer + 40, 0n);
    putLong(renderer + 32, 4575657221408423936n);
    const colorBits = uint(color);
    putLong(renderer + 88, 0n);
    putShort(renderer + 68, 1);
    put(renderer + 64, colorBits);
    putLong(renderer + 72, 0n);
    putByte(renderer + 80, 0);
    put(renderer + 96, -1);
  }
  /** Original496: clear the backing canvas and restore its composite operation. */
  function clearCanvas(renderer) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -64);
    runtime.stackPointer.value = scratch;
    if (uint(renderer + 96) === 4294967295) createCanvas(renderer, 1, 1);
    putLong(scratch + 56, 0n);
    putLong(scratch + 48, 4575657221408423936n);
    putLong(scratch + 40, 1065353216n);
    if (runtime.call(366, add(renderer, 24), scratch + 40, 24)) {
      putLong(renderer + 24, long(scratch + 40));
      putLong(renderer + 40, long(scratch + 56));
      putLong(renderer + 32, long(scratch + 48));
      putByte(renderer + 48, 1);
      put(scratch + 32, uint(renderer + 96));
      canvas(136361, 31967, scratch + 32);
    }
    put(scratch + 16, uint(renderer + 96));
    canvas(136989, 31967, scratch + 16);
    put(scratch, uint(renderer + 96));
    canvas(139027, 31967, scratch);
    runtime.stackPointer.value = saved;
  }
  /** Shared text-cache flush. Its argument block is always written in native order. */
  function flushTextTransform(label, args) {
    if (!byte(label + 56)) return;
    putByte(label + 56, 0);
    const renderer = add(label, 8);
    if (!runtime.call(366, add(label, 32), renderer, 24)) return;
    copyCurrentTransformToCache(renderer);
    const c = float(label + 16), d = float(label + 20), tx = float(label + 24), a = float(label + 8), context = uint(label + 104), b = float(label + 12);
    putDouble(args + 48, float(label + 28));
    putDouble(args + 40, tx);
    putDouble(args + 32, d);
    putDouble(args + 24, c);
    putDouble(args + 16, b);
    put(args, context);
    putDouble(args + 8, a);
    canvas(136414, 32144, args);
  }
  /** Original817: measure an explicit byte slice in a renderer's current font. */
  function measureCanvasText(renderer, slice) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -96);
    runtime.stackPointer.value = scratch;
    runtime.call(372, scratch + 80);
    putLong(renderer + 88, long(scratch + 88));
    putLong(renderer + 80, long(scratch + 80));
    if (byte(renderer + 48)) {
      putByte(renderer + 48, 0);
      if (runtime.call(366, add(renderer, 24), renderer, 24)) {
        copyCurrentTransformToCache(renderer);
        const c = float(renderer + 8), d = float(renderer + 12), tx = float(renderer + 16), a = float(renderer), context = uint(renderer + 96), b = float(renderer + 4);
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
    const context = uint(renderer + 96);
    putLong(scratch + 4, long(slice));
    put(scratch, context);
    const width = +runtime.host("a", "c", 138505, 32214, scratch);
    runtime.stackPointer.value = saved;
    return width;
  }
  /** Original385: retain text width until the label content or style invalidates it. */
  function measureLabel(label) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -112);
    runtime.stackPointer.value = scratch;
    let width;
    if (byte(label + 120)) width = float(label + 116); else {
      if (!(byte(7933088) & 1) && runtime.call(369, 7933088)) {
        put(scratch + 104, -1082130432);
        initializeRenderer(7932984, scratch + 104);
        runtime.call(370, 7933088);
      }
      if (uint(7933080) === 4294967295) createCanvas(7932984, 1, 1);
      const fontSize = float(label + 148);
      if (byte(7933032)) {
        putByte(7933032, 0);
        if (runtime.call(366, 7933008, 7932984, 24)) {
          putLong(7933024, long(7933e3));
          putLong(7933016, long(7932992));
          putLong(7933008, long(7932984));
          putDouble(scratch + 48, float(7932988));
          putDouble(scratch + 56, float(7932992));
          putDouble(add(scratch, 64), float(7932996));
          putDouble(scratch + 72, float(7933e3));
          putDouble(scratch + 80, float(7933004));
          put(scratch + 32, uint(7933080));
          putDouble(scratch + 40, float(7932984));
          canvas(136414, 32144, scratch + 32);
        }
      }
      putDouble(scratch + 24, fontSize);
      put(scratch + 16, uint(7933080));
      canvas(138582, 93028, scratch + 16);
      storeTextSlice(label, scratch + 96);
      putLong(scratch + 8, long(scratch + 96));
      const measured = measureCanvasText(7932984, scratch + 8);
      if (!byte(label + 120)) putByte(label + 120, 1);
      width = f32(measured);
      putFloat(label + 116, width);
    }
    runtime.stackPointer.value = saved;
    return width;
  }
  /** Original472: do not inspect either pointer when the byte count is zero. */
  function copyBytesIfNonempty(destination, source, length) {
    if (length) runtime.call(363, destination, source, length);
    return destination | 0;
  }
  /** Original636: grow a short/heap string while replacing a byte range.
   * The capacity excludes its terminator. The replacement keeps the prefix,
   * inserts new bytes, and keeps the suffix after the removed range.
   * Scratch writes and metadata stores retain order for overlapping arguments.
   */
  function growStringAndReplace(string, oldCapacity, capacityIncrement, oldLength,
    prefixLength, removedLength, insertedLength, insertedBytes) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -16);
    runtime.stackPointer.value = scratch;
    if (capacityIncrement > add(-18, -oldCapacity)) {
      runtime.call(398);
      throw new WebAssembly.RuntimeError('unreachable');
    }
    const oldStorage = signedByte(byte(string + 11)) < 0 ? uint(string) : string;
    let allocationSize = -17;
    if (oldCapacity <= 2147483622) {
      put(scratch + 8, oldCapacity << 1);
      put(scratch + 12, add(oldCapacity, capacityIncrement));
      let capacity = uint(uint(scratch + 12) < uint(scratch + 8) ? scratch + 8 : scratch + 12);
      if (capacity >= 11) {
        const rounded = add(capacity, 16) & -16;
        capacity = add(rounded, -1);
        capacity = capacity === 11 ? rounded : capacity;
      } else capacity = 10;
      allocationSize = add(capacity, 1);
    }
    const storage = runtime.call(371, allocationSize) >>> 0;
    if (prefixLength) copyBytesIfNonempty(storage, oldStorage, prefixLength);
    if (insertedLength) copyBytesIfNonempty(add(storage, prefixLength), insertedBytes, insertedLength);
    const suffixLength = add(oldLength, -add(prefixLength, removedLength));
    if (suffixLength) copyBytesIfNonempty(add(storage, prefixLength + insertedLength),
      add(oldStorage, prefixLength + removedLength), suffixLength);
    if (oldCapacity !== 10) runtime.call(362, oldStorage);
    put(string, storage);
    put(string + 8, allocationSize | -2147483648);
    const length = add(prefixLength + insertedLength, suffixLength);
    put(string + 4, length);
    putByte(scratch + 7, 0);
    putByte(add(storage, length), byte(scratch + 7));
    runtime.stackPointer.value = saved;
  }
  /** Original561: assign bytes to an inline string, growing through the allocator. */
  function assignInlineString(destination, source, length) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -16);
    runtime.stackPointer.value = scratch;
    if (length <= 10) {
      putByte(destination + 11, length);
      const copied = copyBytesIfNonempty(destination, source, length) >>> 0;
      putByte(scratch + 15, 0);
      putByte(add(copied, length), byte(scratch + 15));
    } else {
      const oldLength = byte(destination + 11);
      growStringAndReplace(destination, 10, add(length, -10), oldLength, 0, oldLength, length, source);
    }
    runtime.stackPointer.value = saved;
  }
  /** Original590: reuse or grow the heap capacity of an existing string. */
  function assignHeapString(destination, source, length) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -16);
    runtime.stackPointer.value = scratch;
    const capacity = uint(destination + 8) & 2147483647;
    if (length < capacity) {
      const storage = uint(destination);
      put(destination + 4, length);
      const copied = copyBytesIfNonempty(storage, source, length) >>> 0;
      putByte(scratch + 15, 0);
      putByte(add(copied, length), byte(scratch + 15));
    } else {
      const oldLength = uint(destination + 4);
      growStringAndReplace(destination, add(capacity, -1), add(length, -capacity + 1), oldLength, 0, oldLength, length, source);
    }
    runtime.stackPointer.value = saved;
  }
  /** Original556: invalidate cached text only when the complete byte string changes. */
  function prepareTextLabel(label, source) {
    const destination = add(label, 124), heapLength = uint(label + 128), tag = byte(label + 135), signedTag = signedByte(tag), heap = signedTag < 0, length = heap ? heapLength : tag;
    const sourceHeapLength = uint(source + 4), sourceTag = byte(source + 11), sourceHeap = signedByte(sourceTag) < 0, sourceLength = sourceHeap ? sourceHeapLength : sourceTag;
    let same = false;
    if (length === sourceLength) {
      const sourceStorage = uint(source), bytes = sourceHeap ? sourceStorage : source, storage = uint(destination);
      if (!heap) {
        if (!signedTag) same = true; else if (byte(bytes) === (storage & 255)) {
          let remaining = tag, cursor = bytes, target = destination;
          while (--remaining) {
            const next = byte(cursor + 1);
            cursor = add(cursor, 1);
            target = add(target, 1);
            if (next !== byte(target)) break;
          }
          same = remaining === 0;
        }
      } else same = !length || !runtime.call(366, storage, bytes, length);
    }
    if (same) return;
    putByte(label, 1);
    if (byte(label + 120)) putByte(label + 120, 0);
    if (source === destination) return;
    const nextTag = byte(source + 11), nextHeap = signedByte(nextTag) < 0;
    if (signedTag >= 0) {
      if (!nextHeap) {
        putLong(destination, long(source));
        put(destination + 8, uint(source + 8));
      } else assignInlineString(destination, uint(source), uint(source + 4));
    } else {
      const storage = uint(source), nextLength = uint(source + 4);
      assignHeapString(destination, nextHeap ? storage : source, nextHeap ? nextLength : nextTag);
    }
  }
  /** Original443: draw a backing canvas as a transformed unit image and timestamp its use. */
  function drawCachedCanvas(renderer, source, x, y, width, height) {
    const savedStack = runtime.stackPointer.value, scratch = add(savedStack, -112);
    runtime.stackPointer.value = scratch;
    if (uint(source + 96) === 4294967295) {
      runtime.stackPointer.value = savedStack;
      return;
    }
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
    const context = uint(renderer + 96);
    put(scratch + 4, uint(source + 96));
    put(scratch, context);
    canvas(138211, 32052, scratch);
    runtime.call(372, scratch + 96);
    putLong(source + 88, long(scratch + 104));
    putLong(source + 80, long(scratch + 96));
    putLong(renderer + 16, long(scratch + 88));
    putLong(renderer + 8, long(scratch + 80));
    putLong(renderer, long(scratch + 72));
    putByte(renderer + 48, 1);
    runtime.stackPointer.value = savedStack;
  }
  function readTextSlice(label) {
    const length = uint(label + 128), tag = byte(label + 135), heap = signedByte(tag) < 0;
    const storage = uint(label + 124);
    return {
      pointer: heap ? storage : add(label, 124),
      length: heap ? length : tag
    };
  }
  function setLabelColor(label, colorOffset, args, code) {
    let blue = byte(label + colorOffset + 2), green = byte(label + colorOffset + 1), red = byte(label + colorOffset);
    if (byte(label + 77)) {
      const luminance = red * .2126 + green * .7152 + blue * .0722;
      const gray = luminance < 4294967296 && luminance >= 0 ? Math.trunc(luminance) >>> 0 : 0;
      blue = gray;
      green = gray;
      red = gray;
    }
    const context = uint(label + 104);
    put(args + 12, blue & 255);
    put(args + 8, green & 255);
    put(args + 4, red & 255);
    put(args, context);
    canvas(code, 32170, args);
  }
  /** Original444: regenerate an outlined text canvas only when its contents or scale require it. */
  function rasterizeLabel(label, renderer) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -464);
    runtime.stackPointer.value = scratch;
    const absC = Math.abs(float(renderer + 8)), absB = Math.abs(float(renderer + 4)), maxCB = absB < absC ? absC : absB;
    const absD = Math.abs(float(renderer + 12)), absA = Math.abs(float(renderer)), maxDA = absD > absA ? absD : absA;
    const largest = maxDA < maxCB ? maxCB : maxDA, projectedScale = f32(largest + largest);
    let regenerate = byte(label) !== 0 || uint(label + 104) === 4294967295;
    if (!regenerate) {
      const ratio = f32(projectedScale / float(label + 112));
      regenerate = ratio > 1.0001 || ratio < .4;
    }
    if (regenerate) {
      put(scratch + 448, 0);
      if (canvas(139312, 31967, scratch + 448)) {
        putByte(label, 0);
        const rasterScale = f32(projectedScale * 1.2);
        putFloat(label + 112, rasterScale);
        const fontSize = float(label + 148), backing = add(label, 8);
        clearCanvas(backing);
        const fontPixels = f32(fontSize * rasterScale), fontPixelsDouble = fontPixels;
        flushTextTransform(label, scratch + 384);
        put(scratch + 368, uint(label + 104));
        putDouble(scratch + 376, fontPixelsDouble);
        canvas(138582, 93028, scratch + 368);
        const cachedScale = float(label + 112), outlineRatio = float(label + 144), cachedFontSize = float(label + 148);
        storeTextSlice(label, scratch + 456);
        putLong(scratch + 360, long(scratch + 456));
        const requestedHeight = integerOrSentinel(fontPixelsDouble * 1.4), height = requestedHeight > 1 ? requestedHeight : 1;
        const measured = measureCanvasText(backing, scratch + 360);
        const outline = f32(cachedFontSize * outlineRatio), twiceOutline = f32(outline + outline);
        const pixelMargin = f32(cachedScale * Math.trunc(twiceOutline));
        const requestedWidth = integerOrSentinel(measured + f32(pixelMargin + pixelMargin)), width = requestedWidth > 1 ? requestedWidth : 1;
        resizeCanvas(backing, width, height);
        put(scratch + 352, uint(label + 104));
        canvas(138648, 31967, scratch + 352);
        put(scratch + 336, uint(label + 104));
        canvas(138931, 31967, scratch + 336);
        flushTextTransform(label, scratch + 272);
        put(scratch + 256, uint(label + 104));
        putDouble(scratch + 264, fontPixelsDouble);
        canvas(138582, 93028, scratch + 256);
        putLong(add(label, 64), 4607182418800017408n);
        putLong(scratch + 248, 4607182418800017408n);
        put(scratch + 240, uint(label + 104));
        canvas(137767, 93028, scratch + 240);
        const currentOutline = float(label + 144);
        put(scratch + 224, uint(label + 104));
        putDouble(scratch + 232, f32(fontPixels * currentOutline));
        canvas(138111, 93028, scratch + 224);
        setLabelColor(label, 139, scratch + 208, 137456);
        setLabelColor(label, 136, scratch + 192, 137186);
        const finalOutline = float(label + 144), centerY = integerOrSentinel((height | 0) * .5), centerX = integerOrSentinel((width | 0) * .5);
        if (finalOutline > 0) {
          const slice = readTextSlice(label);
          flushTextTransform(label, scratch + 128);
          const context = uint(label + 104);
          putDouble(scratch + 120, centerY);
          putDouble(scratch + 112, centerX);
          put(scratch + 104, slice.length);
          put(scratch + 100, slice.pointer);
          put(scratch + 96, context);
          canvas(138434, 32208, scratch + 96);
        }
        const slice = readTextSlice(label);
        flushTextTransform(label, scratch + 32);
        const context = uint(label + 104);
        putDouble(scratch + 24, centerY);
        putDouble(scratch + 16, centerX);
        put(scratch + 8, slice.length);
        put(scratch + 4, slice.pointer);
        put(scratch, context);
        canvas(138365, 32208, scratch);
      }
    }
    runtime.stackPointer.value = saved;
  }
  /** Original392: center a prepared label and draw its cached canvas. */
  function drawTextLabel(label, renderer, x, y, centerVertically) {
    const heapLength = uint(label + 128), tag = byte(label + 135);
    if (!(signedByte(tag) < 0 ? heapLength : tag)) return;
    const initialWidth = measureLabel(label), initialFont = float(label + 148), outline = f32(initialFont * float(label + 144));
    const padding = integerOrSentinel(f32(outline + outline));
    if (centerVertically) y = f32(y + f32(initialFont * -1.4) * .5);
    rasterizeLabel(label, renderer);
    if (byte(label)) return;
    x = f32(x + f32(initialWidth + f32(padding << 1)) * -.5);
    const width = measureLabel(label), font = float(label + 148), height = f32(font * 1.4), margin = f32(font * float(label + 144)), integerMargin = integerOrSentinel(f32(margin + margin));
    drawCachedCanvas(renderer, add(label, 8), x, y, f32(width + f32(integerMargin << 1)), height);
  }
  /** Original819: left-aligned label centered vertically around its original font. */
  function drawLeftAlignedLabel(label, renderer, x, y) {
    const heapLength = uint(label + 128), tag = byte(label + 135);
    if (!(signedByte(tag) < 0 ? heapLength : tag)) return;
    const initialFont = float(label + 148);
    rasterizeLabel(label, renderer);
    if (byte(label)) return;
    const width = measureLabel(label), font = float(label + 148), height = f32(font * 1.4);
    const verticalPosition = f32(y + f32(initialFont * 1.4) * -.5);
    const outline = f32(font * float(label + 144)), margin = integerOrSentinel(f32(outline + outline));
    drawCachedCanvas(renderer, add(label, 8), x, verticalPosition,
      f32(width + f32(margin << 1)), height);
  }
  /** Original632: replace a canvas and retain its position in the native lifetime list. */
  function createCanvas(renderer, width, height) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -64);
    runtime.stackPointer.value = scratch;
    const oldContext = uint(renderer + 96);
    if (oldContext !== 4294967295) {
      const previous = uint(renderer + 76);
      if (previous) put(previous + 72, uint(renderer + 72)); else if (uint(441324) === renderer) put(441324, uint(renderer + 72));
      const next = uint(renderer + 72);
      if (next) put(next + 76, previous);
      putLong(renderer + 72, 0n);
      put(scratch + 32, oldContext);
      canvas(136033, 31967, scratch + 32);
      put(renderer + 96, -1);
      put(441320, add(uint(441320), -1));
    }
    runtime.call(372, scratch + 48);
    putLong(renderer + 88, long(scratch + 56));
    putLong(renderer + 80, long(scratch + 48));
    const oldHead = uint(441324);
    if (oldHead) {
      put(renderer + 72, oldHead);
      put(oldHead + 76, renderer);
    }
    put(441324, renderer);
    if (!(byte(441332) & 1) && runtime.call(369, 441332)) {
      put(scratch + 16, 0);
      putByte(441328, canvas(135144, 31967, scratch + 16) !== 0);
      runtime.call(370, 441332);
    }
    put(scratch, width);
    put(scratch + 4, height);
    const context = canvas(byte(441328) ? 135298 : 135607, 32052, scratch);
    put(renderer + 96, context);
    initializeCanvasState(renderer);
    runtime.stackPointer.value = saved;
  }
  /** Original633: reset Canvas defaults and the shared affine cache after allocation or resize. */
  function initializeCanvasState(renderer) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -192);
    runtime.stackPointer.value = scratch;
    put(441320, add(uint(441320), 1));
    putLong(renderer + 56, 4607182418800017408n);
    putLong(renderer + 40, 0n);
    putLong(renderer + 32, 4575657221408423936n);
    putLong(renderer + 24, 1065353216n);
    putLong(renderer + 16, 0n);
    putLong(renderer + 8, 4575657221408423936n);
    putLong(renderer, 1065353216n);
    putLong(renderer + 48, 131073n);
    put(scratch + 176, uint(renderer + 96));
    canvas(135960, 31967, scratch + 176);
    putLong(renderer + 56, 4607182418800017408n);
    let context = uint(renderer + 96);
    putLong(scratch + 168, 4607182418800017408n);
    put(scratch + 160, context);
    canvas(137767, 93028, scratch + 160);
    context = uint(renderer + 96);
    putLong(scratch + 152, 4607182418800017408n);
    put(scratch + 144, context);
    canvas(138111, 93028, scratch + 144);
    if (byte(renderer + 49)) {
      putByte(renderer + 49, 0);
      put(scratch + 128, uint(renderer + 96));
      canvas(138691, 31967, scratch + 128);
    }
    if (byte(renderer + 50) !== 2) {
      putByte(renderer + 50, 2);
      put(scratch + 112, uint(renderer + 96));
      canvas(138852, 31967, scratch + 112);
    }
    context = uint(renderer + 96);
    putLong(scratch + 104, 4621819117588971520n);
    put(scratch + 96, context);
    canvas(138893, 93028, scratch + 96);
    if (byte(renderer + 48)) {
      putByte(renderer + 48, 0);
      if (runtime.call(366, add(renderer, 24), renderer, 24)) {
        copyCurrentTransformToCache(renderer);
        const c = float(renderer + 8), d = float(renderer + 12), tx = float(renderer + 16), a = float(renderer), ctx = uint(renderer + 96), b = float(renderer + 4);
        putDouble(scratch + 80, float(renderer + 20));
        putDouble(scratch + 72, tx);
        putDouble(add(scratch, 64), d);
        putDouble(scratch + 56, c);
        putDouble(scratch + 48, b);
        put(scratch + 32, ctx);
        putDouble(scratch + 40, a);
        canvas(136414, 32144, scratch + 32);
      }
    }
    context = uint(renderer + 96);
    putLong(scratch + 24, 4621819117588971520n);
    put(scratch + 16, context);
    canvas(138582, 93028, scratch + 16);
    put(scratch, uint(renderer + 96));
    canvas(138977, 31967, scratch);
    runtime.stackPointer.value = saved;
  }
  /** Original634: query canvas size, resize when needed, then clear the canvas. */
  function resizeCanvas(renderer, width, height) {
    const saved = runtime.stackPointer.value, scratch = add(saved, -48);
    runtime.stackPointer.value = scratch;
    height = height > 1 ? height : 1;
    width = width > 1 ? width : 1;
    const context = uint(renderer + 96);
    if (context !== 4294967295) {
      putLong(scratch + 40, 0n);
      put(scratch + 16, context);
      put(scratch + 24, add(scratch, 40) | 4);
      put(scratch + 20, add(scratch, 40));
      canvas(136554, 32156, scratch + 16);
      if (width !== uint(scratch + 40) || height !== uint(scratch + 44)) {
        const currentContext = uint(renderer + 96);
        put(scratch + 8, height);
        put(scratch + 4, width);
        put(scratch, currentContext);
        canvas(136473, 32152, scratch);
        initializeCanvasState(renderer);
      }
    } else createCanvas(renderer, width, height);
    clearCanvas(renderer);
    runtime.stackPointer.value = saved;
  }
  return Object.freeze({
    385: label => measureLabel(label >>> 0),
    392: (label, renderer, x, y, center) => drawTextLabel(label >>> 0, renderer >>> 0, f32(x), f32(y), center | 0),
    443: (renderer, source, x, y, w, h) => drawCachedCanvas(renderer >>> 0, source >>> 0, +x, +y, +w, +h),
    444: (label, renderer) => rasterizeLabel(label >>> 0, renderer >>> 0),
    472: (destination, source, length) => copyBytesIfNonempty(destination | 0, source | 0, length | 0),
    496: renderer => clearCanvas(renderer >>> 0),
    556: (label, source) => prepareTextLabel(label >>> 0, source >>> 0),
    561: (destination, source, length) => assignInlineString(destination >>> 0, source >>> 0, length >>> 0),
    590: (destination, source, length) => assignHeapString(destination >>> 0, source >>> 0, length >>> 0),
    632: (renderer, width, height) => createCanvas(renderer >>> 0, width | 0, height | 0),
    633: renderer => initializeCanvasState(renderer >>> 0),
    634: (renderer, width, height) => resizeCanvas(renderer >>> 0, width | 0, height | 0),
    636: (string, oldCapacity, increment, oldLength, prefix, removed, inserted, source) => growStringAndReplace(
      string >>> 0, oldCapacity >>> 0, increment >>> 0, oldLength >>> 0,
      prefix >>> 0, removed >>> 0, inserted >>> 0, source >>> 0),
    817: (renderer, slice) => measureCanvasText(renderer >>> 0, slice >>> 0),
    818: (renderer, color) => initializeRenderer(renderer >>> 0, color >>> 0),
    819: (label, renderer, x, y) => drawLeftAlignedLabel(label >>> 0, renderer >>> 0, f32(x), f32(y))
  });
}
