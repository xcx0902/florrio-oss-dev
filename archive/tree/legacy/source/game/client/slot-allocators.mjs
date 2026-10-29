/** Recovered client slot allocator bridge (original 846).
 *
 * Uses the slot itself while fewer than 31 items are live, otherwise returns a
 * fresh 32-bit index array from 542.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([542, 846]);

export function createSlotAllocatorHooks(runtime) {
  return Object.freeze({
    542(count) {
      if (count >= 0x40000000) {
        runtime.call(406);
        throw new WebAssembly.RuntimeError('unreachable');
      }
      return runtime.call(371, (count << 2) >>> 0);
    },
    846(slot, count) {
      const view = new DataView(runtime.memory.buffer);
      if (view.getUint8((slot >>> 0) + 128) === 0 && count <= 30) {
        view.setUint8((slot >>> 0) + 128, 1);
        return slot;
      }
      return runtime.call(542, count);
    },
  });
}
