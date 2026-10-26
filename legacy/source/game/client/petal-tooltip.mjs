/** Recovered client petal tooltip renderer (original function 623).
 *
 * The client caches up to seven text lines per petal id. Each cache entry is
 * 1080 bytes:
 *
 *   +0      line count (u8, at most 7)
 *   +8      seven line objects, 152 bytes each
 *   +1072   initialised flag
 *
 * A line object carries a small-string text buffer, a colour at +136 and a
 * collection of text-style fields (font scale, shadow, outline, alignment and
 * so on). Lines are appended by native helper 801; the cached lines and a
 * 128-byte layout record are then handed to native helper 691, which performs
 * the actual text layout and draw submission.
 *
 * Petal definitions live at 382064 with a 52-byte stride:
 *
 *   +0   pointer to the petal name
 *   +4   stat-line count
 *   +8   stat-line string pointers
 *   +24  rarity index (0 Common, 1 Unusual, 2 Rare, 3 Epic, 4 Legendary,
 *        5 Unique, anything else keeps the empty fallback label)
 *
 * Rarity also supplies a three-byte RGB colour from packed 64-bit tables.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([623]);
export const dependencyIds = Object.freeze([362, 382, 691, 801]);

const DEFINITIONS = 382064;
const DEFINITION_STRIDE = 52;
const CACHE = 395248;
const CACHE_STRIDE = 1080;
const CACHE_FLAG = 1072;
const LINE_ARRAY = 8;
const LINE_STRIDE = 152;
const RARITY_NAMES = Object.freeze([
  13126, // Common
  13973, // Unusual
  16248, // Rare
  19249, // Epic
  5496, // Legendary
  15898, // Unique
  125873, // empty fallback
]);
const RARITY_RED = 245047318478718n;
const RARITY_GREEN = 34218529646319n;
const RARITY_BLUE = 111187557834093n;
const DEFAULT_RGB = 0xffffff;

export function createPetalTooltipHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function u8(address) {
    try { return dataView().getUint8(address >>> 0); }
    catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function u32(address) {
    try { return dataView().getUint32(address >>> 0, true); }
    catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function set8(address, value) {
    try { dataView().setUint8(address >>> 0, value & 0xff); }
    catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function set16(address, value) {
    try { dataView().setUint16(address >>> 0, value & 0xffff, true); }
    catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function set32(address, value) {
    try { dataView().setUint32(address >>> 0, value >>> 0, true); }
    catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function set64(address, value) {
    try { dataView().setBigUint64(address >>> 0, BigInt.asUintN(64, value), true); }
    catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  /** Default text style shared by every tooltip line. */
  function initializeLine(line) {
    set64(line + 8, 1065353216n); // f32 1.0 scale, zero at +12
    set8(line, 1);
    set8(line + 116, 0);
    set32(line + 112, 0);
    set64(line + 96, 0n);
    set16(line + 76, 1);
    set32(line + 72, 1167867904); // f32 4992
    set64(line + 64, 4607182418800017408n); // f64 1.0
    set8(line + 58, 2);
    set16(line + 56, 1);
    set64(line + 48, 0n);
    set64(line + 40, 4575657221408423936n);
    set64(line + 32, 1065353216n);
    set64(line + 24, 0n);
    set64(line + 16, 4575657221408423936n);
    set64(line + 80, 0n);
    set8(line + 88, 0);
    set32(line + 104, -1);
    set8(line + 120, 0);
    set8(line + 135, 0);
    set64(line + 144, 4719772410523796111n);
    set16(line + 140, 0);
    set32(line + 136, DEFAULT_RGB);
    set8(line + 124, 0);
  }

  function appendLine(cache, sourcePointer, lengthAddress, maxLength) {
    set32(lengthAddress, maxLength);
    runtime.call(801, cache, sourcePointer, lengthAddress);
  }

  /** Cached text lines, rebuilt the first time a petal id is seen. */
  function buildCache(cache, definition) {
    runtime.call(382, cache, 0, CACHE_FLAG);
    set8(cache + CACHE_FLAG, 1);
    const scratch = runtime.stackPointer.value;
    appendLine(cache, definition, scratch + 8, 24);

    const rarity = u32(definition + 24);
    const rarityName = RARITY_NAMES[rarity <= 5 ? rarity : 6];
    set32(scratch + 8, rarityName);
    appendLine(cache, scratch + 8, scratch + 124, 14);

    let red = 255, green = 255, blue = 255;
    if (rarity <= 5) {
      const shift = BigInt(rarity * 8);
      red = Number((RARITY_RED >> shift) & 0xffn);
      green = Number((RARITY_GREEN >> shift) & 0xffn);
      blue = Number((RARITY_BLUE >> shift) & 0xffn);
    }
    const count = u8(cache);
    if (count > 0) {
      const line = cache + LINE_ARRAY + (count - 1) * LINE_STRIDE;
      if (u8(line + 136) !== red || u8(line + 137) !== green || u8(line + 138) !== blue) {
        set8(line + 136, red);
        set8(line + 137, green);
        set8(line + 138, blue);
        set8(line, 1);
        if (u8(line + 120) !== 0) set8(line + 120, 0);
      }
    }

    const next = cache + LINE_ARRAY + count * LINE_STRIDE;
    initializeLine(next);
    set8(cache, count + 1);

    const statCount = u8(definition + 4);
    for (let index = 0; index < statCount; index++)
      appendLine(cache, definition + 8 + index * 4, scratch + 124, 14);
  }

  /** Original 623: render one petal tooltip, building its cached lines first. */
  function renderPetalTooltip(p0, p1, p2, petalId, p4, p5) {
    const frame = (runtime.stackPointer.value - 128) >>> 0;
    runtime.stackPointer.value = frame;
    const cache = (CACHE + (petalId >>> 0) * CACHE_STRIDE) >>> 0;
    const definition = (DEFINITIONS + (petalId >>> 0) * DEFINITION_STRIDE) >>> 0;

    if (((((petalId - 1) & 0xff) >>> 0) > 37)) {
      runtime.stackPointer.value = frame + 128;
      return;
    }

    if (u8(cache + CACHE_FLAG) === 0) buildCache(cache, definition);

    set64(frame + 48, 0n);
    set32(frame + 32, 0);
    set32(frame + 56, -1073741824);
    set64(frame + 8, 0n);
    set64(frame + 40, 4294967298n);

    const count = u8(cache);
    runtime.call(691, p0, p1, p2, p4, p5,
      (cache + LINE_ARRAY) >>> 0, count, (frame + 8) >>> 0);

    const allocated = u32(frame + 52);
    runtime.call(362, allocated);
    set32(frame + 52, 0);
    set64(frame + 44, 0n);

    const object = u32(frame + 32);
    if (object !== 0) {
      const slot = object === ((frame + 16) >>> 0) ? 4 : 5;
      const method = u32(u32(object) + slot * 4);
      runtime.indirect({parameters: ['i32'], results: []}, method, object);
    }
    runtime.stackPointer.value = frame + 128;
  }

  return Object.freeze({623: renderPetalTooltip});
}
