import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createScaledChannelBlitHooks, functionIds} from '../source/game/client/scaled-channel-blit.mjs';

let comparisons = 0;
after(() => console.log(
  `client scaled-channel-blit 2200 oracle comparisons: ${comparisons} total (0 trapping); `
  + 'resampling, channel scaling and alpha selection'));

const SAFE = 0x100000;
const DESCRIPTOR = SAFE + 0x300;
const DESTINATION = SAFE + 0x600;
const SOURCE = SAFE + 0x1000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createScaledChannelBlitHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const set8 = (address, value) => view.setUint8(address, value);
  const set32 = (address, value) => view.setUint32(address, value, true);
  let seed = 0x12345678;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  function reset({width, rows, scaleWidth, scaleHeight, sourceStride, destinationStride, flags, factorLow, factorMiddle, factorHigh, alpha}) {
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
    set32(DESCRIPTOR + 52, flags);
    set8(DESCRIPTOR + 60, factorHigh);
    set8(DESCRIPTOR + 61, factorMiddle);
    set8(DESCRIPTOR + 62, factorLow);
    set8(DESCRIPTOR + 63, alpha);
    return [DESCRIPTOR];
  }
  function compare(args, label) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    let expected;
    try { expected = {result: runtime.call(2200, ...args)}; }
    catch (error) { expected = {error: [error.constructor.name, error.message]}; }
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    runtime.stackPointer.value = stack;
    let actual;
    try { actual = {result: hooks[2200](...args)}; }
    catch (error) { actual = {error: [error.constructor.name, error.message]}; }
    assert.deepEqual(actual, expected, `${label}: outcome`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${label}: complete memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    comparisons++;
  }
  return {runtime, hooks, reset, compare, next};
}

test('scaled-channel-blit 2200 keeps the original arity and id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds], [2200]);
  assert.equal(o.hooks[2200].length, o.runtime.exports.__fn2200.length);
});

test('scaled-channel-blit 2200 matches scale and flag grids', async () => {
  const o = await oracle();
  for (const width of [1, 2, 3, 4]) {
    for (const rows of [1, 2, 3]) {
      for (const [flags, factorLow, factorMiddle, factorHigh, alpha] of [
        [0, 10, 20, 30, 40], [1, 10, 20, 30, 40],
        [2, 255, 128, 1, 200], [3, 64, 192, 96, 17]
      ]) {
        o.compare(o.reset({width, rows, scaleWidth: 1 + (width % 5), scaleHeight: 1 + (rows % 4),
          sourceStride: 8 + width, destinationStride: 8 + rows,
          flags, factorLow, factorMiddle, factorHigh, alpha}), `w${width} r${rows} f${flags}`);
      }
    }
  }
});

test('scaled-channel-blit 2200 matches deterministic random descriptors', async () => {
  const o = await oracle();
  for (let row = 0; row < 12; row++) {
    o.compare(o.reset({
      width: 1 + (o.next() % 4),
      rows: 1 + (o.next() % 4),
      scaleWidth: 1 + (o.next() % 8),
      scaleHeight: 1 + (o.next() % 8),
      sourceStride: 8 + (o.next() % 12),
      destinationStride: 8 + (o.next() % 12),
      flags: o.next() % 4,
      factorLow: o.next() % 256,
      factorMiddle: o.next() % 256,
      factorHigh: o.next() % 256,
      alpha: o.next() % 256,
    }), `random ${row}`);
  }
});
