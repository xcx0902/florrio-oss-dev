import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createGlobalLocaleCacheHook, functionIds} from '../source/game/server/global-locale-cache.mjs';

let comparisons = 0;
after(() => console.log(
  `server global locale cache oracle comparisons: ${comparisons} total; repeated slot writes`));

test('global locale cache matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 33], construct: false});
  const hook = createGlobalLocaleCacheHook(runtime)[302];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const slot of [0x810000, 0x810004, 0x810008]) {
    memory.set(clean);
    const stack = runtime.stackPointer.value;
    runtime.call(302, slot);
    const expectedMemory = Buffer.from(memory);
    const expected = new DataView(runtime.memory.buffer).getUint32(slot, true);
    memory.set(clean);
    runtime.stackPointer.value = stack;
    hook(slot);
    const actual = new DataView(runtime.memory.buffer).getUint32(slot, true);
    assert.equal(actual, expected, `${slot}: value`);
    assert.equal(runtime.stackPointer.value, stack, `${slot}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${slot}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 3);
});
