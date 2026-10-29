import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createVtableInvokerHooks, functionIds} from '../source/game/client/vtable-invokers.mjs';

let comparisons = 0;
after(() => console.log(`client vtable invoker oracle comparisons: ${comparisons} total`));

test('vtable invoker matches original memory and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds], construct: false});
  const hooks = createVtableInvokerHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  memory.set(clean);
  let expectedError = null;
  try {
    runtime.call(2044, 0, 0);
  } catch (error) {
    expectedError = error;
  }
  const expectedMemory = Buffer.from(memory);
  memory.set(clean);
  let actualError = null;
  try {
    hooks[2044](0, 0);
  } catch (error) {
    actualError = error;
  }
  assert.equal(actualError !== null, expectedError !== null, 'trap');
  assert.ok(Buffer.from(memory).equals(expectedMemory), 'memory');
  comparisons++;
  assert.equal(comparisons, 1);
});
