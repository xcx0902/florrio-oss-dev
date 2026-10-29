/** Recovered client indexed callback chains (7 originals).
 *
 * Two-call form: frame+16 then the caller object, both with the index. Four-call
 * form: frame+16 twice, caller object, then frame+8 through the second slot.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([
  4102, 4140, 4174, 4202, 4230, 4414, 4444,
]);

const chains = Object.freeze({
  4102: [1, 82244, 82328, 82412, 82724],
  4140: [1, 83048, 83132, 83216, 83528],
  4174: [1, 83744, 83828, 83912, 84224],
  4202: [1, 84344, 84428, 84512, 84824],
  4230: [1, 84920, 85004, 85088, 85400],
  4414: [1, 88664, 88748, 88832, 89144],
  4444: [1, 89252, 89336, 89420, 89732],
});

export function createIndexedCallbackHooks(runtime) {
  const hooks = {};
  for (const [id, [kind, ...vtables]] of Object.entries(chains)) {
    hooks[id] = (object, index) => {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 32) >>> 0;
      runtime.stackPointer.value = frame;
      const view = new DataView(runtime.memory.buffer);
      const calls = kind === 0
        ? [[frame + 16, vtables[0], 24], [object, vtables[1], 8]]
        : [[frame + 16, vtables[0], 24], [frame + 16, vtables[1], 24], [object, vtables[2], 24], [frame + 8, vtables[3], 16]];
      for (const [first, vtable, slot] of calls) {
        view.setUint32(frame + slot, vtable, true);
        runtime.indirect({parameters: ['i32', 'i32', 'i32'], results: []}, view.getUint32(vtable, true), first, index, frame + (slot === 16 ? 16 : slot));
      }
      runtime.stackPointer.value = saved;
    };
  }
  return Object.freeze(hooks);
}
