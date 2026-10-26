import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRefcountedStringDestructorHooks, functionIds, layoutBases} from '../source/game/client/refcounted-string-destructors.mjs';

let comparisons = 0;
after(() => console.log(
  `client refcounted string destructor oracle comparisons: ${comparisons} total; ${functionIds.length} layouts`));

test('refcounted string destructors match original memory and traps', async () => {
  const dependencies = [362, 1, 789, 619, 519, 377, 697];
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createRefcountedStringDestructorHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0xcc0000;

  for (const id of functionIds) {
    if (id === 536) continue;
    for (const linked of [false, true, 'free']) {
      memory.set(clean);
      if (linked === true) new DataView(runtime.memory.buffer).setUint32(441324, record + layoutBases[id], true);
      if (linked === 'free') new DataView(runtime.memory.buffer).setInt8(record + layoutBases[id] + 127, -1);
      let expectedError = null;
      try {
        runtime.call(id, record);
      } catch (error) {
        expectedError = error;
      }
      const expectedMemory = Buffer.from(memory);
      memory.set(clean);
      if (linked === true) new DataView(runtime.memory.buffer).setUint32(441324, record + layoutBases[id], true);
      if (linked === 'free') new DataView(runtime.memory.buffer).setInt8(record + layoutBases[id] + 127, -1);
      let actualError = null;
      try {
        hooks[id](record);
      } catch (error) {
        actualError = error;
      }
      assert.equal(actualError !== null, expectedError !== null, `${id}/${linked}: trap`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${linked}: memory`);
      comparisons++;
    }
  }
  for (const count of [0, 1]) {
    memory.set(clean);
    memory[record] = count;
    let expectedError = null;
    try {
      runtime.call(536, record);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    memory[record] = count;
    let actualError = null;
    try {
      hooks[536](record);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `536/${count}: trap`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `536/${count}: memory`);
    comparisons++;
  }
  assert.equal(comparisons, (functionIds.length - 1) * 3 + 2);
});
