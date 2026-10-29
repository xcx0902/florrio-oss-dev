import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFormatPaddingHook, functionIds} from '../source/game/server/format-padding.mjs';

let comparisons = 0;
after(() => console.log(
  `server format padding oracle comparisons: ${comparisons} total; spans and flags`));

test('formatting padding matches original outside dead stack', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 51, 274], construct: false});
  const hook = createFormatPaddingHook(runtime)[63];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const facet = 0x8b0000;
  const area = 0x8b1000;

  for (const flags of [0, 0x12000]) {
    for (const [target, current] of [[5, 0], [10, 4], [0, 5], [20, 20]]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      view.setUint8(facet, 0);
      view.setUint32(facet + 16, area + 64, true);
      view.setUint32(facet + 20, area, true);
      view.setUint8(facet + 75, 0xff);
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      runtime.call(63, facet, 42, target, current, flags);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      hook(facet, 42, target, current, flags);
      assert.equal(runtime.stackPointer.value, stack, `${flags}/${target}/${current}: stack`);
      const low = Math.max(0, stack - 1024);
      assert.ok(Buffer.from(memory.subarray(0, low)).equals(expectedMemory.subarray(0, low)),
        `${flags}/${target}/${current}: memory below stack`);
      assert.ok(Buffer.from(memory.subarray(stack)).equals(expectedMemory.subarray(stack)),
        `${flags}/${target}/${current}: memory above stack`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 8);
});
