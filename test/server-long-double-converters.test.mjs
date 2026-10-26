import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLongDoubleConverterHooks, functionIds} from '../source/game/server/long-double-converters.mjs';

let comparisons = 0;
after(() => console.log(
  `server long-double converter oracle comparisons: ${comparisons} total; wrappers`));

test('floating conversion wrappers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, 66, 188, 357, 121],
    construct: false,
  });
  const hooks = createLongDoubleConverterHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0xb20000;

  for (const [first, second, third, fourth] of [
    [0n, 0n, 0n, 0n],
    [1n, 2n, 3n, 4n],
    [-1n, 0x7fn, 0n, 1n << 62n],
  ]) {
    memory.set(clean);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(258, destination, first, second, third, fourth);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hooks[258](destination, first, second, third, fourth);
    assert.equal(runtime.stackPointer.value, stack, `${first}: stack`);
    const low = Math.max(0, stack - 192);
    assert.ok(Buffer.from(memory.subarray(0, low)).equals(expectedMemory.subarray(0, low)), `${first}: below stack`);
    assert.ok(Buffer.from(memory.subarray(stack)).equals(expectedMemory.subarray(stack)), `${first}: above stack`);
    comparisons++;
  }
  for (const [id, args] of [
    [140, [0, 0, 0, 0]],
    [356, [0xb30000, 0]],
    [356, [0, 0]],
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
    const low = Math.max(0, stack - 192);
    assert.ok(Buffer.from(memory.subarray(0, low)).equals(expectedMemory.subarray(0, low)), `${id}: below stack`);
    assert.ok(Buffer.from(memory.subarray(stack)).equals(expectedMemory.subarray(stack)), `${id}: above stack`);
    comparisons++;
  }
  assert.ok(comparisons >= 6);
});
