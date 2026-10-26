import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFacetWriteHook, functionIds} from '../source/game/server/facet-write.mjs';

let comparisons = 0;
after(() => console.log(
  `server facet write oracle comparisons: ${comparisons} total; flag and count variants`));

test('facet write adapter matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 274], construct: false});
  const hook = createFacetWriteHook(runtime)[51];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const facet = 0x8a0000;
  const area = 0x8a1000;
  const source = 0x8a2000;

  for (const flags of [0, 32]) {
    for (const count of [0, 1, 4]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      view.setUint8(facet, flags);
      view.setUint32(facet + 16, area + 16, true);
      view.setUint32(facet + 20, area, true);
      view.setUint8(facet + 75, 0xff);
      for (let index = 0; index < count; index++) memory[source + index] = 65 + index;
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      runtime.call(51, facet, source, count);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      hook(facet, source, count);
      assert.equal(runtime.stackPointer.value, stack, `${flags}/${count}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${flags}/${count}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 6);
});
