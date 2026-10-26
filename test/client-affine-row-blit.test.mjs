import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAffineSamplerHooks, functionIds} from '../source/game/client/affine-sampler.mjs';

let comparisons = 0;
after(() => console.log(
  `client affine-row-blit 2188/2204 oracle comparisons: ${comparisons} total (0 trapping); `
  + '16.16 resampling, channel rotation and alpha forcing'));

const SAFE = 0x100000;
const DESCRIPTOR = SAFE + 0x300;
const DESTINATION = SAFE + 0x600;
const SOURCE = SAFE + 0x1000;
const IDS = [2188, 2204];

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createAffineSamplerHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const set32 = (address, value) => view.setUint32(address, value, true);
  let seed = 0xa5a5a5a5;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  function reset({width, rows, scaleWidth, scaleHeight, sourceStride, destinationStride}) {
    bytes.fill(0, SAFE, SAFE + 0x3000);
    for (let index = 0; index < 512; index++) set32(SOURCE + index * 4, next());
    for (let index = 0; index < 64; index++) set32(DESTINATION + index * 4, next());
    set32(DESCRIPTOR, SOURCE);
    set32(DESCRIPTOR + 4, scaleWidth);
    set32(DESCRIPTOR + 8, scaleHeight);
    set32(DESCRIPTOR + 12, sourceStride);
    set32(DESCRIPTOR + 20, DESTINATION);
    set32(DESCRIPTOR + 24, width);
    set32(DESCRIPTOR + 28, rows);
    set32(DESCRIPTOR + 32, destinationStride);
    return [DESCRIPTOR];
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
  return {runtime, hooks, reset, compare, next};
}

test('affine row blit keeps both arities and ids', async () => {
  const o = await oracle();
  for (const id of IDS) {
    assert.ok(functionIds.includes(id), `${id} registered`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length);
  }
});

test('affine row blit matches fixed-point width, height and stride grids', async () => {
  const o = await oracle();
  for (const id of IDS) {
    for (const width of [1, 2, 3, 4]) {
      for (const rows of [1, 2, 3]) {
        for (const [scaleWidth, scaleHeight, sourceStride, destinationStride] of [
          [1, 1, 4, 4], [2, 3, 8, 8], [4, 2, 12, 16], [3, 4, 16, 12]
        ]) {
          o.compare(id, o.reset({width, rows, scaleWidth, scaleHeight, sourceStride, destinationStride}),
            `${id} w${width} r${rows} s${scaleWidth}x${scaleHeight}`);
        }
      }
    }
  }
});

test('affine row blit matches deterministic random descriptors', async () => {
  const o = await oracle();
  for (let row = 0; row < 8; row++) {
    const args = o.reset({
      width: 1 + (o.next() % 5),
      rows: 1 + (o.next() % 5),
      scaleWidth: 1 + (o.next() % 8),
      scaleHeight: 1 + (o.next() % 8),
      sourceStride: 8 + (o.next() % 12),
      destinationStride: 8 + (o.next() % 12),
    });
    for (const id of IDS) o.compare(id, args, `random ${row} id${id}`);
  }
});
