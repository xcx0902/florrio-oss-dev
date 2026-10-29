import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAbortHelperHooks, functionIds} from '../source/game/server/abort-helpers.mjs';

let comparisons = 0;
after(() => console.log(
  `server abort helper oracle comparisons: ${comparisons} total; trapping paths`));

test('abort helpers match original traps', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createAbortHelperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);

  for (const id of functionIds) {
    const setup = Buffer.from(memory);
    let expectedError = null;
    try {
      runtime.call(id);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    let actualError = null;
    try {
      hooks[id]();
    } catch (error) {
      actualError = error;
    }
    assert.ok(expectedError !== null, `${id}: original traps`);
    assert.ok(actualError !== null, `${id}: hook traps`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
