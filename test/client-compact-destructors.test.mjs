import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createCompactDestructorHooks, functionIds} from '../source/game/client/compact-destructors.mjs';

let comparisons = 0;
after(() => console.log(
  `client compact destructor oracle comparisons: ${comparisons} total; enable, vector and record paths`));

test('compact destructors match original memory and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 377, 416, 362], construct: false});
  const hooks = createCompactDestructorHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const enabled of [0, 1]) {
    memory.set(clean);
    new DataView(runtime.memory.buffer).setUint8(7932376, enabled, true);
    new DataView(runtime.memory.buffer).setUint8(7932368, enabled, true);
    new DataView(runtime.memory.buffer).setUint32(7932372, 7, true);
    new DataView(runtime.memory.buffer).setUint32(7932364, 9, true);
    let expectedError = null;
    try {
      runtime.call(2494);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    new DataView(runtime.memory.buffer).setUint8(7932376, enabled, true);
    new DataView(runtime.memory.buffer).setUint8(7932368, enabled, true);
    new DataView(runtime.memory.buffer).setUint32(7932372, 7, true);
    new DataView(runtime.memory.buffer).setUint32(7932364, 9, true);
    let actualError = null;
    try {
      hooks[2494]();
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `2494/${enabled}: trap`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `2494/${enabled}: memory`);
    comparisons++;
  }

  for (const id of [2662, 2683]) {
    memory.set(clean);
    let expectedError = null;
    try {
      runtime.call(id, 0);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    const stack = runtime.stackPointer.value;
    let actualError = null;
    try {
      hooks[id](0);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.equal(comparisons, 4);
});
