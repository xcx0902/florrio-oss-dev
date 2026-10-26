import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import { createSpanBlendHooks, functionIds } from '../source/game/client/span-blend-additive.mjs';

const STATE = 4096;
const SOURCE = 8192;
const DESTINATION = 16384;

function seed(runtime, { mode, rows = 2, pixels = 3, sourceStride = 16, destinationStride = 16 }) {
  const view = new DataView(runtime.memory.buffer);
  view.setUint32(STATE + 0, SOURCE, true);
  view.setUint32(STATE + 12, sourceStride, true);
  view.setUint32(STATE + 20, DESTINATION, true);
  view.setUint32(STATE + 24, pixels, true);
  view.setUint32(STATE + 28, rows, true);
  view.setUint32(STATE + 32, destinationStride, true);
  view.setUint32(STATE + 52, mode, true);
  for (let index = 0; index < rows * pixels; index++) {
    view.setUint32(SOURCE + index * 4, (0x40 + index * 17) | ((0x80 + index * 5) << 8) | ((0x30 + index * 9) << 16) | ((0xc0 - index * 7) << 24), true);
    view.setUint32(DESTINATION + index * 4, (0x11 + index * 3) | ((0x22 + index * 4) << 8) | ((0x33 + index * 5) << 16) | 0xff000000, true);
  }
}

test('span blend applies screen, additive, multiply and modulated modes', async () => {
  const cases = [];
  for (const id of functionIds) {
    for (const mode of [16, 32, 64, 0, 48, 80]) {
      cases.push({ id, args: [STATE], label: `${id} mode ${mode}`, prepare: runtime => seed(runtime, { mode }) });
    }
    cases.push({ id, args: [STATE], label: `${id} empty`, prepare: runtime => seed(runtime, { mode: 16, rows: 0 }) });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds, factory: createSpanBlendHooks, cases,
  });
  assert.equal(comparisons, functionIds.length * 7);
  assert.deepEqual(failures, []);
});
