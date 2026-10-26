import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLogMarkerHooks, functionIds} from '../source/game/client/log-markers.mjs';

let comparisons = 0;
after(() => console.log(`client log marker oracle comparisons: ${comparisons} total`));

test('log marker matches original memory and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 630], construct: false});
  const hooks = createLogMarkerHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  memory.set(clean);
  let expectedError = null;
  try {
    runtime.call(2380, 0);
  } catch (error) {
    expectedError = error;
  }
  const expectedMemory = Buffer.from(memory);
  memory.set(clean);
  let actualError = null;
  try {
    hooks[2380](0);
  } catch (error) {
    actualError = error;
  }
  assert.equal(actualError !== null, expectedError !== null, 'trap');
  assert.ok(Buffer.from(memory).equals(expectedMemory), 'memory');
  comparisons++;
  assert.equal(comparisons, 1);
});
