import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAffineSamplerHooks} from '../source/game/client/affine-sampler.mjs';

let comparisons = 0;
after(() => console.log(
  `client affine-scale 968 oracle comparisons: ${comparisons} total (0 trapping); flag bit 0 and bytes 60..62`));

const SAFE = 0x100000;
const OBJECT = SAFE + 0x300;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds: [968], construct: false});
  const hooks = createAffineSamplerHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const set32 = (address, value) => view.setUint32(address, value, true);
  function reset({flag = 1, low = 128, middle = 64, high = 255, width = 4, rows = 3} = {}) {
    bytes.fill(0xa5);
    bytes.fill(0, SAFE, SAFE + 0x1000);
    set32(0, 0);
    for (let index = 0; index < 96; index++)
      set32(SAFE + 0x800 + index * 4, (0x10203040 + index * 0x03050709) >>> 0);
    set32(OBJECT, SAFE + 0x800);
    set32(OBJECT + 4, 3);
    set32(OBJECT + 8, 2);
    set32(OBJECT + 12, 32);
    set32(OBJECT + 20, SAFE + 0x600);
    set32(OBJECT + 24, width);
    set32(OBJECT + 28, rows);
    set32(OBJECT + 32, 16);
    set32(OBJECT + 52, flag);
    bytes[OBJECT + 60] = low;
    bytes[OBJECT + 61] = middle;
    bytes[OBJECT + 62] = high;
    return [OBJECT];
  }
  function compare(args, label) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    let expected;
    try { expected = {result: runtime.call(968, ...args)}; }
    catch (error) { expected = {error: [error.constructor.name, error.message]}; }
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    runtime.stackPointer.value = stack;
    let actual;
    try { actual = {result: hooks[968](...args)}; }
    catch (error) { actual = {error: [error.constructor.name, error.message]}; }
    assert.deepEqual(actual, expected, `${label}: outcome`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${label}: complete memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    comparisons++;
  }
  return {reset, compare};
}

test('affine-scale 968 keeps the original arity', async () => {
  const runtime = await loadOriginal('client', {functionIds: [968], construct: false});
  assert.equal(createAffineSamplerHooks(runtime)[968].length, runtime.exports.__fn968.length);
});

test('affine-scale 968 matches every channel-scale combination', async () => {
  const o = await oracle();
  for (const flag of [0, 1, 2, 3, 0xffffffff]) {
    for (const [low, middle, high] of [[0, 0, 0], [255, 255, 255],
      [1, 2, 3], [128, 64, 255], [7, 200, 33]]) {
      o.compare(o.reset({flag, low, middle, high}), `flag ${flag} scale ${low}/${middle}/${high}`);
    }
  }
});

test('affine-scale 968 matches sizes, strides and boundary descriptors', async () => {
  const o = await oracle();
  for (const [width, rows] of [[1, 1], [2, 2], [3, 4], [4, 3], [5, 2]]) {
    for (const low of [0, 128, 255]) {
      o.compare(o.reset({width, rows, low, middle: 200, high: 99}),
        `size ${width}x${rows} low ${low}`);
    }
  }
});
