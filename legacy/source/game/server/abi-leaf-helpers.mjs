/** Recovered sp_server ABI leaf helpers (original 76–736 selection).
 *
 * These bodies were still machine code but contain no calls. They are constant
 * limits/flags, trivial accessors, small stores or table lookups; recovering
 * them removes the last unexplained machine bodies in the 70–736 span.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([
  76, 108, 175, 176, 224, 270, 293, 294, 298, 335, 370, 429, 449, 450, 453,
  462, 466, 468, 493, 494, 604, 627, 635, 637, 638, 639, 729, 730, 735, 736,
]);

export function createAbiLeafHelperHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    76: () => 0,
    108: (address) => memoryView().setUint32(address >>> 0, 67109634, true),
    175: () => 2147483647,
    176: () => 127,
    224: (_a, _b, value, _d, out) => {
      memoryView().setUint32(out >>> 0, value, true);
      return 3;
    },
    270: () => {},
    293: (_self, value) => value,
    294: (_a, _b, first, _d, firstOut, second, _f, secondOut) => {
      const memory = memoryView();
      memory.setUint32(firstOut >>> 0, first, true);
      memory.setUint32(secondOut >>> 0, second, true);
      return 3;
    },
    298: () => 4,
    335: () => 2,
    370: () => -1,
    429: () => 1,
    449: () => { throw new WebAssembly.RuntimeError('unreachable'); },
    450: () => { throw new WebAssembly.RuntimeError('unreachable'); },
    453: (_r, first, second) => (first > -1 ? first : second),
    462: (_r, low, high) => {
      const value = low < 128 ? low : high;
      return (value << 24) >> 24;
    },
    466: (_r, index) => (index >>> 0) <= 127
      ? memoryView().getInt32(10352 + (index << 2), true)
      : index,
    468: (_r, index) => (index >>> 0) <= 127
      ? memoryView().getInt32(11888 + (index << 2), true)
      : index,
    493: (self) => memoryView().getInt8((self >>> 0) + 9),
    494: (self) => memoryView().getInt8((self >>> 0) + 8),
    604: (self) => {
      const memory = memoryView();
      const counter = (memory.getUint32(8570712, true) + 1) >>> 0;
      memory.setUint32(8570712, counter, true);
      memory.setUint32((self >>> 0) + 4, counter, true);
    },
    627: (self) => memoryView().getInt32((self >>> 0) + 12, true),
    635: () => -1,
    637: (self) => {
      const memory = memoryView();
      memory.setUint32((self >>> 0) + 8, 0xffffffff, true);
      memory.setUint32((self >>> 0) + 12, 0xffffffff, true);
      memory.setBigUint64(self >>> 0, 0n, true);
    },
    638: (self) => {
      const memory = memoryView();
      memory.setUint32((self >>> 0) + 8, 0xffffffff, true);
      memory.setUint32((self >>> 0) + 12, 0xffffffff, true);
      memory.setBigUint64(self >>> 0, 0n, true);
    },
    639: (self) => self,
    729: () => 0.25,
    730: () => Infinity,
    735: (self) => memoryView().setBigUint64(self >>> 0, 0n, true),
    736: () => Math.fround(0.7),
  });
}
