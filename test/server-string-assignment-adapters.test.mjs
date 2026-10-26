import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringAssignmentAdapterHooks, functionIds} from '../source/game/server/string-assignment-adapters.mjs';

let comparisons = 0;
after(() => console.log(
  `server string assignment adapter oracle comparisons: ${comparisons} total; construct and assign`));

test('string assignment adapters match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 200, 228], construct: false});
  const hooks = createStringAssignmentAdapterHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0x6a0000;
  const text = 0x6a1000;
  const source = 0x6a2000;
  const data = 0x6a3000;

  for (const length of [0, 1, 5, 11, 22, 23, 40, 80]) {
    for (const mode of ['construct', 'assign-short', 'assign-long']) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      for (let index = 0; index < length; index++) memory[text + index] = 65 + (index % 26);
      memory[text + length] = 0;
      if (mode.startsWith('assign')) {
        for (let index = 0; index < length; index++) memory[data + index] = 97 + (index % 26);
        if (mode === 'assign-short') {
          for (let index = 0; index < length; index++) memory[source + index] = memory[data + index];
          view.setUint8(source + 11, length);
        } else {
          view.setUint32(source, data, true);
          view.setUint32(source + 4, length, true);
          view.setUint32(source + 8, (length + 1) | 0x80000000, true);
        }
      }
      const args = mode === 'construct'
        ? [27, [destination, text]]
        : [535, [destination, 0, 0, 0, 0, source]];
      const [id, callArgs] = args;
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(id, ...callArgs);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[id](...callArgs);
      assert.equal(actual, expected, `${id}/${length}/${mode}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${length}/${mode}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${length}/${mode}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 24);
});
