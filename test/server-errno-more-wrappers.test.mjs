import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createErrnoMoreWrapperHooks, functionIds} from '../source/game/server/errno-more-wrappers.mjs';

let comparisons = 0;
after(() => console.log(
  `server errno more wrapper oracle comparisons: ${comparisons} total; wrapper calls`));

test('additional errno wrappers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, 82, 188, 357, 295],
    construct: false,
  });
  const hooks = createErrnoMoreWrapperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  const cases = [
    [52, [0, 0, 0, 0, 0]],
    [52, [0xb90000, 0xb91000, 0, 0, 0]],
    [340, [0, 0, 0]],
    [340, [0xba0000, 0, 0]],
    [477, [0, 0, 0]],
    [477, [0xbb0000, 0, 0]],
  ];
  for (const [id, args] of cases) {
    memory.set(clean);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(id, ...args);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hooks[id](...args);
    assert.equal(actual, expected, `${id}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    const low = Math.max(0, stack - 32);
    assert.ok(Buffer.from(memory.subarray(0, low)).equals(expectedMemory.subarray(0, low)), `${id}: below stack`);
    assert.ok(Buffer.from(memory.subarray(stack)).equals(expectedMemory.subarray(stack)), `${id}: above stack`);
    comparisons++;
  }
  assert.ok(comparisons >= 6);
});
