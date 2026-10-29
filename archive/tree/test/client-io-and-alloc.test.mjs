import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createIoAndAllocHooks, functionIds} from '../source/game/client/io-and-alloc.mjs';

let comparisons = 0;
after(() => console.log(
  `client I/O and allocation oracle comparisons: ${comparisons} total; zero fixtures`));

test('I/O and allocation helpers match original result and memory', async () => {
  const runtime = await loadOriginal('client', {
    functionIds: [...functionIds, 13, 735, 647, 389], construct: false,
  });
  const hooks = createIoAndAllocHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    memory.set(clean);
    let expected;
    let expectedError = null;
    try {
      expected = runtime.call(id, 0, 0);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    let actual;
    let actualError = null;
    try {
      actual = hooks[id](0, 0);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    if (actualError === null) assert.equal(actual, expected, `${id}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.equal(comparisons, 3);
});
