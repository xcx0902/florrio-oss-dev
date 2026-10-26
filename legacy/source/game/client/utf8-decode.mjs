/** Recovered client UTF-8 code-point decoder (original 531).
 *
 * Called as `decode(bytes, length, state)`. It writes -1 to `state` first, then
 * on success writes the decoded code point and returns the consumed byte count
 * (1..4). A zero length returns 0; malformed or truncated input returns -3 and
 * leaves the -1 sentinel. A negative length is treated as four bytes, matching
 * the original `length < 0 ? 4 : length` selection. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([531]);

export function createUtf8DecodeHooks(runtime) {
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
  const byte = address => access('getUint8', address);
  const signedByte = address => access('getInt8', address);
  const set32 = (address, value) => access('setUint32', address, value, true);

  return {
    531: (pointer, length, state) => {
      set32(state, 0xffffffff);
      if (length === 0) return 0;

      const first = signedByte(pointer);
      const lead = first & 255;
      // One-byte ASCII, including 0x00.
      if (first > -1) {
        set32(state, lead);
        return 1;
      }

      // Valid multi-byte leads are 0xC2..0xF4.
      if (((lead - 194) >>> 0) > 50) return -3;
      const available = length < 0 ? 4 : length;

      if (lead <= 223) {
        if (available < 2) return -3;
        const second = byte(pointer + 1);
        if ((second & 192) !== 128) return -3;
        set32(state, (((second & 63) | ((lead << 6) & 1984)) >>> 0));
        return 2;
      }

      if (lead <= 239) {
        if (available < 3) return -3;
        const second = byte(pointer + 1);
        if ((second & 192) !== 128) return -3;
        const third = byte(pointer + 2);
        if ((third & 192) !== 128) return -3;
        // 0xED 0xA0..0xBF would encode a UTF-16 surrogate.
        if (second > 159 && first === -19) return -3;
        const codePoint = (((lead << 12) & 61440)
          | ((second & 63) << 6)
          | (third & 63)) >>> 0;
        if (codePoint < 2048) return -3;
        set32(state, codePoint);
        return 3;
      }

      if (available < 4) return -3;
      const second = byte(pointer + 1);
      if ((second & 192) !== 128) return -3;
      const third = byte(pointer + 2);
      if ((third & 192) !== 128) return -3;
      const fourth = byte(pointer + 3);
      if ((fourth & 192) !== 128) return -3;

      const index = (lead - 240) | 0;
      if (index === 0) {
        if (second < 144) return -3;
      } else if (index === 4) {
        if (second > 143) return -3;
      }
      const codePoint = (((lead << 18) & 1835008)
        | ((second & 63) << 12)
        | ((third & 63) << 6)
        | (fourth & 63)) >>> 0;
      set32(state, codePoint);
      return 4;
    },
  };
}
