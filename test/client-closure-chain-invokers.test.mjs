import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import {
  createClosureChainInvokerHooks,
  functionIds,
  stagePlans,
} from '../source/game/client/closure-chain-invokers.mjs';

const ALLOCATE = 371;
const NOOP = 361;
const FREE = 362;

function tableIndexFor(runtime, id) {
  const target = runtime.exports[`__fn${id}`];
  if (typeof target !== 'function') throw new Error(`function ${id} is not exported`);
  for (let index = 0; index < runtime.table.length; index++) if (runtime.table.get(index) === target) return index;
  throw new Error(`function ${id} is not in the table`);
}

test('three-stage closure chains install every stage and forward the argument once', async () => {
  const cases = [];
  for (const id of functionIds) {
    const stages = stagePlans[id].stages;
    cases.push({
      id,
      args: [],
      argsOf: runtime => [0, runtime.argumentBlock],
      label: `${id} chain`,
      prepare: runtime => {
        const block = runtime.call(ALLOCATE, 64);
        runtime.argumentBlock = block;
        const view = new DataView(runtime.memory.buffer);
        for (const [, descriptor, argumentOffset] of stages) {
          view.setUint32(descriptor, tableIndexFor(runtime, argumentOffset === null ? FREE : NOOP), true);
        }
      },
    });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds: [...functionIds, ALLOCATE, NOOP, FREE],
    factory: createClosureChainInvokerHooks, cases, stackWindow: 0,
  });
  assert.equal(comparisons, functionIds.length);
  assert.deepEqual(failures, []);
});
