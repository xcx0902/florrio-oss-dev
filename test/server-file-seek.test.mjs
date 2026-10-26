import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFileSeekHook, functionIds} from '../source/game/server/file-seek.mjs';

let comparisons = 0;
after(() => console.log(
  `server file seek oracle comparisons: ${comparisons} total; offsets`));

test('file seek wrapper matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 11], construct: false});
  const hook = createFileSeekHook(runtime)[645];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const state = 0xa00000;

  for (const [offset, origin] of [[0n, 0], [5n, 1], [123n, 2]]) {
    memory.set(clean);
    new DataView(runtime.memory.buffer).setUint32(state + 60, 0, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(645, state, offset, origin);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(state, offset, origin);
    assert.equal(actual, expected, `${offset}/${origin}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${offset}/${origin}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${offset}/${origin}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 3);
});
