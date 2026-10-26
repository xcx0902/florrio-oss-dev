import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createByteMoveHook, functionIds} from '../source/game/server/byte-move.mjs';

let comparisons = 0;
after(() => console.log(
  `server memmove oracle comparisons: ${comparisons} total; `
  + 'overlap directions, disjoint ranges and zero length'));

test('memmove 261 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createByteMoveHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const base = 0x3f0000;
  assert.equal(hook[261].length, runtime.exports.__fn261.length);
  for (let index = 0; index < 256; index++) memory[base + index] = index;
  const cases = [];
  for (const count of [0, 1, 2, 3, 7, 16, 31, 64, 127]) {
    for (const offset of [-64, -16, -1, 0, 1, 16, 64]) cases.push([base + 128, base + 128 + offset, count]);
    cases.push([base + 32, base + 96, count], [base + 96, base + 32, count]);
  }
  for (const [destination, source, count] of cases) {
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(261, destination, source, count);
    const expected = Buffer.from(memory);
    memory.set(before);
    runtime.stackPointer.value = stack;
    hook[261](destination, source, count);
    assert.ok(Buffer.from(memory).equals(expected),
      `${destination}/${source}/${count}: memory`);
    assert.equal(runtime.stackPointer.value, stack, `${count}: stack`);
    comparisons++;
  }
});
