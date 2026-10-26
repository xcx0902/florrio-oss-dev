import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAsmConstCallbackHooks, functionIds} from '../source/game/client/asm-const-callbacks.mjs';

let comparisons = 0;
after(() => console.log(
  `client asm-const callback oracle comparisons: ${comparisons} total; zero records`));

test('asm-const callbacks match original memory and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds], construct: false});
  const hooks = createAsmConstCallbackHooks(runtime);
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
  assert.equal(comparisons, 3);
});
