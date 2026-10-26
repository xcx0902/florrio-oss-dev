import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createScalarHelperHooks, functionIds} from '../source/game/server/scalar-helpers.mjs';

let comparisons = 0;
after(() => console.log(
  `server scalar-helper oracle comparisons: ${comparisons} total; `
  + 'object limit, sentinel, width store, normalised pair'));

test('scalar helpers 305/307/358/377 match the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createScalarHelperHooks(runtime);
  const view = new DataView(runtime.memory.buffer);
  const memory = new Uint8Array(runtime.memory.buffer);
  const base = 0x3a0000;
  for (const id of functionIds)
    assert.equal(hooks[id].length, runtime.exports[`__fn${id}`].length);

  function compare(label, invoke, hook, ...args) {
    runtime.stackPointer.value = 0x100000;
    const expected = invoke(...args);
    const expectedMemory = Buffer.from(memory);
    runtime.stackPointer.value = 0x100000;
    memory.fill(0, base, base + 128);
    const actual = hook(...args);
    assert.equal(actual, expected, `${label}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${label}: memory`);
    comparisons++;
  }

  compare('305', () => runtime.call(305), () => hooks[305]());
  compare('307', () => runtime.call(307, 0, 0, 0), () => hooks[307](0, 0, 0));
  compare('307b', () => runtime.call(307, base, -1, 3), () => hooks[307](base, -1, 3));

  const values = [0n, 1n, 0xffn, 0x1234n, 0xdeadbeefn, -1n, 0x0123456789abcdefn, -0x123456789n];
  for (const encoding of [-3, -2, -1, 0, 1, 2, 3, 4, 7]) {
    for (const value of values) {
      memory.fill(0xaa, base, base + 128);
      const setup = Buffer.from(memory);
      runtime.stackPointer.value = 0x100000;
      runtime.call(358, base + 16, encoding, value);
      const expected = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = 0x100000;
      hooks[358](base + 16, encoding, value);
      assert.ok(Buffer.from(memory).equals(expected), `358/${encoding}/${value}`);
      comparisons++;
    }
  }

  for (const [first, second, third, fourth] of [
    [0n, 0n, 0n, 0n],
    [1n, 0x8000000000000000n, 0xffffffffffffffffn, 0xffffffffffffffffn],
    [0x123456789abcdefn, 0x0000800000000001n, 0n, 0x8000000000000000n],
    [0n, 0x7fffffffffffffffn, 0x123n, 0x0001000000000000n],
  ]) {
    memory.fill(0xaa, base, base + 128);
    const setup = Buffer.from(memory);
    runtime.stackPointer.value = 0x100000;
    runtime.call(377, base + 32, first, second, third, fourth);
    const expected = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = 0x100000;
    hooks[377](base + 32, first, second, third, fourth);
    assert.ok(Buffer.from(memory).equals(expected), `377/${first}/${second}`);
    comparisons++;
  }
});
