import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createCatalogInitializerHook, functionIds, catalogs} from '../source/game/server/catalog-initializers.mjs';

let comparisons = 0;
after(() => console.log(
  `server lazy catalog initializer oracle comparisons: ${comparisons} total; cold and warm paths`));

test('lazy catalog initializers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 24, 27, 31, 32], construct: false});
  const hooks = createCatalogInitializerHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  assert.deepEqual(functionIds, [513, 514, 515]);
  let state = 0x13572468;

  for (const id of functionIds) {
    const catalog = catalogs[id];
    for (let trial = 0; trial < 12; trial++) {
      memory.set(clean);
      // Randomize only the table storage; guard words must start clean.
      for (let pointer = catalog.clearFrom; pointer < catalog.clearTo; pointer += 12) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        memory[pointer] = state >>> 24;
        memory[pointer + 11] = state >>> 16;
      }
      memory[catalog.outerGuard] = 0;
      memory[catalog.innerGuard] = 0;
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(id, 0);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[id](0);
      assert.equal(actual, expected, `${id}/${trial}: first result`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${trial}: cold memory`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${trial}: cold stack`);
      comparisons++;

      // Warm path: the guard is now set, so both must just return the pointer.
      const warm = Buffer.from(memory);
      const expectedWarm = runtime.call(id, 0);
      const warmMemory = Buffer.from(memory);
      memory.set(warm);
      const actualWarm = hooks[id](0);
      assert.equal(actualWarm, expectedWarm, `${id}/${trial}: warm result`);
      assert.ok(Buffer.from(memory).equals(warmMemory), `${id}/${trial}: warm memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 60);
});
