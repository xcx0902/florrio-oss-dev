import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSmallMemoryHooks, functionIds} from '../source/game/server/small-memory.mjs';

let comparisons = 0;
after(() => console.log(
  `server small memory oracle comparisons: ${comparisons} total; strings, allocation and clears`));

test('small memory helpers match original result and memory', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 14, 16], construct: false});
  const hooks = createSmallMemoryHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0xd00000;

  for (const short of [false, true]) {
    memory.set(clean);
    memory[record + 11] = short ? 0x80 : 0;
    const expected = runtime.call(19, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    memory[record + 11] = short ? 0x80 : 0;
    const actual = hooks[19](record);
    assert.equal(actual, expected, `${short}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${short}: memory`);
    comparisons++;
  }

  memory.set(clean);
  let expectedError = null;
  try {
    runtime.call(24, record);
  } catch (error) {
    expectedError = error;
  }
  const expectedMemory = Buffer.from(memory);
  memory.set(clean);
  let actualError = null;
  try {
    hooks[24](record);
  } catch (error) {
    actualError = error;
  }
  assert.equal(actualError !== null, expectedError !== null, '24: trap');
  assert.ok(Buffer.from(memory).equals(expectedMemory), '24: memory');
  comparisons++;

  const native = await loadOriginal('sp_server', {functionIds: [20, 16], construct: false});
  const recovered = await loadOriginal('sp_server', {functionIds: [20, 16], construct: false});
  const recoveredHooks = createSmallMemoryHooks(recovered);
  const cleanNative = Buffer.from(new Uint8Array(native.memory.buffer));
  const cleanRecovered = Buffer.from(new Uint8Array(recovered.memory.buffer));
  for (const size of [0, 1, 16]) {
    new Uint8Array(native.memory.buffer).set(cleanNative);
    new Uint8Array(recovered.memory.buffer).set(cleanRecovered);
    assert.equal(recoveredHooks[20](size), native.call(20, size), `${size}: pointer`);
    assert.ok(Buffer.from(new Uint8Array(recovered.memory.buffer))
      .equals(Buffer.from(new Uint8Array(native.memory.buffer))), `${size}: memory`);
    comparisons++;
  }
  assert.equal(comparisons, 6);
});
