import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createTwoDigitYearHooks, functionIds} from '../source/game/server/two-digit-year.mjs';

let comparisons = 0;
after(() => console.log(
  `server two-digit year oracle comparisons: ${comparisons} total; year readers`));

test('two-digit year writers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 87, 88], construct: false});
  const hooks = createTwoDigitYearHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0xb50000;
  const flags = 0xb51000;

  for (const id of functionIds) {
    for (const flagValue of [0, 4]) {
      memory.set(clean);
      memory[flags] = flagValue;
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      runtime.call(id, destination, 0, 0, flags, 0);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      hooks[id](destination, 0, 0, flags, 0);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${flagValue}: stack`);
      const low = Math.max(0, stack - 128);
      assert.ok(Buffer.from(memory.subarray(0, low)).equals(expectedMemory.subarray(0, low)), `${id}/${flagValue}: below stack`);
      assert.ok(Buffer.from(memory.subarray(stack)).equals(expectedMemory.subarray(stack)), `${id}/${flagValue}: above stack`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 4);
});
