import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAffineSamplerHooks} from '../source/game/client/affine-sampler.mjs';

const IDS = [2108, 2129, 2146, 2167];
let comparisons = 0;
after(() => console.log(
  `client affine-channels 2108/2129/2146/2167 oracle comparisons: ${comparisons} total `
  + '(0 trapping); flags bits 0/1 and byte 60..63'));

const SAFE = 0x100000;
const OBJECT = SAFE + 0x300;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds: IDS, construct: false});
  const hooks = createAffineSamplerHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const set32 = (address, value) => view.setUint32(address, value, true);
  function reset({flag = 1, factors = [128, 64, 255, 200], width = 4, rows = 3} = {}) {
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
    for (let index = 0; index < 4; index++) bytes[OBJECT + 60 + index] = factors[index];
    return [OBJECT];
  }
  function compare(id, args, label) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    let expected;
    try { expected = {result: runtime.call(id, ...args)}; }
    catch (error) { expected = {error: [error.constructor.name, error.message]}; }
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    runtime.stackPointer.value = stack;
    let actual;
    try { actual = {result: hooks[id](...args)}; }
    catch (error) { actual = {error: [error.constructor.name, error.message]}; }
    assert.deepEqual(actual, expected, `${label}: outcome`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${label}: complete memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    comparisons++;
  }
  return {runtime, hooks, reset, compare};
}

test('affine-channels expose the original arity for each permutation', async () => {
  const o = await oracle();
  for (const id of IDS) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('affine-channels match every flag and factor combination', async () => {
  const o = await oracle();
  const factorSets = [[0, 0, 0, 0], [255, 255, 255, 255], [1, 2, 3, 4],
    [128, 64, 255, 200], [7, 200, 33, 99]];
  for (const id of IDS) {
    for (const flag of [0, 1, 2, 3, 0xffffffff]) {
      for (const factors of factorSets)
        o.compare(id, o.reset({flag, factors}), `${id} flag ${flag} factors ${factors}`);
    }
  }
});

test('affine-channels match widths, rows and source strides', async () => {
  const o = await oracle();
  for (const id of IDS) {
    for (const [width, rows] of [[1, 1], [2, 2], [3, 4], [4, 3]]) {
      o.compare(id, o.reset({width, rows, flag: 3, factors: [255, 128, 64, 7]}),
        `${id} size ${width}x${rows}`);
    }
  }
});
