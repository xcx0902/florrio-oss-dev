import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRgb555WriteModesHooks, functionIds} from '../source/game/client/rgb555-write-modes.mjs';

let comparisons = 0, fullChecks = 0, traps = 0;
after(() => console.log(
  `client rgb555-write-modes oracle comparisons: ${comparisons} total `
  + `(${fullChecks} complete-memory, ${traps} trapping); 6-bit green and masked modes 0..8`));

const SAFE = 0x100000;
const SURFACE = SAFE + 0x300;
const GREEN_TABLE = 132496;
const RED_BLUE_TABLE = 132560;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createRgb555WriteModesHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  const set32 = (address, value) => view.setUint32(address, value, true);
  function reset(source = 0x7bef) {
    bytes.fill(0xa5);
    bytes.fill(0, SAFE, SAFE + 0x1000);
    set32(0, 0);
    for (let index = 0; index < 64; index++)
      bytes[GREEN_TABLE + index] = index % 5 === 0 ? 255 : (index * 4 + 1) & 255;
    for (let index = 0; index < 32; index++)
      bytes[RED_BLUE_TABLE + index] = index % 4 === 0 ? 255 : (index * 8 + 3) & 255;
    set32(SURFACE + 16, 16);
    set32(SURFACE + 20, SAFE + 0x600);
    view.setUint16(SAFE + 0x600 + 4, source, true);
    return [SURFACE, 2, 0, 1, 0x10, 0x20, 0x30, 0x7f];
  }
  function compare(args, label, full) {
    const beforePage = Buffer.from(bytes.subarray(SAFE, SAFE + 0x1000));
    const beforeGreen = Buffer.from(bytes.subarray(GREEN_TABLE, GREEN_TABLE + 64));
    const beforeRedBlue = Buffer.from(bytes.subarray(RED_BLUE_TABLE, RED_BLUE_TABLE + 32));
    const before = full ? Buffer.from(bytes) : null;
    const stack = runtime.stackPointer.value;
    const expected = invoke(() => runtime.call(953, ...args));
    const pixelAddress = (view.getUint32(SURFACE + 20, true)
      + Math.imul(args[2], view.getInt32(SURFACE + 16, true))
      + Math.imul(args[1], 2)) >>> 0;
    const expectedWord = pixelAddress + 2 <= bytes.length
      ? view.getUint16(pixelAddress, true) : null;
    const expectedMemory = full ? Buffer.from(bytes) : null;
    const expectedStack = runtime.stackPointer.value;
    bytes.set(beforePage, SAFE);
    bytes.set(beforeGreen, GREEN_TABLE);
    bytes.set(beforeRedBlue, RED_BLUE_TABLE);
    if (full) bytes.set(before);
    runtime.stackPointer.value = stack;
    const actual = invoke(() => hooks[953](...args));
    assert.deepEqual(actual, expected, `${label}: outcome`);
    if (expectedWord !== null)
      assert.equal(view.getUint16(pixelAddress, true), expectedWord, `${label}: pixel`);
    if (full) {
      assert.ok(Buffer.from(bytes).equals(expectedMemory), `${label}: complete memory`);
      assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
      fullChecks++;
    }
    if (expected.error) traps++;
    comparisons++;
  }
  return {reset, compare, runtime};
}

test('rgb555-write-modes exposes the original arity and replaces id 953', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds], [953]);
  assert.equal(o.runtime.exports.__fn953.length, 8);
});

test('rgb555-write-modes covers every mode and channel path', async () => {
  const o = await oracle();
  const sources = [0x0000, 0x7bef, 0xffff, 0x1234, 0x8420];
  const colours = [[0, 0, 0], [1, 2, 3], [255, 254, 253], [256, 0x1234, -1]];
  for (const mode of [-1, 0, 1, 2, 3, 4, 5, 8]) {
    for (const source of sources) {
      for (const [red, green, blue] of colours) {
        for (const alpha of [0, 0x7f, 0xff, 0x100]) {
          const args = o.reset(source);
          args[3] = mode; args[4] = red; args[5] = green; args[6] = blue; args[7] = alpha;
          o.compare(args, `mode ${mode}`, false);
        }
      }
    }
  }
});

test('rgb555-write-modes covers coordinates, tables and traps', async () => {
  const o = await oracle();
  for (const [x, y] of [[0, 0], [2, 0], [0, 1], [3, 2], [-1, 0], [0, -1]]) {
    for (const mode of [1, 2, 3, 4]) {
      const args = o.reset(0x7bef);
      args[1] = x; args[2] = y; args[3] = mode;
      o.compare(args, `coordinate ${x},${y}`, false);
    }
    const args = o.reset(0x7bef);
    args[1] = x; args[2] = y;
    o.compare(args, `full ${x},${y}`, true);
  }
  for (let index = 0; index < 64; index++) {
    const args = o.reset(0x7bef);
    args[3] = 4; args[4] = index; args[5] = 63 - index; args[6] = index * 5;
    o.compare(args, `green table ${index}`, index % 8 === 0);
  }
  o.compare([0x3ffffff, 0, 0, 1, 0, 0, 0, 0], 'surface trap', true);
  o.compare([SURFACE, 0x3ffffff, 0, 1, 0, 0, 0, 0], 'pixel trap', true);
});
