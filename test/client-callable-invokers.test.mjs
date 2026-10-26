import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import { createCallableInvokerHooks, functionIds } from '../source/game/client/callable-invokers.mjs';

/** Fill a closure fixture: [0] output buffer, [4] generator state. */
function seedClosure(runtime, address) {
  const view = new DataView(runtime.memory.buffer);
  view.setUint32(address, 2048, true);
  view.setUint32(address + 4, 2064, true);
  view.setUint32(address + 8, 0, true);
  view.setUint32(2064, 12345, true);
  view.setUint32(2068, 0x5bd1e995, true);
}

test('callable invokers forward the closure and argument exactly', async () => {
  const cases = [];
  for (const id of functionIds) {
    cases.push({ id, args: [0, 3072], prepare: runtime => seedClosure(runtime, 3072), label: `${id} closure` });
    cases.push({ id, args: [0, 0], label: `${id} null closure` });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client',
    functionIds,
    factory: createCallableInvokerHooks,
    cases,
  });
  assert.equal(comparisons, functionIds.length * 2);
  assert.deepEqual(failures, []);
});
