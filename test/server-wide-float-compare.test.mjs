import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createWideFloatCompareHook, functionIds} from '../source/game/server/wide-float-compare.mjs';

let comparisons = 0;
after(() => console.log(
  `server wide float compare oracle comparisons: ${comparisons} total; ordering and unordered patterns`));

test('wide float comparison matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createWideFloatCompareHook()[129];
  const infinity = 0x7fff800000000000n;
  const special = [0n, 1n, 2n, 0x8000000000000000n, 0x7fffffffffffffffn,
    infinity, infinity + 1n, 0xffffffffffffffffn, 0x0001000000000000n];
  const pairs = [];
  for (const a of special) {
    for (const b of special) pairs.push([a, b]);
  }
  let state = 0x12345678n;
  for (let trial = 0; trial < 120; trial++) {
    const values = [];
    for (let word = 0; word < 4; word++) {
      state = (state * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
      values.push(state);
    }
    pairs.push(values);
  }

  for (const [a, b] of pairs) {
    const args = [a, b, a, b];
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(129, ...args);
    assert.equal(runtime.stackPointer.value, stack, `${a}/${b}: stack`);
    const actual = hook(...args);
    assert.equal(actual, expected, `${a}/${b}: result`);
    comparisons++;
  }
  assert.ok(comparisons >= 200);
});
