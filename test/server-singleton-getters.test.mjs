import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSingletonGetterHooks, functionIds} from '../source/game/server/singleton-getters.mjs';

let comparisons = 0;
after(() => console.log(
  `server singleton getter oracle comparisons: ${comparisons} total; guards`));

test('singleton getters match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 31, 32, 123], construct: false});
  const hooks = createSingletonGetterHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    memory.set(clean);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(id);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hooks[id]();
    assert.equal(actual, expected, `${id}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
