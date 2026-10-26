import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringUtilityHooks, functionIds} from '../source/game/server/string-utilities.mjs';

let comparisons = 0;
after(() => console.log(
  `server string-utility oracle comparisons: ${comparisons} total (0 trapping); `
  + 'unaligned strlen and in-place byte reversals'));

test('strlen 104 and reverseByteRange 120 match the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createStringUtilityHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const base = 0x100000;
  assert.equal(hooks[104].length, runtime.exports.__fn104.length);
  assert.equal(hooks[120].length, runtime.exports.__fn120.length);

  for (let offset = 0; offset < 6; offset++) {
    for (let length = 0; length <= 12; length++) {
      bytes.fill(0x41, base, base + 64);
      bytes.fill(0, base + offset + length, base + 64);
      const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
      const expected = runtime.call(104, base + offset);
      assert.equal(hooks[104](base + offset), expected, `strlen ${offset}/${length}`);
      assert.equal(runtime.stackPointer.value, stack, 'strlen stack');
      assert.ok(Buffer.from(bytes).equals(before), 'strlen write-free');
      comparisons++;

      for (const range of [0, 1, 2, 5, 8, 11]) {
        if (range > length) continue;
        bytes.fill(0x41, base, base + 64);
        const snapshot = Buffer.from(bytes);
        const expectedMemory = (() => {
          runtime.call(120, base + offset, base + offset + range);
          return Buffer.from(bytes);
        })();
        bytes.set(snapshot);
        hooks[120](base + offset, base + offset + range);
        assert.ok(Buffer.from(bytes).equals(expectedMemory),
          `reverse ${offset}/${length}/${range}`);
        comparisons++;
      }
    }
  }
  const same = Buffer.from(bytes);
  runtime.call(120, base, base);
  assert.ok(Buffer.from(bytes).equals(same), 'empty range');
});
