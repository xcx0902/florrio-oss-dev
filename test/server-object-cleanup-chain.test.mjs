import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createObjectCleanupChainHooks, functionIds} from '../source/game/server/object-cleanup-chain.mjs';

let comparisons = 0;
after(() => console.log(
  `server cleanup chain oracle comparisons: ${comparisons} total; zeroed payloads`));

test('cleanup chain matches originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 242, 121], construct: false});
  const hooks = createObjectCleanupChainHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    memory.set(clean);
    const base = runtime.call(121, 512);
    memory.fill(0, base, base + 512);
    const record = id === 241 ? base + 256 : base + 8;
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    let expectedError = null;
    try {
      runtime.call(id, record);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    let actualError = null;
    try {
      hooks[id](record);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
