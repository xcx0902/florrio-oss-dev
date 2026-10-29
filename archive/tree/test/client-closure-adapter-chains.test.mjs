import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import {
  adapterPlans,
  createClosureAdapterChainHooks,
  functionIds,
} from '../source/game/client/closure-adapter-chains.mjs';

/** Table-resident stubs, one per signature used by the adapters. */
const STUBS = { $t0: 361, $t1: 49, $t4: 93 };

function tableIndexFor(runtime, id) {
  const target = runtime.exports[`__fn${id}`];
  if (typeof target !== 'function') throw new Error(`function ${id} is not exported`);
  for (let index = 0; index < runtime.table.length; index++) if (runtime.table.get(index) === target) return index;
  throw new Error(`function ${id} is not in the table`);
}

test('closure adapter chains run every stage with the right signature', async () => {
  const cases = [];
  for (const id of functionIds) {
    const plan = adapterPlans[id];
    const bindStubs = runtime => {
      const view = new DataView(runtime.memory.buffer);
      for (const [, descriptor, signature] of plan.stages) {
        view.setUint32(descriptor, tableIndexFor(runtime, STUBS[signature]), true);
      }
    };
    const args = plan.params === 3 ? [0, 1234, 5678] : [0, 1234];
    cases.push({ id, args, label: `${id} chain`, prepare: bindStubs });
    cases.push({
      id, args, label: `${id} missing callable`,
      prepare: runtime => {
        bindStubs(runtime);
        const view = new DataView(runtime.memory.buffer);
        view.setUint32(plan.stages[0][1], 0, true);
      },
    });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds: [...functionIds, ...Object.values(STUBS)],
    factory: createClosureAdapterChainHooks, cases,
  });
  assert.equal(comparisons, functionIds.length * 2);
  assert.deepEqual(failures, []);
});
