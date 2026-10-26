import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import {
  componentLayouts,
  createCellAttachmentHooks,
  functionIds,
} from '../source/game/server/cell-attachment.mjs';

const ENTITY = 4096;
const OWNER = 8192;
const CELL_INDEX = 5;
const CURRENT_ID = 77;
const MALLOC = 16;

function seed(runtime, layout, { size = 0, capacity = 0, data = 0, occupants = false } = {}) {
  const view = new DataView(runtime.memory.buffer);
  view.setUint32(ENTITY, OWNER, true);
  view.setUint32(ENTITY + 16, CELL_INDEX, true);
  view.setUint32(OWNER + 2140, CURRENT_ID, true);
  view.setUint32(OWNER + layout.size, size, true);
  view.setUint32(OWNER + layout.capacity, capacity, true);
  view.setUint32(OWNER + layout.data, data, true);
  if (occupants) {
    const base = OWNER + CELL_INDEX * 8;
    for (const offset of [264876, 264880]) {
      const occupant = runtime.call(MALLOC, 16);
      view.setUint32(occupant + 12, 0, true);
      view.setUint32(base + offset, occupant, true);
    }
  }
}

test('server cell attachment clears, publishes and appends entity ids', async () => {
  const cases = [];
  for (const id of functionIds) {
    const layout = componentLayouts[id];
    cases.push({
      id, args: [ENTITY, 9001], label: `${id} first entity`,
      prepare: runtime => seed(runtime, layout),
    });
    cases.push({
      id, args: [ENTITY, 9002], label: `${id} existing vector`,
      prepare: runtime => {
        const storage = runtime.call(MALLOC, 32);
        seed(runtime, layout, { size: 2, capacity: 8, data: storage });
      },
    });
    cases.push({
      id, args: [ENTITY, 9004], label: `${id} full vector`,
      prepare: runtime => {
        const storage = runtime.call(MALLOC, 32);
        seed(runtime, layout, { size: 8, capacity: 8, data: storage });
      },
    });
    cases.push({
      id, args: [ENTITY, 9005], label: `${id} overfull vector`,
      prepare: runtime => {
        const storage = runtime.call(MALLOC, 80);
        seed(runtime, layout, { size: 20, capacity: 8, data: storage });
      },
    });
    cases.push({
      id, args: [ENTITY, 9003], label: `${id} occupied cell`,
      prepare: runtime => seed(runtime, layout, { size: 1, capacity: 4, data: runtime.call(MALLOC, 16), occupants: true }),
    });
  }
  const { comparisons, failures } = await compareCases({
    module: 'sp_server', functionIds: [...functionIds, 14, 15, 16],
    factory: createCellAttachmentHooks, cases,
  });
  assert.equal(comparisons, functionIds.length * 5);
  assert.deepEqual(failures, []);
});
