import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import { createCallableCloneHooks, functionIds } from '../source/game/client/callable-clone-to-heap.mjs';

const SOURCE = 4096;
const INLINE_STORAGE = SOURCE + 8;
const MANAGER_TABLE = 8192;
const HEAP_STORAGE = 12288;
const ALLOCATE = 371;
const CLONE_STUB = 57;
const NOOP = 361;

function tableIndexFor(runtime, id) {
  const target = runtime.exports[`__fn${id}`];
  if (typeof target !== 'function') throw new Error(`function ${id} is not exported`);
  for (let index = 0; index < runtime.table.length; index++) if (runtime.table.get(index) === target) return index;
  throw new Error(`function ${id} is not in the table`);
}

function writeManager(runtime, address, { clone, copyInline }) {
  const view = new DataView(runtime.memory.buffer);
  view.setUint32(address + 8, tableIndexFor(runtime, clone), true);
  view.setUint32(address + 12, tableIndexFor(runtime, copyInline), true);
}

test('std::function clones reproduce empty, inline and heap storage', async () => {
  const cases = [];
  for (const id of functionIds) {
    cases.push({
      id, args: [SOURCE], label: `${id} empty`,
      prepare: runtime => { new DataView(runtime.memory.buffer).setUint32(SOURCE + 24, 0, true); },
    });
    cases.push({
      id, args: [SOURCE], label: `${id} inline`,
      prepare: runtime => {
        const view = new DataView(runtime.memory.buffer);
        view.setUint32(SOURCE + 24, INLINE_STORAGE, true);
        view.setUint32(INLINE_STORAGE, MANAGER_TABLE, true);
        writeManager(runtime, MANAGER_TABLE, { clone: CLONE_STUB, copyInline: NOOP });
      },
    });
    cases.push({
      id, args: [SOURCE], label: `${id} heap`,
      prepare: runtime => {
        const view = new DataView(runtime.memory.buffer);
        view.setUint32(SOURCE + 24, HEAP_STORAGE, true);
        view.setUint32(HEAP_STORAGE, MANAGER_TABLE, true);
        writeManager(runtime, MANAGER_TABLE, { clone: CLONE_STUB, copyInline: NOOP });
      },
    });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds: [...functionIds, ALLOCATE, CLONE_STUB, NOOP],
    factory: createCallableCloneHooks, cases,
  });
  assert.equal(comparisons, functionIds.length * 3);
  assert.deepEqual(failures, []);
});
