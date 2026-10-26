import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createVectorAtHook, functionIds} from '../source/game/server/vector-at.mjs';

let comparisons = 0;
after(() => console.log(
  `server vector at oracle comparisons: ${comparisons} total; element states`));

test('vector element access matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 38, 42], construct: false});
  const hook = createVectorAtHook(runtime)[92];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const holder = 0xc20000;
  const vector = 0xc21000;
  const start = 0xc22000;

  for (const [index, entries, nullEntry] of [[0, 2, false], [0, 0, false], [0, 1, true], [7, 1, false]]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(holder, vector, true);
    view.setUint32(vector + 16, start, true);
    view.setUint32(vector + 20, start + entries * 4, true);
    for (let slot = 0; slot < entries; slot++) view.setUint32(start + slot * 4, nullEntry && slot === 0 ? 0 : 0xc23000 + slot * 16, true);
    const setup = Buffer.from(memory);
    let expected;
    let expectedError = null;
    try {
      expected = runtime.call(92, holder, index);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    let actual;
    let actualError = null;
    try {
      actual = hook(holder, index);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${index}/${entries}/${nullEntry}: trap`);
    if (actualError === null) assert.equal(actual, expected, `${index}/${entries}/${nullEntry}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${index}/${entries}/${nullEntry}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
