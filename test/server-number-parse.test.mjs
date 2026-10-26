import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createNumberParseHook, functionIds} from '../source/game/server/number-parse.mjs';

let comparisons = 0;
after(() => console.log(
  `server numeric base-selection oracle comparisons: ${comparisons} total; `
  + 'exhaustive 8-bit flag mask'));

test('numeric base selection 90 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createNumberParseHook(runtime);
  const view = new DataView(runtime.memory.buffer);
  const stream = 0x360000;
  assert.equal(hook[90].length, runtime.exports.__fn90.length);
  for (let flags = 0; flags < 256; flags++) {
    for (const extra of [0, 0x100, 0x80000000]) {
      view.setUint32(stream + 4, (flags | extra) >>> 0, true);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(90, stream);
      const actual = hook[90](stream);
      assert.equal(actual, expected, `flags ${flags}/${extra}`);
      assert.equal(runtime.stackPointer.value, stack, `flags ${flags}/${extra}: stack`);
      comparisons++;
    }
  }
});
