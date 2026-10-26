import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLocaleDeleteHook, functionIds} from '../source/game/server/locale-delete.mjs';

let comparisons = 0;
after(() => console.log(
  `server locale delete oracle comparisons: ${comparisons} total; allocated objects`));

test('locale object deleter matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 239, 201, 19, 14, 121], construct: false});
  const hook = createLocaleDeleteHook(runtime)[620];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const control = 0xa50000;

  memory.set(clean);
  const record = runtime.call(121, 64);
  memory.fill(0, record, record + 64);
  const view = new DataView(runtime.memory.buffer);
  view.setUint32(record + 4, control, true);
  view.setUint32(control + 4, 2, true);
  const setup = Buffer.from(memory);
  const stack = runtime.stackPointer.value;
  runtime.call(620, record);
  const expectedMemory = Buffer.from(memory);
  memory.set(setup);
  runtime.stackPointer.value = stack;
  hook(record);
  assert.equal(runtime.stackPointer.value, stack, 'stack');
  assert.ok(Buffer.from(memory).equals(expectedMemory), 'memory');
  comparisons++;
  assert.ok(comparisons >= 1);
});
