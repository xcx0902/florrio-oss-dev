import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createVirtualDestructorHooks, functionIds} from '../source/game/client/virtual-destructors.mjs';

let comparisons = 0;
after(() => console.log(
  `client virtual destructor oracle comparisons: ${comparisons} total; null buffer path`));

test('virtual destructors match original memory and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 362], construct: false});
  const hooks = createVirtualDestructorHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    memory.set(clean);
    let expectedError = null;
    try {
      runtime.call(id, 0);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    let actualError = null;
    try {
      hooks[id](0);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.equal(comparisons, 7);
});
