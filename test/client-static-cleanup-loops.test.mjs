import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStaticCleanupHooks, functionIds} from '../source/game/client/static-cleanup-loops.mjs';

let comparisons = 0;
after(() => console.log(`client static cleanup oracle comparisons: ${comparisons} total`));

test('static cleanup loops match original memory', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 413], construct: false});
  const hooks = createStaticCleanupHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    memory.set(clean);
    let expectedError = null;
    try { runtime.call(id, 0); } catch (error) { expectedError = error; }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    let actualError = null;
    try { hooks[id](0); } catch (error) { actualError = error; }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.equal(comparisons, 3);
});
