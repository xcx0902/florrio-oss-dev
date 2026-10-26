import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringMemberAssignHooks, functionIds} from '../source/game/server/string-member-assign.mjs';

let comparisons = 0;
after(() => console.log(
  `server string member assign oracle comparisons: ${comparisons} total; short records`));

test('string member assignments match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 228], construct: false});
  const hooks = createStringMemberAssignHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0x8e0000;
  const source = 0x8e1000;

  for (const id of [492, 498]) {
    for (const length of [0, 3, 5]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      view.setUint8(source + 12 + 11, length);
      view.setUint8(source + 16 + 11, length);
      for (let index = 0; index < length; index++) {
        memory[source + 12 + index] = 65 + index;
        memory[source + 16 + index] = 97 + index;
      }
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      runtime.call(id, destination, source);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      hooks[id](destination, source);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${length}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${length}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 6);
});
