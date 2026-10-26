import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createVectorObjectDestructorHook, functionIds} from '../source/game/server/vector-object-destructor.mjs';

let comparisons = 0;
after(() => console.log(
  `server vector object destructor oracle comparisons: ${comparisons} total; payload states`));

test('vector object destructor matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 33, 355, 121], construct: false});
  const hook = createVectorObjectDestructorHook(runtime)[297];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const empty of [true, false]) {
    memory.set(clean);
    const base = runtime.call(121, 512);
    memory.fill(0, base, base + 512);
    const record = base + 256;
    if (empty) new DataView(runtime.memory.buffer).setUint32(record + 8, runtime.call(33), true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(297, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(record);
    assert.equal(actual, expected, `${empty}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${empty}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${empty}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
