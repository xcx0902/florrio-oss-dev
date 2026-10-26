import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createGlobalFlagResetHook, functionIds} from '../source/game/server/global-flag-reset.mjs';

let comparisons = 0;
after(() => console.log(
  `server global flag reset oracle comparisons: ${comparisons} total; set flags`));

test('global flag reset matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createGlobalFlagResetHook(runtime)[696];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  memory.set(clean);
  memory.fill(1, 8548100, 8551000);
  const setup = Buffer.from(memory);
  const stack = runtime.stackPointer.value;
  runtime.call(696, 0);
  const expectedMemory = Buffer.from(memory);
  memory.set(setup);
  runtime.stackPointer.value = stack;
  hook();
  assert.equal(runtime.stackPointer.value, stack, 'stack');
  assert.ok(Buffer.from(memory).equals(expectedMemory), 'memory');
  comparisons++;
  assert.ok(comparisons >= 1);
});
