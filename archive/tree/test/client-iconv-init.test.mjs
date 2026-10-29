import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createIconvInitHooks, functionIds} from '../source/game/client/iconv-init.mjs';

let comparisons = 0;
after(() => console.log(`client iconv init oracle comparisons: ${comparisons} total`));

test('iconv initialiser matches original memory', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 88], construct: false});
  const hooks = createIconvInitHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const descriptor of [0, 3]) {
    memory.set(clean);
    let expectedError = null;
    try { runtime.call(2330, descriptor); } catch (error) { expectedError = error; }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    let actualError = null;
    try { hooks[2330](descriptor); } catch (error) { actualError = error; }
    assert.equal(actualError !== null, expectedError !== null, `${descriptor}: trap`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${descriptor}: memory`);
    comparisons++;
  }
  assert.equal(comparisons, 2);
});
