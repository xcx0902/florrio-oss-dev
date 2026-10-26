import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import { createClosurePairInvokerHooks, functionIds } from '../source/game/client/closure-invoker-pairs.mjs';

/** A callable object with an output buffer and a generator state. */
function seedCallable(runtime) {
  const view = new DataView(runtime.memory.buffer);
  view.setUint32(3072, 2048, true);
  view.setUint32(3076, 2064, true);
  view.setUint32(2064, 12345, true);
  view.setUint32(2068, 0x5bd1e995, true);
}

test('two-stage closure invokers forward the argument and match memory', async () => {
  const cases = [];
  for (const id of functionIds) {
    cases.push({ id, args: [0, 3072], prepare: seedCallable, label: `${id} callable` });
    cases.push({ id, args: [0, 0], label: `${id} null` });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds, factory: createClosurePairInvokerHooks, cases,
  });
  assert.equal(comparisons, functionIds.length * 2);
  assert.deepEqual(failures, []);
});
