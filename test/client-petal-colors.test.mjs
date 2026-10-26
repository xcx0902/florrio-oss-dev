import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import { colorVariants, createPetalColorHooks, functionIds } from '../source/game/client/petal-colors.mjs';

const ENTITY = 4096;
const SOURCE = 8192;
const HELPERS = [366, 373, 395];

function seed(runtime, { blend, red, green, blue, changed = 0, grayscale = 0 }) {
  const view = new DataView(runtime.memory.buffer);
  view.setUint32(ENTITY + 96, 42, true);
  view.setUint8(ENTITY + 48, changed);
  view.setUint8(ENTITY + 69, grayscale);
  for (let index = 0; index < 6; index++) view.setFloat32(ENTITY + index * 4, 0.25 * (index + 1), true);
  for (let index = 0; index < 24; index++) view.setUint8(ENTITY + 24 + index, index);
  view.setFloat32(SOURCE + 4, blend, true);
  view.setUint8(SOURCE + 8, red);
  view.setUint8(SOURCE + 9, green);
  view.setUint8(SOURCE + 10, blue);
}

test('petal colour updates blend, mirror and shade the entity colour', async () => {
  const cases = [];
  for (const id of functionIds) {
    const args = colorVariants[id].params === 3 ? [0, ENTITY, SOURCE] : [ENTITY, SOURCE];
    cases.push({ id, args, label: `${id} half blend`, prepare: runtime => seed(runtime, { blend: 0.5, red: 10, green: 20, blue: 30 }) });
    cases.push({ id, args, label: `${id} no blend`, prepare: runtime => seed(runtime, { blend: 0, red: 200, green: 100, blue: 50 }) });
    cases.push({ id, args, label: `${id} full blend grayscale`, prepare: runtime => seed(runtime, { blend: 1, red: 255, green: 128, blue: 0, grayscale: 1 }) });
    cases.push({ id, args, label: `${id} mirror`, prepare: runtime => seed(runtime, { blend: 0.25, red: 90, green: 180, blue: 240, changed: 1 }) });
    cases.push({ id, args, label: `${id} mirror grayscale`, prepare: runtime => seed(runtime, { blend: 0.75, red: 1, green: 2, blue: 3, changed: 1, grayscale: 1 }) });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds: [...functionIds, ...HELPERS], factory: createPetalColorHooks, cases, stackWindow: 0,
  });
  assert.equal(comparisons, functionIds.length * 5);
  assert.deepEqual(failures, []);
});
