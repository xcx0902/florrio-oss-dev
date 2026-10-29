import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createPointerArrayHook, functionIds, dependencyIds} from '../source/game/server/allocation.mjs';

let comparisons = 0;
after(() => console.log(
  `server pointer-array allocation oracle comparisons: ${comparisons} total; `
  + 'small/large counts and abort threshold'));

test('pointer array allocation 121 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, ...dependencyIds], construct: false});
  const hook = createPointerArrayHook(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  assert.equal(hook[121].length, runtime.exports.__fn121.length);
  for (const count of [0, 1, 2, 7, 1024, 0x100000, 0x3fffffff, 0x40000000, 0x40000001, 0xffffffff]) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    let expected, expectedError;
    try { expected = runtime.call(121, count); }
    catch (error) { expectedError = error; }
    const expectedMemory = Buffer.from(bytes);
    bytes.set(before);
    runtime.stackPointer.value = stack;
    let actual, actualError;
    try { actual = hook[121](count); }
    catch (error) { actualError = error; }
    if (expectedError) {
      assert.equal(actualError?.constructor, expectedError.constructor, `${count}: error type`);
      assert.equal(actualError?.message, expectedError.message, `${count}: error message`);
    } else {
      assert.equal(actualError, undefined, `${count}: unexpected error`);
      assert.equal(actual, expected, `${count}: pointer`);
    }
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${count}: complete memory`);
    assert.equal(runtime.stackPointer.value, stack, `${count}: stack`);
    comparisons++;
  }
});
