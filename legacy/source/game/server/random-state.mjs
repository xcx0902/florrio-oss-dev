/** Recovered sp_server 64-bit random generator (original function 203).
 *
 * A 312-entry circular state at object+0..+2495, an index at +2496, and a
 * process-wide enable byte at 8573032. Each draw combines state[idx+1] with the
 * state entry 156 slots ahead and the previous high bits at state[idx], stores
 * the new word at state[idx], advances the index, then tempers the word with
 * the original shift/xor masks.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([203]);
export const RANDOM_ENABLED = 8573032;
const STATE_SLOTS = 312;
const INDEX_OFFSET = 2496;
const MASK64 = 0xffffffffffffffffn;
const ODD_MULTIPLIER = BigInt.asUintN(64, -5403634167711393303n);
const XOR_SHIFT_MASK_29 = 0x555555555n;
const XOR_SHIFT_MASK_17 = 8202884508482404352n;
const XOR_SHIFT_MASK_37 = BigInt.asUintN(64, -2270628950310912n);

export function createRandomStateHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function temper(word) {
    let value = word;
    value ^= (value >> 29n) & XOR_SHIFT_MASK_29;
    value ^= (value << 17n) & XOR_SHIFT_MASK_17;
    value ^= (value << 37n) & XOR_SHIFT_MASK_37;
    value ^= value >> 43n;
    return BigInt.asIntN(64, value & MASK64);
  }

  /** Original 203: next 64-bit draw from the generator's 312-word state. */
  function nextRandom(stateObject) {
    try {
      const view = dataView();
      if (view.getUint8(RANDOM_ENABLED) === 0) return 0n;
      const base = stateObject >>> 0;
      let index = view.getUint32(base + INDEX_OFFSET, true) >>> 0;
      const slotAddress = (base + (index << 3)) >>> 0;
      const ahead = view.getBigUint64(base + (((index + 156) % STATE_SLOTS) << 3), true);
      const following = view.getBigUint64(base + (((index + 1) % STATE_SLOTS) << 3), true);
      const previousHigh = view.getBigUint64(slotAddress, true) & 0xffffffff80000000n;
      const nextIndex = (index + 1) % STATE_SLOTS;
      const merged = (((following & 0x7ffffffen) | previousHigh) >> 1n);
      const next = (ahead ^ ((following & 1n) * ODD_MULTIPLIER) ^ merged) & MASK64;
      view.setBigUint64(slotAddress, next, true);
      view.setUint32(base + INDEX_OFFSET, nextIndex, true);
      return temper(next);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({203: nextRandom});
}
