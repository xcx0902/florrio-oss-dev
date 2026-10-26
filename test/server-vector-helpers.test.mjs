import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createVectorHelperHook, functionIds, VECTOR_HEADER} from '../source/game/server/vector-helpers.mjs';

let comparisons = 0;
after(() => console.log(
  `server vector-helper oracle comparisons: ${comparisons} total; `
  + 'zeroed append at the current end'));

test('vector append helper 306 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createVectorHelperHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const base = 0x3b0000;
  assert.equal(hook[306].length, runtime.exports.__fn306.length);
  for (const beginOffset of [0, 16, 64]) {
    for (const endOffset of [0, 4, 20, 64]) {
      for (const count of [0, 1, 2, 7, 16]) {
        memory.fill(0x5a, base, base + 512);
        view.setUint32(VECTOR_HEADER, base + beginOffset, true);
        view.setUint32(VECTOR_HEADER + 4, base + endOffset, true);
        const before = Buffer.from(memory);
        const stack = runtime.stackPointer.value;
        runtime.call(306, count);
        const expected = Buffer.from(memory);
        memory.set(before);
        runtime.stackPointer.value = stack;
        hook[306](count);
        assert.ok(Buffer.from(memory).equals(expected),
          `${beginOffset}/${endOffset}/${count}: memory`);
        assert.equal(runtime.stackPointer.value, stack, `${count}: stack`);
        comparisons++;
      }
    }
  }
});
