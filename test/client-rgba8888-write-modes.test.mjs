import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRgba8888WriteModesHooks, functionIds} from '../source/game/client/rgba8888-write-modes.mjs';

let comparisons = 0, fullChecks = 0, traps = 0;
after(() => console.log(
  `client rgba8888-write-modes oracle comparisons: ${comparisons} total `
  + `(${fullChecks} complete-memory, ${traps} trapping); high-byte preserve and modes 0..8`));

const SAFE = 0x100000;
const SURFACE = SAFE + 0x300;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createRgba8888WriteModesHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  const set32 = (address, value) => view.setUint32(address, value, true);
  function reset(source = 0x11223344) {
    bytes.fill(0xa5);
    bytes.fill(0, SAFE, SAFE + 0x1000);
    set32(0, 0);
    set32(SURFACE + 16, 16);
    set32(SURFACE + 20, SAFE + 0x600);
    set32(SAFE + 0x600 + 8, source);
    return [SURFACE, 2, 0, 1, 0x10, 0x20, 0x30, 0x7f];
  }
  function compare(args, label, full) {
    const beforePage = Buffer.from(bytes.subarray(SAFE, SAFE + 0x1000));
    const before = full ? Buffer.from(bytes) : null;
    const stack = runtime.stackPointer.value;
    const expected = invoke(() => runtime.call(951, ...args));
    const pixelAddress = (view.getUint32(SURFACE + 20, true)
      + Math.imul(args[2], view.getInt32(SURFACE + 16, true))
      + Math.imul(args[1], 4)) >>> 0;
    const expectedWord = pixelAddress + 4 <= bytes.length
      ? view.getUint32(pixelAddress, true) : null;
    const expectedMemory = full ? Buffer.from(bytes) : null;
    const expectedStack = runtime.stackPointer.value;
    bytes.set(beforePage, SAFE);
    if (full) bytes.set(before);
    runtime.stackPointer.value = stack;
    const actual = invoke(() => hooks[951](...args));
    assert.deepEqual(actual, expected, `${label}: outcome`);
    if (expectedWord !== null)
      assert.equal(view.getUint32(pixelAddress, true), expectedWord, `${label}: pixel`);
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

test('rgba8888-write-modes exposes the original arity and replaces id 951', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds], [951]);
  assert.equal(o.runtime.exports.__fn951.length, 8);
});

test('rgba8888-write-modes covers every mode and channel path', async () => {
  const o = await oracle();
  const sources = [0x11223344, 0x00000000, 0xffffffff, 0x80c0e010, 0x01020304];
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

test('rgba8888-write-modes covers coordinates and boundary traps', async () => {
  const o = await oracle();
  for (const [x, y] of [[0, 0], [2, 0], [0, 1], [3, 2], [-1, 0], [0, -1]]) {
    for (const mode of [1, 2, 3, 4]) {
      const args = o.reset(0x336699cc);
      args[1] = x; args[2] = y; args[3] = mode;
      o.compare(args, `coordinate ${x},${y}`, false);
    }
    const args = o.reset(0x336699cc);
    args[1] = x; args[2] = y;
    o.compare(args, `full ${x},${y}`, true);
  }
  o.compare([0x3ffffff, 0, 0, 1, 0, 0, 0, 0], 'surface trap', true);
  o.compare([SURFACE, 0x3ffffff, 0, 1, 0, 0, 0, 0], 'pixel trap', true);
});
