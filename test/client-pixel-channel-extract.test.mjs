import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createPixelChannelExtractHooks, functionIds} from '../source/game/client/pixel-channel-extract.mjs';

let comparisons = 0, fullChecks = 0, traps = 0;
after(() => console.log(
  `client pixel-channel-extract oracle comparisons: ${comparisons} total `
  + `(${fullChecks} complete-memory, ${traps} trapping); plane table, alpha and first-zero-channel paths`));

const SAFE = 0x100000;
const DESCRIPTOR = SAFE + 0x300;
const FORMAT = SAFE + 0x400;
const OUT = SAFE + 0x600;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createPixelChannelExtractHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  const set32 = (address, value) => view.setUint32(address, value, true);
  const get32 = address => view.getUint32(address, true);
  function reset({
    planes = [0x40, 0x41, 0x42], packed = [0x01020304, 0x05060708, 0x090a0b0c],
    indices = [1, 2, 3], shifts = [0, 8, 16], alphaPacked = 0,
    alphaIndex = 4, alphaShift = 0, alphaPlane = 0x44,
    formatShifts = [0, 8, 16, 24], alphaEnabled = true,
  } = {}) {
    bytes.fill(0xa5);
    bytes.fill(0, SAFE, SAFE + 0x1000);
    set32(0, 0);
    for (let index = 0; index < 8; index++)
      set32(104976 + index * 4, SAFE + 0x800 + index * 0x20);
    for (let index = 0; index < 3; index++)
      bytes[SAFE + 0x800 + indices[index] * 0x20] = planes[index];
    bytes[SAFE + 0x800 + alphaIndex * 0x20] = alphaPlane;
    for (let index = 0; index < 3; index++) {
      set32(DESCRIPTOR + 12 + index * 4, packed[index]);
      bytes[DESCRIPTOR + 28 + index] = indices[index];
      bytes[DESCRIPTOR + 32 + index] = shifts[index];
    }
    set32(DESCRIPTOR + 24, alphaPacked);
    bytes[DESCRIPTOR + 31] = alphaIndex;
    bytes[DESCRIPTOR + 35] = alphaShift;
    for (let index = 0; index < 4; index++)
      bytes[FORMAT + 28 + index] = formatShifts[index];
    set32(FORMAT + 24, alphaEnabled ? 1 : 0);
    set32(OUT, 0xdeadbeef);
    set32(OUT + 4, 0xdeadbeef);
    set32(OUT + 8, 0xdeadbeef);
    set32(OUT + 12, 0xdeadbeef);
    set32(OUT + 16, 0xdeadbeef);
    return [DESCRIPTOR, FORMAT, OUT, OUT + 4, OUT + 8, OUT + 12, OUT + 16];
  }
  function compare(args, label, full) {
    const before = full ? Buffer.from(bytes) : null;
    const stack = runtime.stackPointer.value;
    const expected = invoke(() => runtime.call(530, ...args));
    const outputs = [0, 1, 2, 3, 4].map(index => get32(OUT + index * 4));
    const expectedMemory = full ? Buffer.from(bytes) : null;
    const expectedStack = runtime.stackPointer.value;
    if (full) bytes.set(before);
    runtime.stackPointer.value = stack;
    const actual = invoke(() => hooks[530](...args));
    assert.deepEqual(actual, expected, `${label}: outcome`);
    assert.deepEqual([0, 1, 2, 3, 4].map(index => get32(OUT + index * 4)), outputs,
      `${label}: outputs`);
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

test('pixel-channel-extract exposes the original arity and replaces id 530', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds], [530]);
  assert.equal(o.runtime.exports.__fn530.length, 7);
});

test('pixel-channel-extract covers every first-zero-channel path', async () => {
  const o = await oracle();
  const cases = [];
  // Compose shifts 8/16/24 from plane bytes, alpha at 0.
  const formatShifts = [8, 16, 24, 0];
  for (const samples of [
    [0x11, 0x22, 0x33, 0x44],
    [0x00, 0x22, 0x33, 0x44],
    [0x11, 0x00, 0x33, 0x44],
    [0x11, 0x22, 0x00, 0x44],
    [0x11, 0x22, 0x33, 0x00],
    [0x00, 0x00, 0x00, 0x00],
  ]) {
    for (const alphaPacked of [0x01000000, 0, 0x01020304]) {
      for (const alphaEnabled of [true, false]) {
        cases.push({
          planes: samples.slice(0, 3), packed: [0x00000000, 0x00000000, 0x00000000],
          shifts: [0, 0, 0], formatShifts, alphaPacked,
          alphaPlane: samples[3], alphaIndex: 4, alphaEnabled,
        });
      }
    }
  }
  for (const options of cases) o.compare(o.reset(options), 'channel path', false);
});

test('pixel-channel-extract covers shifts, optional alpha, mode pointer and traps', async () => {
  const o = await oracle();
  const variants = [
    {}, { alphaEnabled: false }, { alphaPacked: 0 },
    { alphaShift: 8 }, { alphaIndex: 0 }, { alphaPlane: 0 },
    { shifts: [8, 16, 24] }, { formatShifts: [0, 4, 8, 12] },
    { formatShifts: [31, 30, 29, 28] }, { packed: [0xffffffff, 0xffffffff, 0xffffffff] },
  ];
  for (const options of variants) {
    o.compare(o.reset(options), 'variant', false);
    const args = o.reset(options);
    args[6] = 0;
    o.compare(args, 'no mode pointer', true);
  }
  let state = 0x31415926;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return state >>> 0;
  };
  for (let index = 0; index < 120; index++) {
    const options = {
      planes: [next() & 255, next() & 255, next() & 255],
      packed: [next(), next(), next()],
      shifts: [next() & 31, next() & 31, next() & 31],
      formatShifts: [next() & 31, next() & 31, next() & 31, next() & 31],
      alphaPacked: index % 3 === 0 ? 0 : next(),
      alphaShift: next() & 31,
      alphaEnabled: (next() & 1) !== 0,
    };
    o.compare(o.reset(options), `random ${index}`, index % 10 === 0);
  }
  o.compare([0x3ffffff, FORMAT, OUT, OUT + 4, OUT + 8, OUT + 12, OUT + 16],
    'descriptor trap', true);
  o.compare([DESCRIPTOR, FORMAT, OUT, OUT + 4, OUT + 8, OUT + 12, 0x3ffffff],
    'mode pointer trap', true);
});
