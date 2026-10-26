import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createBumpAllocatorHook, functionIds, BUMP_POINTER} from '../source/game/server/bump-allocator.mjs';

let comparisons = 0;
after(() => console.log(
  `server bump-allocator oracle comparisons: ${comparisons} total; `
  + 'alignment, pointer advance and overflow'));

test('bump allocator 155 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 4], construct: false});
  const hook = createBumpAllocatorHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const base = 0x3c0000;
  assert.equal(hook[155].length, runtime.exports.__fn155.length);
  const bytesList = [0, 1, 2, 3, 4, 5, 7, 8, 15, 16, 17, 31, 64, 255, 256, 0xfffffff8, 0xffffffff];
  for (const startOffset of [0, 4, 12]) {
    for (const bytes of bytesList) {
      memory.fill(0x33, base - 32, base + 512);
      view.setUint32(BUMP_POINTER, base + startOffset, true);
      const before = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(155, bytes);
      const expectedMemory = Buffer.from(memory);
      memory.set(before);
      runtime.stackPointer.value = stack;
      const actual = hook[155](bytes);
      assert.equal(actual, expected, `${startOffset}/${bytes}: result`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${startOffset}/${bytes}: memory`);
      assert.equal(runtime.stackPointer.value, stack, `${bytes}: stack`);
      comparisons++;
    }
  }
});
