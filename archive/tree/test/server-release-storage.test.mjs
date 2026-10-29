import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createReleaseStorageHook, functionIds} from '../source/game/server/release-storage.mjs';

let comparisons = 0;
after(() => console.log(
  `server release storage oracle comparisons: ${comparisons} total; inline and allocated data`));

test('storage release matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 121, 355], construct: false});
  const hook = createReleaseStorageHook(runtime)[303];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0x7a0000;

  for (const mode of ['inline', 'allocated']) {
    for (const flag of [0, 1]) {
      memory.set(clean);
      memory[record + 128] = flag;
      const data = mode === 'inline' ? record : runtime.call(121, 4);
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(303, record, data);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hook(record, data);
      assert.equal(actual, expected, `${mode}/${flag}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${mode}/${flag}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${mode}/${flag}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 4);
});
