import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createMemoryCopyHooks, functionIds} from '../source/game/server/memory-copy.mjs';

let comparisons = 0;
after(() => console.log(
  `server memory copy oracle comparisons: ${comparisons} total; copy and clear`));

test('memory copy and clear match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createMemoryCopyHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0x990000;
  const source = 0x991000;

  for (const count of [0, 1, 5]) {
    memory.set(clean);
    for (let index = 0; index < 8; index++) memory[source + index] = 65 + index;
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(75, destination, source, count);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hooks[75](destination, source, count);
    assert.equal(actual, expected, `75/${count}: result`);
    assert.equal(runtime.stackPointer.value, stack, `75/${count}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `75/${count}: memory`);
    comparisons++;
  }

  for (const value of [0, 0x5a5a5a5a]) {
    memory.set(clean);
    new DataView(runtime.memory.buffer).setUint32(destination, value, true);
    new DataView(runtime.memory.buffer).setUint32(destination + 8, value, true);
    const setup = Buffer.from(memory);
    const expected = runtime.call(79, destination);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    hooks[79](destination);
    assert.equal(runtime.stackPointer.value, runtime.stackPointer.value, `79/${value}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `79/${value}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 5);
});
