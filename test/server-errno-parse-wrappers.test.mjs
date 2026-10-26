import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createErrnoParseWrapperHooks, functionIds} from '../source/game/server/errno-parse-wrappers.mjs';

let comparisons = 0;
after(() => console.log(
  `server errno parse wrapper oracle comparisons: ${comparisons} total; parser calls`));

test('errno-preserving parse wrappers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, 82, 124, 184],
    construct: false,
  });
  const hooks = createErrnoParseWrapperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const [id, args] of [
    [223, [0, 0, 0]],
    [223, [0xb70000, 0xb71000, 0]],
    [296, [0, 0, 0, 0, 0]],
    [296, [0xb80000, 0xb81000, 0, 0, 0]],
  ]) {
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
  assert.ok(comparisons >= 4);
});
