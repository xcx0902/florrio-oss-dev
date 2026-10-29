/** Recovered client record/list helpers and numeric utilities (no calls).
 *
 * 440 walks a global singly linked list for the first node whose first word is
 * zero. 605 is a one-shot registry initialiser. 891 XORs a byte buffer with a
 * repeating 25-byte mask. 821 advances a Park-Miller state and publishes an
 * f32 in [0,1). 1135 resets a stream object and updates its flags. 711 is a
 * three-state transition helper. 1940 compares two signed dword arrays.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;
const F32_MULTIPLIER = new Float32Array(new Uint32Array([0x31490fdb]).buffer)[0];

export const functionIds = Object.freeze([440, 605, 711, 821, 891, 1135, 1940]);

export function createRecordHooks(runtime) {
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
  const u8 = address => access('getUint8', address);
  const u32At = address => access('getUint32', address, true);
  const set8 = (address, value) => access('setUint8', address, value);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const set64 = (address, value) => access('setBigUint64', address, value, true);
  const setF32 = (address, value) => access('setFloat32', address, value, true);

  return {
    // 440: first list node with a zero first word; return its +4 word, or 0.
    440: () => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      set32(at(frame, 4), 1);
      let node = u32At(7944468);
      let result = 0;
      while (node) {
        if (u32At(node) === 0) {
          result = u32At(at(node, 4));
          break;
        }
        node = u32At(at(node, 8));
      }
      runtime.stackPointer.value = u32(frame + 16);
      return result | 0;
    },

    // 605: run once when the registry word is -1. The stack frame is scratch
    // only; the stack pointer itself is not changed by the original.
    605: () => {
      const frame = u32(runtime.stackPointer.value - 16);
      if (u32At(132100) !== 0xffffffff) return;
      if (!u8(7944472)) set8(7944472, 1);
      set32(132096, 4);
      set32(132100, 0);
      set32(at(frame, 12), 0);
      if (u32At(at(frame, 12)) !== 0) {
        set32(132096, 16);
        set32(132100, 2);
      }
    },

    // 711: three-state transition. Null current value initialises; equal value
    // with status 2 updates the payload; anything else enters the error state.
    711: (p0, p1, p2) => {
      const current = u32At(at(p0, 16));
      if (!current) {
        set32(at(p0, 36), 1);
        set32(at(p0, 24), p2);
        set32(at(p0, 16), p1);
        return;
      }
      if (p1 === current && u32At(at(p0, 24)) === 2) {
        set32(at(p0, 24), p2);
        return;
      }
      set8(at(p0, 54), 1);
      set32(at(p0, 24), 2);
      set32(at(p0, 36), u32(u32At(at(p0, 36)) + 1));
    },

    // 821: Park-Miller step with a 31-bit folded reduction, then a scaled f32.
    821: (p0, p1) => {
      if (!p1) return;
      const state = u32At(7948176);
      const quotient = Math.floor(state / 44488);
      const remainder = u32(state - Math.imul(quotient, 44488));
      const high = Math.imul(remainder, 48271);
      const low = Math.imul(quotient, 3399);
      const folded = (high >>> 0) < (low >>> 0) ? 0x7fffffff : 0;
      const next = (folded + ((high - low) | 0)) | 0;
      set32(7948176, next);
      const converted = Math.fround((next - 1) >>> 0);
      setF32(at(p0, 4), Math.fround(converted * F32_MULTIPLIER));
    },

    // 891: XOR data[i] with mask[i % 25] for i in [1, length). The record and
    // length are reloaded each iteration, matching the original.
    891: (p0, p1) => {
      let record = u32At(p1);
      if (u32At(at(record, 4)) < 2) return;
      let index = 1;
      do {
        const data = u32At(record);
        const address = u32(data + index);
        const mask = u32At(at(p1, 4));
        const byte = u8(address) ^ u8(u32(mask + (index % 25)));
        set8(address, byte);
        index = u32(index + 1);
        record = u32At(p1);
      } while (index < u32At(at(record, 4)));
    },

    // 1135: clear the stream state, or fail when the error flag is set.
    1135: p0 => {
      const sizeByte = u8(at(p0, 74));
      set8(at(p0, 74), (sizeByte - 1) | sizeByte);
      const flags = u32At(p0);
      if (flags & 8) {
        set32(p0, flags | 32);
        return -1;
      }
      set64(at(p0, 4), 0n);
      const base = u32At(at(p0, 44));
      set32(at(p0, 28), base);
      set32(at(p0, 20), base);
      set32(at(p0, 16), u32(base + u32At(at(p0, 48))));
      return 0;
    },

    // 1940: signed lexicographic comparison of two dword arrays.
    1940: (p0, p1, p2, p3, p4) => {
      let left = u32(p1), right = u32(p3);
      while (right !== u32(p4)) {
        if (left === u32(p2)) return -1;
        const a = u32At(left), b = u32At(right);
        if ((a | 0) < (b | 0)) return -1;
        if ((a | 0) > (b | 0)) return 1;
        left = u32(left + 4);
        right = u32(right + 4);
      }
      return left !== u32(p2) ? 1 : 0;
    },
  };
}
