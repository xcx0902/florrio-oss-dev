import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import { createCallableDestructorHooks, functionIds } from '../source/game/client/callable-destructors.mjs';

const OBJECT = 4096;
const INLINE_STORAGE = OBJECT + 8;
const INLINE_TABLE = 8192;
const HEAP_TABLE = 12288;
const ALLOCATE = 371;
const NOOP = 361;
const FREE = 362;

function tableIndexFor(runtime, id) {
  const target = runtime.exports[`__fn${id}`];
  if (typeof target !== 'function') throw new Error(`function ${id} is not exported`);
  for (let index = 0; index < runtime.table.length; index++) if (runtime.table.get(index) === target) return index;
  throw new Error(`function ${id} is not in the table`);
}

test('std::function destructors dispatch on the storage kind', async () => {
  const cases = [];
  for (const id of functionIds) {
    cases.push({
      id, args: [OBJECT], label: `${id} empty`,
      prepare: runtime => { new DataView(runtime.memory.buffer).setUint32(OBJECT + 24, 0, true); },
    });
    cases.push({
      id, args: [OBJECT], label: `${id} inline`,
      prepare: runtime => {
        const view = new DataView(runtime.memory.buffer);
        view.setUint32(OBJECT + 24, INLINE_STORAGE, true);
        view.setUint32(INLINE_STORAGE, INLINE_TABLE, true);
        view.setUint32(INLINE_TABLE + 16, tableIndexFor(runtime, NOOP), true);
        view.setUint32(INLINE_TABLE + 20, tableIndexFor(runtime, FREE), true);
      },
    });
    cases.push({
      id, args: [OBJECT], label: `${id} heap`,
      prepare: runtime => {
        const block = runtime.call(ALLOCATE, 64);
        const view = new DataView(runtime.memory.buffer);
        view.setUint32(OBJECT + 24, block, true);
        view.setUint32(block, HEAP_TABLE, true);
        view.setUint32(HEAP_TABLE + 16, tableIndexFor(runtime, NOOP), true);
        view.setUint32(HEAP_TABLE + 20, tableIndexFor(runtime, FREE), true);
      },
    });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds: [...functionIds, ALLOCATE, NOOP, FREE],
    factory: createCallableDestructorHooks, cases,
  });
  assert.equal(comparisons, functionIds.length * 3);
  assert.deepEqual(failures, []);
});
