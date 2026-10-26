import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createVtableChainHooks, functionIds} from '../source/game/client/vtable-chain-thunks.mjs';

let comparisons = 0;
after(() => console.log(`client vtable thunk oracle comparisons: ${comparisons} total; full sparse memory`));

function diff(memory, baseline) {
  const changes = new Map();
  for (let index = 0; index < memory.length; index++) {
    if (memory[index] !== baseline[index]) changes.set(index, memory[index]);
  }
  return changes;
}

function restore(memory, baseline, changes) {
  for (const index of changes.keys()) memory[index] = baseline[index];
}

function sameChanges(left, right) {
  if (left.size !== right.size) return false;
  for (const [index, value] of left) if (right.get(index) !== value) return false;
  return true;
}

test('three-stage forward thunks match original result, trap and complete memory', async () => {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createVtableChainHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const baseline = Buffer.from(memory);

  const failures = [];
  for (const id of functionIds) {
    memory.set(baseline);
    let expected;
    let expectedError = null;
    try {
      expected = runtime.call(id, 0, 0);
    } catch (error) {
      expectedError = error;
    }
    const expectedChanges = diff(memory, baseline);
    restore(memory, baseline, expectedChanges);

    let actual;
    let actualError = null;
    try {
      actual = hooks[id](0, 0);
    } catch (error) {
      actualError = error;
    }
    const actualChanges = diff(memory, baseline);
    restore(memory, baseline, actualChanges);

    if ((actualError !== null) !== (expectedError !== null)) failures.push(`${id}: trap ${actualError?.message} != ${expectedError?.message}`);
    else if (actualError === null && actual !== expected) failures.push(`${id}: result ${actual} != ${expected}`);
    else if (!sameChanges(actualChanges, expectedChanges)) failures.push(`${id}: memory ${actualChanges.size} != ${expectedChanges.size}`);
    comparisons++;
  }
  assert.equal(comparisons, 289);
  assert.deepEqual(failures, []);
});
