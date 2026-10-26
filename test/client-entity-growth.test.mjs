import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import { createEntityGrowthHooks, functionIds, growthParameters } from '../source/game/client/entity-growth.mjs';

const ENTITY = 4096;
const RENDER = 8192;
const GROWTH = 12288;
const SETTERS = [404, 380, 399];

function seed(runtime, { duration, size, bounds, scale = 2.25 }) {
  const view = new DataView(runtime.memory.buffer);
  view.setUint32(ENTITY + 140, RENDER, true);
  view.setUint32(ENTITY + 116, GROWTH, true);
  view.setFloat32(RENDER + 8, bounds, true);
  view.setFloat32(RENDER + 64, scale, true);
  view.setFloat32(GROWTH + 8, size, true);
  view.setFloat32(GROWTH + 12, duration, true);
}

test('entity growth updates rescale size from the remaining duration', async () => {
  const cases = [];
  for (const id of functionIds) {
    const [bounds, , duration] = growthParameters[id];
    cases.push({
      id, args: [0, ENTITY], label: `${id} unchanged`,
      prepare: runtime => seed(runtime, { duration, size: duration, bounds }),
    });
    cases.push({
      id, args: [0, ENTITY], label: `${id} expired`,
      prepare: runtime => seed(runtime, { duration: 0, size: duration, bounds }),
    });
    cases.push({
      id, args: [0, ENTITY], label: `${id} running`,
      prepare: runtime => seed(runtime, { duration: 2, size: 10, bounds }),
    });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds: [...functionIds, ...SETTERS], factory: createEntityGrowthHooks, cases, stackWindow: 0,
  });
  assert.equal(comparisons, functionIds.length * 3);
  assert.deepEqual(failures, []);
});
