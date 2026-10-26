import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import { createClosureSingleResultInvokerHooks, functionIds } from '../source/game/client/closure-invoker-single-result.mjs';

test('single-stage closure invokers return the closure result', async () => {
  const cases = [];
  for (const id of functionIds) {
    cases.push({ id, args: [0, 0], label: `${id} null` });
    cases.push({ id, args: [0, 4096], label: `${id} zeroed` });
    cases.push({ id, args: [0, 3072], prepare: runtime => {
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(3072, 2048, true);
      view.setUint32(3076, 2064, true);
      view.setUint32(2064, 7, true);
    }, label: `${id} object` });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds, factory: createClosureSingleResultInvokerHooks, cases,
  });
  assert.equal(comparisons, functionIds.length * 3);
  assert.deepEqual(failures, []);
});
