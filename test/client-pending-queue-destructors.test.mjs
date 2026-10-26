import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import {
  createPendingQueueDestructorHooks,
  functionIds,
  messageLessQueueAddresses,
  queueAddresses,
} from '../source/game/client/pending-queue-destructors.mjs';

const PREVIOUS = 72;
const NEXT = 76;
const COUNT = 96;
const MESSAGE = 116;
const ACTIVE_HEAD = 441324;
const ACTIVE_COUNT = 441320;
const NODE_A = 5000;
const NODE_B = 6000;

function writeState(runtime, base, { pending, next, previous, activeHead, messageFlag = 0, messagePointer = 0, liveQueues = 3 }) {
  const view = new DataView(runtime.memory.buffer);
  view.setInt32(base + COUNT, pending, true);
  view.setInt32(base + NEXT, next, true);
  view.setUint32(base + PREVIOUS, previous, true);
  view.setUint32(ACTIVE_HEAD, activeHead, true);
  view.setUint32(ACTIVE_COUNT, liveQueues, true);
  view.setInt8(base + MESSAGE + 11, messageFlag);
  view.setUint32(base + MESSAGE, messagePointer, true);
}

test('pending queue destructors unlink, notify, reset and keep the abort invariant', async () => {
  const cases = [];
  for (const id of functionIds) {
    const base = queueAddresses[id] ?? messageLessQueueAddresses[id];
    const hasMessage = queueAddresses[id] !== undefined;
    cases.push({ id, args: [0], label: `${id} idle`, prepare: runtime => writeState(runtime, base, { pending: -1, next: 1, previous: 0, activeHead: 0 }) });
    cases.push({ id, args: [0], label: `${id} started`, prepare: runtime => writeState(runtime, base, { pending: 5, next: 0, previous: 0, activeHead: 0 }) });
    cases.push({ id, args: [0], label: `${id} unlink`, prepare: runtime => {
      writeState(runtime, base, { pending: 3, next: NODE_A, previous: NODE_B, activeHead: 0 });
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(NODE_A + PREVIOUS, 0, true);
      view.setUint32(NODE_B + NEXT, 0, true);
    } });
    cases.push({ id, args: [0], label: `${id} invariant`, prepare: runtime => writeState(runtime, base, { pending: -1, next: 0, previous: 0, activeHead: base }) });
    if (hasMessage) {
      cases.push({ id, args: [0], label: `${id} empty message`, prepare: runtime => writeState(runtime, base, { pending: -1, next: 1, previous: 0, activeHead: 0, messageFlag: -1, messagePointer: 0 }) });
    }
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds: [...functionIds, 362], factory: createPendingQueueDestructorHooks, cases,
  });
  const expected = functionIds.length * 4 + Object.keys(queueAddresses).length;
  assert.equal(comparisons, expected);
  assert.deepEqual(failures.slice(0, 10), []);
});
