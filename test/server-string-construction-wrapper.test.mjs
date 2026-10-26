import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringConstructionWrapperHooks, functionIds} from '../source/game/server/string-construction-wrapper.mjs';

let comparisons = 0;
after(() => console.log(
  `server string construction wrapper oracle comparisons: ${comparisons} total; C strings and null-safe UTF-8`));

test('C-string construction and null-safe UTF-8 wrapper match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 204, 124], construct: false});
  const hooks = createStringConstructionWrapperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0x6b0000;
  const text = 0x6b2000;

  for (const length of [0, 1, 5, 10, 11, 22, 23, 40, 80]) {
    memory.set(clean);
    for (let index = 0; index < length; index++) memory[text + index] = 65 + (index % 26);
    memory[text + length] = 0;
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(200, destination, text);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hooks[200](destination, text);
    assert.equal(actual, expected, `200/${length}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `200/${length}: memory`);
    comparisons++;
  }

  for (const value of [0, 0x41, 0x7f, 0x80, 0x7ff, 0x800, 0xd800, 0xe000, 0x10000, 0x10ffff]) {
    for (const nullDestination of [false, true]) {
      memory.set(clean);
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(382, nullDestination ? 0 : destination, value);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[382](nullDestination ? 0 : destination, value);
      assert.equal(actual, expected, `382/${value}/${nullDestination}: result`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `382/${value}/${nullDestination}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 25);
});
