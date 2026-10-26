import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import { createClosureTwoArgumentInvokerHooks, functionIds } from '../source/game/client/closure-invoker-two-arguments.mjs';

const FREE = 362;

function tableIndexFor(runtime, id) {
  const target = runtime.exports[`__fn${id}`];
  if (typeof target !== 'function') throw new Error(`function ${id} is not exported`);
  for (let index = 0; index < runtime.table.length; index++) if (runtime.table.get(index) === target) return index;
  throw new Error(`function ${id} is not in the table`);
}

test('two-argument closure invokers forward the callback index and its argument', async () => {
  const ids = [...functionIds, FREE];
  const cases = [];
  for (const id of functionIds) {
    for (const second of [0, 4096]) {
      cases.push({
        id,
        args: [],
        argsOf: runtime => [0, tableIndexFor(runtime, FREE), second],
        label: `${id} free(${second})`,
      });
    }
    cases.push({ id, args: [0, 0, 0], label: `${id} null callback` });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds: ids, factory: createClosureTwoArgumentInvokerHooks, cases,
  });
  assert.equal(comparisons, functionIds.length * 3);
  assert.deepEqual(failures, []);
});
