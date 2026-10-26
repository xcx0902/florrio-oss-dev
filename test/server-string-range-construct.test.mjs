import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringRangeConstructHooks, functionIds} from '../source/game/server/string-range-construct.mjs';

let comparisons = 0;
after(() => console.log(
  `server string range construct oracle comparisons: ${comparisons} total; ranges`));

test('string range constructors match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 351, 187], construct: false});
  const hooks = createStringRangeConstructHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0xb00000;
  const source = 0xb01000;

  for (const id of functionIds) {
    for (const length of [0, 1, 3]) {
      memory.set(clean);
      for (let index = 0; index < length; index++) memory[source + index * 4] = 65 + index;
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      runtime.call(id, destination, 0, source, source + length * 4);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      hooks[id](destination, 0, source, source + length * 4);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${length}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${length}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 6);
});
