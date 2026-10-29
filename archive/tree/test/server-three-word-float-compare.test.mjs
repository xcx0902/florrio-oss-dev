import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createThreeWordFloatCompareHook, functionIds} from '../source/game/server/three-word-float-compare.mjs';

let comparisons = 0;
after(() => console.log(
  `server three-word float compare oracle comparisons: ${comparisons} total; special and random triples`));

test('three-word float comparison matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createThreeWordFloatCompareHook()[263];
  const infinity = 0x7fff800000000000n;
  const special = [0n, 1n, 2n, 0x8000000000000000n, 0x7fffffffffffffffn,
    infinity, infinity + 1n, 0xffffffffffffffffn];
  const triples = [];
  for (const p0 of [0n, 1n, 0x8000000000000000n]) {
    for (const p1 of special) {
      for (const p2 of special) triples.push([p0, p1, p2]);
    }
  }
  let state = 0x9e3779b97f4a7c15n;
  for (let trial = 0; trial < 120; trial++) {
    const values = [];
    for (let word = 0; word < 3; word++) {
      state = (state * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
      values.push(state);
    }
    triples.push(values);
  }

  for (const args of triples) {
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(263, ...args);
    assert.equal(runtime.stackPointer.value, stack, `${args}: stack`);
    const actual = hook(...args);
    assert.equal(actual, expected, `${args}: result`);
    comparisons++;
  }
  assert.ok(comparisons >= 300);
});
