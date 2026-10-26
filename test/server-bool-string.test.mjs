import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createBoolStringHooks, functionIds} from '../source/game/server/bool-string.mjs';

let comparisons = 0;
after(() => console.log(
  `server bool string oracle comparisons: ${comparisons} total; false and true`));

test('boolean string writers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 123], construct: false});
  const hooks = createBoolStringHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0x910000;

  for (const id of [489, 491]) {
    for (const unused of [0, 0x1234]) {
      memory.set(clean);
      const stack = runtime.stackPointer.value;
      runtime.call(id, destination, unused);
      const expectedMemory = Buffer.from(memory);
      memory.set(clean);
      runtime.stackPointer.value = stack;
      hooks[id](destination, unused);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${unused}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${unused}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 4);
});
