/** Recovered client petal colour updates (8 originals).
 *
 * Each original blends the entity's current colour towards a per-petal target
 * colour, pushes the result to the JavaScript side, optionally collapses the
 * colour to its luminance for grayscale petals, and finishes with a scaled
 * brightness pass.
 *
 * Entity layout used here:
 *   +0 .. +23   six floats mirrored into +24 .. +47 when the colour changes
 *   +48         "colour changed" flag, cleared on entry
 *   +69         grayscale flag
 *   +96         render id handed to every JavaScript callback
 *
 * Source layout: `+4` blend factor, `+8` red, `+9` green, `+10` blue.
 *
 * The eight bodies differ only in the target colour and in the double written
 * into the second callback payload.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([703, 704, 707, 3497, 3519, 3670, 3766, 4011]);

/** id -> target colour and the payload double. */
const variants = Object.freeze({
  703: { params: 2, red: 138, green: 194, blue: 85, scale: 7 },
  704: { params: 2, red: 206, green: 118, blue: 219, scale: 7 },
  707: { params: 2, red: 206, green: 118, blue: 219, scale: 10 },
  3497: { params: 3, red: 255, green: 148, blue: 201, scale: 10 },
  3519: { params: 3, red: 206, green: 118, blue: 219, scale: 6 },
  3670: { params: 3, red: 254, green: 255, blue: 201, scale: 7 },
  3766: { params: 3, red: 255, green: 231, blue: 99, scale: 7 },
  4011: { params: 3, red: 255, green: 148, blue: 201, scale: 7 },
});

export { variants as colorVariants };

const FRAME_BYTES = 192;
const COLOR_FLAG = 48;
const GRAYSCALE_FLAG = 69;
const RENDER_ID = 96;
const MIRROR_SOURCE = 0;
const MIRROR_DESTINATION = 24;
const MIRROR_BYTES = 24;

/** Imported helpers. */
const MEMCMP = 366;
const ROUND = 373;
const FINISH_UPDATE = 395;

/** JavaScript callbacks: (tag, code, payload). */
const NOTIFY_COLOR = Object.freeze([136878, 31967]);
const NOTIFY_MIRROR = Object.freeze([136414, 32144]);
const NOTIFY_PROGRESS = Object.freeze([137995, 32183]);
const NOTIFY_BLENDED = Object.freeze([137186, 32170]);
const NOTIFY_SHADED = Object.freeze([137456, 32170]);
const NOTIFY_SCALE = Object.freeze([138111, 93028]);

const MAX_UNSIGNED = 4294967296;
const NORMALIZE = 1 / 255;

