import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createPetalFactoryHooks, functionIds} from '../source/game/server/petal-factories.mjs';

let comparisons = 0;
after(() => console.log(
  `server petal factory oracle comparisons: ${comparisons} total; constructors and type setter`));

test('petal catalog factories match originals', async () => {
  const dependencies = [14, 15, 16, 20, 64, 65, 67, 68, 147, 148];
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, ...dependencies], construct: false,
  });
  const hooks = createPetalFactoryHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  assert.deepEqual(functionIds, [
    217, 235, 327, 364, 384, 500, 509, 519, 529, 533, 539, 542, 545, 552,
    558, 565, 572, 579, 583, 590, 593, 598, 602, 612, 614, 621, 626, 629,
    634, 642, 643, 648, 650, 651, 683,
  ]);

  for (const id of functionIds.filter(value => value !== 217)) {
    for (let trial = 0; trial < 2; trial++) {
      memory.set(clean);
      const args = [];
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(id, ...args);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[id](...args);
      assert.equal(actual, expected, `${id}/${trial}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${trial}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${trial}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 68);
});
