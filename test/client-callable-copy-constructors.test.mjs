import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import { createCallableCopyConstructorHooks, functionIds } from '../source/game/client/callable-copy-constructors.mjs';

const NOOP_TWO_ARGUMENTS = 361;
const SOURCE = 4096;
const DESTINATION = 8192;
const INLINE_VTABLE = 12288;
const HEAP_OBJECT = 16384;

function tableIndexFor(runtime, id) {
  const target = runtime.exports[`__fn${id}`];
  if (typeof target !== 'function') throw new Error(`function ${id} is not exported by the oracle`);
  for (let index = 0; index < runtime.table.length; index++) if (runtime.table.get(index) === target) return index;
  throw new Error(`function ${id} is not in the indirect table`);
}

/** Source with an empty small-buffer callable (storage == 0). */
function seedEmpty(runtime) {
  const view = new DataView(runtime.memory.buffer);
  view.setUint32(SOURCE, 0xdeadbeef, true);
  view.setUint32(SOURCE + 24, 0, true);
}

/** Source whose storage is its own small buffer; the callable's manager table
 *  copies in place through slot 3.  A two-argument no-op stands in for the
 *  callable's copy hook so the fixture exercises only the wrapper's control flow. */
function seedInline(runtime) {
  const view = new DataView(runtime.memory.buffer);
  view.setUint32(SOURCE, 0, true);
  view.setUint32(SOURCE + 8, INLINE_VTABLE, true);
  view.setUint32(SOURCE + 12, 0x1234, true);
  view.setUint32(SOURCE + 24, SOURCE + 8, true);
  view.setUint32(INLINE_VTABLE + 8, 0, true);
  view.setUint32(INLINE_VTABLE + 12, tableIndexFor(runtime, NOOP_TWO_ARGUMENTS), true);
}

/** Source storing the callable on the heap; the manager table's clone slot
 *  (the real per-signature clone of this family) produces the new pointer. */
function seedHeap(runtime) {
  const view = new DataView(runtime.memory.buffer);
  view.setUint32(SOURCE, 0, true);
  view.setUint32(SOURCE + 24, HEAP_OBJECT, true);
  view.setUint32(HEAP_OBJECT, 90756, true);
  view.setUint32(HEAP_OBJECT + 24, 0, true);
}

test('std::function copy constructors match the original for empty, inline and heap sources', async () => {
  const ids = [...functionIds, NOOP_TWO_ARGUMENTS];
  const cases = [];
  for (const id of functionIds) {
    cases.push({ id, args: [SOURCE, DESTINATION], prepare: seedEmpty, label: `${id} empty` });
    cases.push({ id, args: [SOURCE, DESTINATION], prepare: seedInline, label: `${id} inline` });
    cases.push({ id, args: [SOURCE, DESTINATION], prepare: seedHeap, label: `${id} heap` });
    cases.push({ id, args: [SOURCE, SOURCE], prepare: seedEmpty, label: `${id} self` });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client',
    functionIds: ids,
    factory: createCallableCopyConstructorHooks,
    cases,
  });
  assert.equal(comparisons, functionIds.length * 4);
  assert.deepEqual(failures, []);
});
