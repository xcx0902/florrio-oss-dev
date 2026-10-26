import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRandomIntHook, functionIds} from '../source/game/server/random-int.mjs';

let comparisons = 0;
after(() => console.log(
  `server random int oracle comparisons: ${comparisons} total; seeded slots`));

test('random integer fetch matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 42], construct: false});
  const hook = createRandomIntHook(runtime)[130];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const seed of [0, 0x12345678, -1]) {
    memory.set(clean);
    const stack = runtime.stackPointer.value;
    const view = new DataView(runtime.memory.buffer);
    view.setInt32(stack - 4, seed, true);
    const setup = Buffer.from(memory);
    const expected = runtime.call(130);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook();
    assert.equal(actual, expected, `${seed}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${seed}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${seed}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 3);
});
