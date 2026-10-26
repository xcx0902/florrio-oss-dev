import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createMemcmpHook, functionIds} from '../source/game/server/memcmp.mjs';

let comparisons = 0;
after(() => console.log(
  `server memcmp 57 oracle comparisons: ${comparisons} total (0 trapping); `
  + 'equal prefixes, first-difference positions and unsigned byte ordering'));

test('memcmp 57 matches the original for non-empty prefixes', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createMemcmpHook(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const left = 0x100000, right = 0x101000;
  assert.equal(hook[57].length, runtime.exports.__fn57.length);
  for (let length = 1; length <= 16; length++) {
    for (const differing of [-1, 0, 1, length - 1]) {
      for (let index = 0; index < length; index++) {
        bytes[left + index] = (index * 37 + 11) & 0xff;
        bytes[right + index] = bytes[left + index];
      }
      if (differing >= 0) bytes[right + differing] = (bytes[left + differing] + 0x40) & 0xff;
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(57, left, right, length);
      assert.equal(hook[57](left, right, length), expected, `${length}/${differing}`);
      assert.equal(runtime.stackPointer.value, stack, 'stack');
      comparisons++;
    }
  }
  // The shipped loop compares the first byte even for length 0; a mismatch at
  // that byte is therefore observable without entering the non-terminating path.
  bytes[left] = 1; bytes[right] = 2;
  assert.equal(hook[57](left, right, 0), runtime.call(57, left, right, 0));
  comparisons++;
});
