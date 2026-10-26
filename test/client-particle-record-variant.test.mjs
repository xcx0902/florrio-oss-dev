import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createParticleRecordHooks} from '../source/game/client/particle-record.mjs';

let comparisons = 0;
after(() => console.log(
  `client particle-record-variant 1105 oracle comparisons: ${comparisons} total (0 trapping); `
  + 'thresholds 10/0 and accumulator/source mapping'));

const SAFE = 0x100000;
const DESCRIPTOR = SAFE + 0x300;
const COUNT = SAFE + 0x380;
const RECORDS = SAFE + 0x400;
const SOURCE = SAFE + 0x700;
const ACCUMULATOR = SAFE + 0x780;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds: [1105], construct: false});
  const hooks = createParticleRecordHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const set32 = (address, value) => view.setUint32(address, value, true);
  const setF32 = (address, value) => view.setFloat32(address, value, true);
  function reset(sourceValues, accumulatorValues, count = 0) {
    bytes.fill(0xa5);
    bytes.fill(0, SAFE, SAFE + 0x1000);
    set32(COUNT, count);
    set32(DESCRIPTOR, COUNT);
    set32(DESCRIPTOR + 4, RECORDS);
    set32(DESCRIPTOR + 8, SOURCE);
    set32(DESCRIPTOR + 12, ACCUMULATOR);
    for (let index = 0; index < 4; index++) setF32(SOURCE + index * 4, sourceValues[index]);
    for (let index = 0; index < 6; index++)
      setF32(ACCUMULATOR + index * 4, accumulatorValues[index]);
    return [DESCRIPTOR];
  }
  function compare(args, label) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    let expected;
    try { expected = {result: runtime.call(1105, ...args)}; }
    catch (error) { expected = {error: [error.constructor.name, error.message]}; }
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    runtime.stackPointer.value = stack;
    let actual;
    try { actual = {result: hooks[1105](...args)}; }
    catch (error) { actual = {error: [error.constructor.name, error.message]}; }
    assert.deepEqual(actual, expected, `${label}: outcome`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${label}: complete memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    comparisons++;
  }
  return {runtime, hooks, reset, compare};
}

test('particle-record-variant 1105 keeps the original arity', async () => {
  const o = await oracle();
  assert.equal(o.hooks[1105].length, o.runtime.exports.__fn1105.length);
});

test('particle-record-variant 1105 matches finite and special combinations', async () => {
  const o = await oracle();
  const sources = [[0, 0, 0, 0], [1, -1, 5, -5], [10, -10, 20, -20],
    [3.5, 9.5, -0.5, 15.25], [-100, 100, 0.5, -0.5]];
  const accumulators = [[0, 0, 0, 0, 0, 0], [1, 2, 3, 4, 5, 6],
    [-1, -2, -3, -4, -5, -6], [20, -20, 10, -10, 0.5, -0.5]];
  for (const source of sources)
    for (const accumulator of accumulators)
      o.compare(o.reset(source, accumulator), `source ${source} acc ${accumulator}`);
  for (const value of [NaN, Infinity, -Infinity, -0]) {
    for (let position = 0; position < 4; position++) {
      const source = [0, 0, 0, 0]; source[position] = value;
      o.compare(o.reset(source, [0, 0, 0, 0, 0, 0]), `special ${value} at ${position}`);
    }
  }
  for (const count of [0, 1, 7, 0xffffffff])
    o.compare(o.reset([2, 4, 6, 8], [0, 0, 0, 0, 0, 0], count), `count ${count}`);
});

test('particle-record-variant 1105 matches deterministic random rows', async () => {
  const o = await oracle();
  let state = 0x9e3779b9;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return ((state >>> 7) % 50001 - 25000) / 631;
  };
  for (let row = 0; row < 64; row++) {
    const source = [next(), next(), next(), next()];
    const accumulator = [next(), next(), next(), next(), next(), next()];
    o.compare(o.reset(source, accumulator, row % 3), `random ${row}`);
  }
});
