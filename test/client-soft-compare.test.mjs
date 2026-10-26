import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSoftCompareHooks, functionIds} from '../source/game/client/soft-compare.mjs';

let comparisons = 0;
after(() => console.log(
  `client soft-compare oracle comparisons: ${comparisons} total (0 trapping); exact 128-bit word semantics`));

test('soft-compare exposes the original arities and replaces ids 563/811', async () => {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createSoftCompareHooks(runtime);
  assert.deepEqual([...functionIds], [563, 811]);
  for (const id of functionIds) {
    assert.equal(typeof hooks[id], 'function');
    assert.equal(hooks[id].length, runtime.exports[`__fn${id}`].length);
  }
});

test('soft-compare matches the original on structured and random words', async () => {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createSoftCompareHooks(runtime);
  const words = [
    0n, 1n, 2n, 0x7fffffffffffffffn, 0x8000000000000000n,
    0xffffffffffffffffn, 0x3fff000000000000n, 0xbfff000000000000n,
    0x4000000000000000n, 0xc000000000000000n,
    0x7fff000000000000n, 0x7fff800000000000n,
    0xfff0000000000000n, 0x7ff0000000000000n,
  ];
  let state = 0xdeadbeef;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    const high = BigInt(state >>> 0) << 32n;
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return high | BigInt(state >>> 0);
  };
  for (let index = 0; index < 120; index++) words.push(next());

  for (const lowA of words.slice(0, 40)) {
    for (const lowB of words.slice(0, 40)) {
      const highA = words[(Number(lowA & 31n) + 7) % words.length];
      const highB = words[(Number(lowB & 31n) + 11) % words.length];
      const expected = runtime.call(563, lowA, highA, lowB, highB);
      assert.equal(hooks[563](lowA, highA, lowB, highB), expected,
        `563 ${lowA} ${highA} ${lowB} ${highB}`);
      comparisons++;
    }
  }
  for (const low of words) {
    for (const high of words.slice(0, 24)) {
      const other = words[(Number(low & 15n) + Number(high & 7n)) % words.length];
      const expected = runtime.call(811, low, high, other);
      assert.equal(hooks[811](low, high, other), expected,
        `811 ${low} ${high} ${other}`);
      comparisons++;
    }
  }
});
