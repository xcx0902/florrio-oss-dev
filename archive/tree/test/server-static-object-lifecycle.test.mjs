import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {
  createStaticObjectLifecycleHooks, functionIds, objectArrays, singleObjects, lazyObjects,
} from '../source/game/server/static-object-lifecycle.mjs';

let comparisons = 0;
after(() => console.log(
  `server static object lifecycle oracle comparisons: ${comparisons} total; arrays, singles and lazy init`));

test('static object lifecycle helpers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 31, 32, 37, 131], construct: false});
  const hooks = createStaticObjectLifecycleHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  assert.deepEqual(functionIds, [516, 517, 518, 520, 521, 522, 523, 524, 525, 526, 527]);
  const touched = new Set(Object.values(singleObjects));
  const guards = new Set();
  for (const {object, guard} of Object.values(lazyObjects)) { touched.add(object); guards.add(guard); }
  for (const [top, bottom] of Object.values(objectArrays)) {
    for (let address = bottom; address <= top; address += 12) touched.add(address);
  }
  let state = 0x2468ace0;

  function prepare() {
    memory.set(clean);
    // Objects must be valid (zeroed) so the native destructor has no dangling
    // pointers to follow; randomized guards still exercise both lazy paths.
    for (const address of touched) memory.fill(0, address, address + 12);
    for (const guard of guards) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      memory[guard] = 0;
    }
  }

  for (const id of functionIds) {
    for (let trial = 0; trial < 12; trial++) {
      prepare();
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(id, 0x1234);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[id](0x1234);
      assert.equal(actual, expected, `${id}/${trial}: first result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${trial}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${trial}: first memory`);
      comparisons++;

      if (lazyObjects[id]) {
        const warm = Buffer.from(memory);
        const expectedWarm = runtime.call(id, 0);
        const warmMemory = Buffer.from(memory);
        memory.set(warm);
        const actualWarm = hooks[id](0);
        assert.equal(actualWarm, expectedWarm, `${id}/${trial}: warm result`);
        assert.ok(Buffer.from(memory).equals(warmMemory), `${id}/${trial}: warm memory`);
        comparisons++;
      }
    }
  }
  assert.ok(comparisons >= 120);
});
