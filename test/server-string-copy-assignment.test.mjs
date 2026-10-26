import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringCopyAssignmentHook, functionIds} from '../source/game/server/string-copy-assignment.mjs';

let comparisons = 0;
after(() => console.log(
  `server string copy assignment oracle comparisons: ${comparisons} total; short and long sources`));

test('string copy assignment matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 269], construct: false});
  const hook = createStringCopyAssignmentHook(runtime)[228];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0x6c0000;
  const source = 0x6c2000;
  const data = 0x6c3000;

  for (const length of [0, 1, 5, 10, 11, 22, 23, 40, 80]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    for (let index = 0; index < length; index++) memory[data + index] = 97 + (index % 26);
    if (length <= 10) {
      for (let index = 0; index < length; index++) memory[source + index] = memory[data + index];
      view.setUint8(source + 11, length);
    } else {
      view.setUint32(source, data, true);
      view.setUint32(source + 4, length, true);
      view.setUint32(source + 8, (length + 1) | 0x80000000, true);
    }
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(228, destination, source);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(destination, source);
    assert.equal(actual, expected, `${length}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${length}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${length}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 9);
});