export function createPetalColorHooks(runtime) {
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
  const readUint8 = address => read('getUint8', address);
  const readUint32 = address => read('getUint32', address);
  const readFloat = address => read('getFloat32', address);
  const writeUint8 = (address, value) => write('setUint8', address, value & 0xff);
  const writeUint32 = (address, value) => write('setUint32', address, value >>> 0);
  const writeFloat64 = (address, value) => write('setFloat64', address, value);

  /** `i32.trunc_sat_f32_u`. */
  function truncateFloat(value) {
    return value < MAX_UNSIGNED && value >= 0 ? Math.trunc(value) >>> 0 : 0;
  }
  /** `i32.trunc_sat_f64_u`. */
  function truncateDouble(value) {
    return value < MAX_UNSIGNED && value >= 0 ? Math.trunc(value) >>> 0 : 0;
  }
  /** `f32` blend of two channel values. */
  function blendChannel(factor, target, current) {
    const inverse = Math.fround(1 - factor);
    return truncateFloat(Math.fround(Math.fround(inverse * target) + Math.fround(factor * current)));
  }
  /** Gamma-ish shading applied to one channel. */
  function shadeChannel(channel) {
    const normalized = Math.fround(Math.sqrt(channel * NORMALIZE) * 0.9);
    const curved = runtime.call(ROUND, normalized * normalized * 255);
    return truncateDouble(curved);
  }
  function notify(tag, payload) {
    runtime.host('a', 'a', tag[0], tag[1], payload);
  }

  const hooks = {};
  for (const [id, variant] of Object.entries(variants)) {
    const update = (entity, source) => {
      const frame = (runtime.stackPointer.value - FRAME_BYTES) >>> 0;
      runtime.stackPointer.value = frame;

      const blend = readFloat(source + 4);
      const red = readUint8(source + 8);
      const green = readUint8(source + 9);
      const blue = readUint8(source + 10);

      writeUint32(frame + 176, readUint32(entity + RENDER_ID));
      notify(NOTIFY_COLOR, frame + 176);

      let currentRed = blendChannel(blend, variant.red, red);
      let currentBlue = blendChannel(blend, variant.blue, blue);
      let currentGreen = blendChannel(blend, variant.green, green);

      if (readUint8(entity + COLOR_FLAG) !== 0) {
        writeUint8(entity + COLOR_FLAG, 0);
        if (runtime.call(MEMCMP, (entity + MIRROR_DESTINATION) >>> 0, entity, MIRROR_BYTES) !== 0) {
          write('setBigUint64', entity + MIRROR_DESTINATION, read('getBigUint64', entity));
          write('setBigUint64', entity + MIRROR_DESTINATION + 16, read('getBigUint64', entity + 16));
          write('setBigUint64', entity + MIRROR_DESTINATION + 8, read('getBigUint64', entity + 8));
          writeFloat64(frame + 160, readFloat(entity + 20));
          writeFloat64(frame + 152, readFloat(entity + 16));
          writeFloat64(frame + 144, readFloat(entity + 12));
          writeFloat64(frame + 136, readFloat(entity + 8));
          writeFloat64(frame + 128, readFloat(entity + 4));
          writeUint32(frame + 112, readUint32(entity + RENDER_ID));
          writeFloat64(frame + 120, readFloat(entity));
          notify(NOTIFY_MIRROR, frame + 112);
        }
      }

      writeUint32(frame + 96, 0);
      writeFloat64(frame + 88, 2 * Math.PI);
      writeFloat64(frame + 80, 0);
      writeFloat64(frame + 72, variant.scale);
      writeFloat64(frame + 64, 0);
      writeFloat64(frame + 56, 0);
      writeUint32(frame + 48, readUint32(entity + RENDER_ID));
      notify(NOTIFY_PROGRESS, frame + 48);

      // Grayscale petals report one luminance, but the shading pass below still
      // uses the blended channels, exactly like the original.
      let reportRed = currentRed;
      let reportGreen = currentGreen;
      let reportBlue = currentBlue;
      if (readUint8(entity + GRAYSCALE_FLAG) !== 0) {
        const luminance = currentRed * 0.2126 + currentGreen * 0.7152 + currentBlue * 0.0722;
        reportRed = truncateDouble(luminance);
        reportGreen = reportRed;
        reportBlue = reportRed;
      }

      writeUint32(frame + 44, reportBlue);
      writeUint32(frame + 40, reportGreen);
      writeUint32(frame + 36, reportRed);
      writeUint32(frame + 32, readUint32(entity + RENDER_ID));
      notify(NOTIFY_BLENDED, frame + 32);

      const shadedRed = shadeChannel(currentRed);
      const shadedGreen = shadeChannel(currentGreen);
      const shadedBlue = shadeChannel(currentBlue);
      let finalRed = shadedRed;
      let finalGreen = shadedGreen;
      let finalBlue = shadedBlue;
      if (readUint8(entity + GRAYSCALE_FLAG) !== 0) {
        const luminance = shadedRed * 0.2126 + shadedGreen * 0.7152 + shadedBlue * 0.0722;
        finalRed = truncateDouble(luminance);
        finalGreen = finalRed;
        finalBlue = finalRed;
      }

      writeUint32(frame + 28, finalBlue);
      writeUint32(frame + 24, finalGreen);
      writeUint32(frame + 20, finalRed);
      writeUint32(frame + 16, readUint32(entity + RENDER_ID));
      notify(NOTIFY_SHADED, frame + 16);

      writeFloat64(frame + 8, 3);
      writeUint32(frame, readUint32(entity + RENDER_ID));
      notify(NOTIFY_SCALE, frame);

      runtime.call(FINISH_UPDATE, entity);
      runtime.stackPointer.value = (frame + FRAME_BYTES) >>> 0;
    };
    // Five variants take (unused, entity, source) instead of (entity, source).
    hooks[id] = variant.params === 3
      ? (_unused, entity, source) => update(entity, source)
      : (entity, source) => update(entity, source);
  }
  return Object.freeze(hooks);
}
