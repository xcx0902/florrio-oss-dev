import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createTrigKernelHooks, functionIds} from '../source/game/server/trig-kernels.mjs';

let comparisons = 0;
after(() => console.log(
  `server trig-kernel oracle comparisons: ${comparisons} total (0 trapping); `
  + 'cosine/sine f64 polynomials demoted to f32'));

const VALUES = [
  -6.283185307179586, -3.141592653589793, -1.5707963267948966, -1, -0.5,
  -1e-8, 0, 1e-8, 0.5, 1, 1.5707963267948966, 3.141592653589793,
  6.283185307179586, 12.5, -12.5, 100, -100,
];

test('server trig kernels 80/81 match the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createTrigKernelHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const before = Buffer.from(bytes);
  for (const id of functionIds) {
    assert.equal(hooks[id].length, runtime.exports[`__fn${id}`].length);
    for (const value of VALUES) {
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(id, value);
      const actual = hooks[id](value);
      assert.ok(Object.is(actual, expected), `${id}/${value}: ${actual} !== ${expected}`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${value}: stack`);
      comparisons++;
    }
  }
  assert.ok(Buffer.from(bytes).equals(before), 'kernels are read-only');
});
