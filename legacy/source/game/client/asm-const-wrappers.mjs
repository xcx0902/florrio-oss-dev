/** Recovered client asm.js constant bridge wrappers.
 *
 * Each wrapper forwards a global value to the Emscripten
 * `emscripten_asm_const_int` host import unless the slot is still -1.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const wrappers = {
  2396: 386800,
  2489: 7910248,
  2586: 7919340,
  2593: 7922284,
  2594: 7922276,
  2672: 440004,
  3863: 7932276,
  4142: 7932284,
  4175: 7932292,
  4240: 7932268,
  4451: 7932300,
  4524: 7932308,
  2495: 7932344,
  2496: 7932324,
};

const enableFlags = {2495: 7932348, 2496: 7932328};

export const functionIds = Object.freeze(Object.keys(wrappers).map(Number));

export function createAsmConstWrapperHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  const hooks = {};
  for (const [id, address] of Object.entries(wrappers)) {
    hooks[id] = () => {
      const memory = memoryView();
      if (enableFlags[id] !== undefined && memory.getUint8(enableFlags[id]) === 0) return;
      const value = memory.getUint32(address, true);
      if (value === 0xffffffff) return;
      const frame = (runtime.stackPointer.value - 16) >>> 0;
      memory.setUint32(frame, value, true);
      runtime.host('a', 'a', 141569, 31967, frame);
    };
  }
  return Object.freeze(hooks);
}
