import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createServerFrexpHook, functionIds} from '../source/game/server/frexp.mjs';

let comparisons = 0;
after(() => console.log(
  `server frexp oracle comparisons: ${comparisons} total (0 trapping); `
  + 'normals, subnormals, signed zero, infinities and NaN'));

const VALUES = [
  0, -0, 1, -1, 0.5, 0.1, -0.1, 1.5, 1024, -1024, 2 ** -1022,
  2 ** -1074, 5e-324, -5e-324, 1.7976931348623157e308,
  Infinity, -Infinity, NaN,
];

test('server frexp 381 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createServerFrexpHook(runtime);
  const view = new DataView(runtime.memory.buffer);
  assert.equal(hook[381].length, runtime.exports.__fn381.length);
  for (const [index, value] of VALUES.entries()) {
    const address = 0x300000 + index * 16;
    view.setInt32(address, 0x5a5a5a5a, true);
    view.setInt32(address + 4, 0x5a5a5a5a, true);
    const before = Buffer.from(new Uint8Array(runtime.memory.buffer));
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(381, value, address);
    const expectedWord = view.getInt32(address, true);
    const expectedMemory = Buffer.from(new Uint8Array(runtime.memory.buffer));
    new Uint8Array(runtime.memory.buffer).set(before);
    runtime.stackPointer.value = stack;
    const actual = hook[381](value, address);
    assert.deepEqual(Object.is(actual, expected) || (Number.isNaN(actual) && Number.isNaN(expected)), true,
      `${value}: result`);
    assert.equal(view.getInt32(address, true), expectedWord, `${value}: exponent`);
    assert.ok(Buffer.from(new Uint8Array(runtime.memory.buffer)).equals(expectedMemory),
      `${value}: complete memory`);
    assert.equal(runtime.stackPointer.value, stack, `${value}: stack`);
    comparisons++;
  }
});
