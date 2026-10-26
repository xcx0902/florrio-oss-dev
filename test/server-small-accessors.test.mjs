import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSmallAccessorHooks, functionIds} from '../source/game/server/small-accessors.mjs';

let comparisons = 0;
after(() => console.log(
  `server small accessor oracle comparisons: ${comparisons} total; field, zero, vtable and constant`));

test('small accessors match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createSmallAccessorHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0x830000;

  for (const value of [0, 7, -1, 0x12345678]) {
    memory.set(clean);
    new DataView(runtime.memory.buffer).setInt32(record + 8, value, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(628, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hooks[628](record);
    assert.equal(actual, expected, `628/${value}`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `628/${value}: memory`);
    comparisons++;
  }

  for (const args of [[0, 0n, 0], [record, -1n, 5]]) {
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(649, ...args);
    const actual = hooks[649](...args);
    assert.equal(actual, expected, '649');
    assert.equal(runtime.stackPointer.value, stack, '649: stack');
    comparisons++;
  }

  memory.set(clean);
  const stack = runtime.stackPointer.value;
  const expected722 = runtime.call(722, record);
  const expectedMemory = Buffer.from(memory);
  memory.set(clean);
  runtime.stackPointer.value = stack;
  const actual722 = hooks[722](record);
  assert.equal(actual722, expected722, '722: result');
  assert.ok(Buffer.from(memory).equals(expectedMemory), '722: memory');
  comparisons++;

  assert.equal(hooks[737](), runtime.call(737), '737: value');
  comparisons++;
  assert.ok(comparisons >= 8);
});
