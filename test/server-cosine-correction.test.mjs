import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createTrigCorrectionHook, functionIds} from '../source/game/server/cosine-correction.mjs';

let comparisons = 0;
after(() => console.log(
  `server cosine-correction oracle comparisons: ${comparisons} total; `
  + 'cosine polynomial with linear product correction'));

test('cosine correction 153 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createTrigCorrectionHook(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const before = Buffer.from(bytes);
  const values = [-3.141592653589793, -1.5, -1, -0.5, -1e-9, 0, 1e-9, 0.5, 1, 1.5, 3.141592653589793];
  assert.equal(hooks[153].length, runtime.exports.__fn153.length);
  for (const x of values) {
    for (const y of [-1, -0.25, 0, 0.25, 1]) {
      let stack = runtime.stackPointer.value;
      let expected = runtime.call(153, x, y);
      let actual = hooks[153](x, y);
      assert.ok(Object.is(actual, expected), `153/${x}/${y}: ${actual} !== ${expected}`);
      assert.equal(runtime.stackPointer.value, stack, '153 stack');
      comparisons++;
    }
  }
  assert.ok(Buffer.from(bytes).equals(before), 'kernels are read-only');
});
