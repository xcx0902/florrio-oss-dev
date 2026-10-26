/** Recovered client indexed three-stage forwarders (16 originals).
 *
 * Each stores three vtable pointers in a 48-byte frame and forwards the index (p2)
 * alongside a shrinking frame slot chain: frame+32, caller object, frame+8.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([
  4095, 4108, 4134, 4147, 4168, 4196, 4223, 4244, 4260, 4276, 4289, 4300,
  4368, 4382, 4408, 4437,
]);

const chains = Object.freeze({
  4095: [82496, 82544, 82676],
  4108: [82124, 82220, 82808],
  4134: [83300, 83348, 83480],
  4147: [82928, 83024, 83612],
  4168: [83996, 84044, 84176],
  4196: [84596, 84644, 84776],
  4223: [85172, 85220, 85352],
  4244: [85592, 85640, 85772],
  4260: [85916, 85964, 86096],
  4276: [86228, 86276, 86408],
  4289: [86492, 86540, 86672],
  4300: [86732, 86780, 86912],
  4368: [88124, 88172, 88304],
  4382: [88424, 88472, 88604],
  4408: [88916, 88964, 89096],
  4437: [89504, 89552, 89684],
});

export function createIndexedChainHooks(runtime) {
  const hooks = {};
  for (const [id, [firstVtable, secondVtable, thirdVtable]] of Object.entries(chains)) {
    hooks[id] = (object, index) => {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 48) >>> 0;
      runtime.stackPointer.value = frame;
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(frame + 40, firstVtable, true);
      runtime.indirect({parameters: ['i32', 'i32', 'i32'], results: []}, view.getUint32(firstVtable, true), frame + 32, index, frame + 40);
      view.setUint32(frame + 24, secondVtable, true);
      runtime.indirect({parameters: ['i32', 'i32', 'i32'], results: []}, view.getUint32(secondVtable, true), object, index, frame + 24);
      view.setUint32(frame + 16, thirdVtable, true);
      runtime.indirect({parameters: ['i32', 'i32', 'i32'], results: []}, view.getUint32(thirdVtable, true), frame + 8, index, frame + 16);
      runtime.stackPointer.value = saved;
    };
  }
  return Object.freeze(hooks);
}
