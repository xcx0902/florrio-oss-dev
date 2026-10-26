import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createObjectWrapperHooks, functionIds} from '../source/game/server/object-wrappers.mjs';

let comparisons = 0;
after(() => console.log(
  `server object wrapper oracle comparisons: ${comparisons} total; thin wrappers`));

test('object wrappers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, 14, 121, 241, 242, 290, 297, 337],
    construct: false,
  });
  const hooks = createObjectWrapperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    const argumentsList = [];
    if (id === 324) {
      argumentsList.push(0xb10000, 0);
    } else {
      memory.set(clean);
      const base = runtime.call(121, 512);
      memory.fill(0, base, base + 512);
      argumentsList.push(base + 256);
    }
    memory.set(Buffer.from(memory));
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    let expectedError = null;
    try {
      runtime.call(id, ...argumentsList);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    let actualError = null;
    try {
      hooks[id](...argumentsList);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 5);
});
