/** Recovered sp_server float format-spec suffix builder (original function 178).
 *
 * Appends the tail of a printf-style floating-point conversion spec to a
 * destination buffer that already contains the leading `%`. The routine writes
 *
 *   [sign] [alternate] [".*"] <payload> <conversion>
 *
 * where the optional `+` comes from flag 0x800, `#` from 0x400 and the literal
 * `.*` precision marker is emitted for every style except hex-float `a`
 * (style 260). The NUL-terminated payload supplies any length modifier text.
 * The conversion letter is selected by the low style bits (mask 260):
 *
 *   style 256 -> e/E   style 4 -> f/F   style 260 -> a/A   otherwise -> g/G
 *
 * Flag 0x4000 selects the uppercase letter. The return value is 1 exactly when
 * the `.*` marker was emitted (style != 260), letting the caller know whether a
 * precision argument belongs to the spec. No terminator is written.
 *
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([178]);
const PLUS = 0x800;
const ALTERNATE = 0x400;
const UPPERCASE = 0x4000;
const STYLE_MASK = 260;
const HEX_FLOAT = 260;

export function createFloatFormatSuffixHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function appendFloatFormatSpec(destination, payload, options) {
    try {
      const view = dataView();
      let cursor = destination >>> 0;
      if (options & PLUS) view.setUint8(cursor++, 43);
      if (options & ALTERNATE) view.setUint8(cursor++, 35);

      const style = options & STYLE_MASK;
      if (style !== HEX_FLOAT) {
        view.setUint8(cursor++, 46);
        view.setUint8(cursor++, 42);
      }

      let address = payload >>> 0;
      for (;;) {
        const character = view.getUint8(address);
        if (character === 0) break;
        view.setUint8(cursor++, character);
        address++;
      }

      const uppercase = (options & UPPERCASE) !== 0;
      let suffix;
      if (style === 256) suffix = uppercase ? 69 : 101;
      else if (style === 4) suffix = uppercase ? 70 : 102;
      else if (style === HEX_FLOAT) suffix = uppercase ? 65 : 97;
      else suffix = uppercase ? 71 : 103;
      view.setUint8(cursor, suffix);

      return style === HEX_FLOAT ? 0 : 1;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new WebAssembly.RuntimeError('memory access out of bounds');
    }
  }

  return Object.freeze({178: appendFloatFormatSpec});
}
