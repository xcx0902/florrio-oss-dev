import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createDepthComparatorHook, functionIds} from '../source/game/server/depth-comparator.mjs';

let comparisons = 0;
after(() => console.log(
  `server depth-comparator oracle comparisons: ${comparisons} total; `
  + 'slot permutations, manager presence, NaN and exchange counts'));

test('three-slot depth comparator 139 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createDepthComparatorHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const slots = [0x410000, 0x410040, 0x410080];
  const entities = [0x411000, 0x411100, 0x411200];
  const managers = [0x412000, 0x412100, 0x412200];
  const spatial = [0x413000, 0x413100, 0x413200];
  assert.equal(hook[139].length, runtime.exports.__fn139.length);

  // Low memory is dereferenced for null entity pointers; keep the word at 100 clear.
  view.setUint32(100, 0, true);

  function reset() {
    memory.fill(0x6b, 0x410000, 0x414000);
    for (let i = 0; i < 3; i++) {
      view.setUint32(slots[i], entities[i], true);
      view.setUint32(entities[i] + 100, managers[i], true);
      view.setUint32(managers[i] + 200, spatial[i], true);
    }
  }

  function setDepth(index, value) {
    view.setFloat32(spatial[index] + 16, value, true);
  }

  function check(label) {
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(139, slots[0], slots[1], slots[2]);
    const expectedMemory = Buffer.from(memory);
    memory.set(before);
    runtime.stackPointer.value = stack;
    const actual = hook[139](slots[0], slots[1], slots[2]);
    assert.equal(actual, expected, `${label}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${label}: memory`);
    assert.equal(runtime.stackPointer.value, stack, `${label}: stack`);
    comparisons++;
  }

  const depths = [0, -0, 1, -1, 2, 0.5, 1e30, -1e30, Infinity, -Infinity];
  // All manager-present orderings of a representative depth set.
  for (const a of depths) for (const b of depths) {
    reset();
    setDepth(0, a);
    setDepth(1, b);
    setDepth(2, 2);
    check(`all/${a}/${b}/2`);
  }
  // All six slot permutations of three distinct depths.
  const permutable = [3, 1, 2];
  for (let i = 0; i < 6; i++) {
    const order = [permutable[i % 3], permutable[(i + 1) % 3], permutable[(i + 2) % 3]];
    reset();
    order.forEach((depth, index) => setDepth(index, depth));
    check(`permutation/${order}`);
  }
  // NaN payloads and both signs of NaN, including ties with ordinary depths.
  const nanBits = [0x7fc00000, 0xffc00000, 0x7f800001, 0xff800001];
  for (const bits of nanBits) {
    for (const other of [0, 1, -1, Infinity]) {
      for (const position of [0, 1, 2]) {
        reset();
        setDepth(0, other);
        setDepth(1, 1);
        setDepth(2, -1);
        const nan = new DataView(new ArrayBuffer(4));
        nan.setUint32(0, bits, true);
        setDepth(position, nan.getFloat32(0, true));
        check(`nan/${bits.toString(16)}/${other}/${position}`);
      }
    }
  }
  // Absent managers and null entity slots in every pattern.
  for (let mask = 0; mask < 8; mask++) {
    for (const nullSlot of [-1, 0, 1, 2]) {
      reset();
      setDepth(0, 4);
      setDepth(1, 2);
      setDepth(2, 0);
      for (let i = 0; i < 3; i++) {
        if ((mask >> i) & 1) view.setUint32(entities[i] + 100, 0, true);
        if (nullSlot === i) view.setUint32(slots[i], 0, true);
      }
      check(`managers/${mask}/null/${nullSlot}`);
    }
  }
  // Exchange-count coverage: already sorted, one exchange, two exchanges.
  for (const values of [[3, 2, 1], [3, 1, 2], [2, 3, 1], [1, 2, 3], [1, 3, 2], [2, 1, 3]]) {
    reset();
    values.forEach((depth, index) => setDepth(index, depth));
    check(`count/${values}`);
  }
  // Negative, signed-zero and infinite permutations exercise the other
  // comparison branch and equal-depth ties.
  for (const values of [[-3, -2, -1], [0, -0, 1], [Infinity, 0, -Infinity], [-0, 0, -0]]) {
    for (let i = 0; i < 6; i++) {
      const order = [values[i % 3], values[(i + 1) % 3], values[(i + 2) % 3]];
      reset();
      order.forEach((depth, index) => setDepth(index, depth));
      check(`branch/${order}`);
    }
  }
});
