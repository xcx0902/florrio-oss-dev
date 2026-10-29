import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createVirtualBaseWrapperHooks, functionIds} from '../source/game/server/virtual-base-wrappers.mjs';

let comparisons = 0;
after(() => console.log(
  `server virtual-base wrapper oracle comparisons: ${comparisons} total; zero offsets`));

test('virtual-base wrappers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, 14, 121, 185, 238, 239, 241, 242, 259, 369],
    construct: false,
  });
  const hooks = createVirtualBaseWrapperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    memory.set(clean);
    const base = runtime.call(121, 768);
    memory.fill(0, base, base + 768);
    const record = base + 256;
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    let expected;
    let expectedError = null;
    try {
      expected = runtime.call(id, record);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    let actual;
    let actualError = null;
    try {
      actual = hooks[id](record);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    if (actualError === null) assert.equal(actual, expected, `${id}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
