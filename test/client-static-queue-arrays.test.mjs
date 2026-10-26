import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import { createStaticQueueArrayHooks, functionIds, queueArrays } from '../source/game/client/static-queue-arrays.mjs';

const RECORD_QUEUE_BYTES = 144;

test('static queue arrays walk every record and stop on a linked element', async () => {
  const cases = [];
  for (const id of functionIds) {
    const { start } = queueArrays[id];
    const first = start - RECORD_QUEUE_BYTES;
    cases.push({ id, args: [], label: `${id} idle records`, prepare: () => {} });
    cases.push({
      id, args: [], label: `${id} first record busy`,
      prepare: runtime => {
        const view = new DataView(runtime.memory.buffer);
        view.setInt8(first + 127, -1);
        view.setUint32(first + 116, 0, true);
        view.setInt32(first + 96, 5, true);
      },
    });
    cases.push({
      id, args: [], label: `${id} first record linked`,
      prepare: runtime => {
        const view = new DataView(runtime.memory.buffer);
        view.setInt32(first + 96, -1, true);
        view.setUint32(first + 76, 1234, true);
      },
    });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds: [...functionIds, 362], factory: createStaticQueueArrayHooks, cases,
  });
  assert.equal(comparisons, functionIds.length * 3);
  assert.deepEqual(failures, []);
});
