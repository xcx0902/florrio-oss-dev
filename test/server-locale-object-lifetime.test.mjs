import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLocaleObjectLifetimeHooks, functionIds} from '../source/game/server/locale-object-lifetime.mjs';

let comparisons = 0;
after(() => console.log(
  `server locale object lifetime oracle comparisons: ${comparisons} total; retained control blocks`));

test('locale object lifetime matches originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 201, 19, 14, 121], construct: false});
  const hooks = createLocaleObjectLifetimeHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const control = 0xa30000;

  for (const id of functionIds) {
    memory.set(clean);
    const record = runtime.call(121, 64);
    memory.fill(0, record, record + 64);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(record + 4, control, true);
    view.setUint32(control + 4, 2, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(id, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hooks[id](record);
    if (id === 239) assert.equal(actual, expected, '239: result');
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
