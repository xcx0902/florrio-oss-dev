import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStateTrapHook, functionIds} from '../source/game/server/state-trap.mjs';

let comparisons = 0;
after(() => console.log(
  `server state trap oracle comparisons: ${comparisons} total; latched masks`));

test('state trap latch matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 42], construct: false});
  const hook = createStateTrapHook(runtime)[386];
  const memory = new Uint8Array(runtime.memory.buffer);
  const state = 0xaf0000;

  for (const [empty, flag, fatal] of [[1, 0, 0], [0, 1, 0], [1, 0, 1], [0, 0, 0]]) {
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(state + 24, empty, true);
    view.setUint32(state + 20, fatal, true);
    const setup = Buffer.from(memory);
    let expectedError = null;
    try {
      runtime.call(386, state, flag);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    let actualError = null;
    try {
      hook(state, flag);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${empty}/${flag}/${fatal}: trap`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${empty}/${flag}/${fatal}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
