import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createUtf8DecodeHooks, functionIds} from '../source/game/client/utf8-decode.mjs';

let comparisons = 0, fullChecks = 0, traps = 0;
after(() => console.log(
  `client utf8-decode oracle comparisons: ${comparisons} total `
  + `(${fullChecks} complete-memory, ${traps} trapping); 1/2-byte exhaustive plus 3/4-byte boundaries`));

const SAFE = 0x100000;
const INPUT = SAFE + 0x400;
const STATE = SAFE + 0x800;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createUtf8DecodeHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  const set32 = (address, value) => view.setUint32(address, value, true);
  const get32 = address => view.getUint32(address, true);
  function reset(sequence, length) {
    bytes.fill(0xa5);
    bytes.fill(0, SAFE, SAFE + 0x1000);
    set32(0, 0);
    for (let index = 0; index < sequence.length; index++)
      bytes[INPUT + index] = sequence[index];
    set32(STATE, 0xdeadbeef);
    return [INPUT, length, STATE];
  }
  function compare(args, label, full) {
    const before = full ? Buffer.from(bytes) : null;
    const stack = runtime.stackPointer.value;
    const expected = invoke(() => runtime.call(531, ...args));
    const expectedState = get32(STATE);
    const expectedMemory = full ? Buffer.from(bytes) : null;
    const expectedStack = runtime.stackPointer.value;
    if (full) bytes.set(before);
    runtime.stackPointer.value = stack;
    const actual = invoke(() => hooks[531](...args));
    assert.deepEqual(actual, expected, `${label}: outcome`);
    assert.equal(get32(STATE), expectedState, `${label}: state`);
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

test('utf8-decode exposes the original arity and replaces id 531', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds], [531]);
  assert.equal(o.runtime.exports.__fn531.length, 3);
});

test('utf8-decode matches every one- and two-byte sequence', async () => {
  const o = await oracle();
  for (let value = 0; value < 256; value++)
    o.compare(o.reset([value], 1), `single ${value}`, false);
  for (let lead = 194; lead <= 223; lead++) {
    for (let second = 0; second < 256; second++)
      o.compare(o.reset([lead, second], 2), `two ${lead} ${second}`, false);
  }
});

test('utf8-decode matches three- and four-byte boundaries and truncation', async () => {
  const o = await oracle();
  const sequences = [];
  for (const lead of [224, 225, 237, 238, 239, 240, 241, 244]) {
    for (const second of [0x7f, 0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xbf]) {
      for (const tail of [0x00, 0x7f, 0x80, 0xbf, 0xc0, 0xff])
        sequences.push([lead, second, tail, tail]);
    }
  }
  sequences.push([0xf0, 0x90, 0x80, 0x80], [0xf4, 0x8f, 0xbf, 0xbf],
    [0xed, 0xa0, 0x80, 0x80], [0xf0, 0x8f, 0xbf, 0xbf]);
  for (const sequence of sequences) {
    for (const length of [0, 1, 2, 3, 4, -1]) {
      o.compare(o.reset(sequence, length), `seq ${sequence} len ${length}`, false);
    }
  }
  let state = 0x12345678;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return state >>> 0;
  };
  for (let index = 0; index < 240; index++) {
    const sequence = [0xe0 | (next() & 15), next() & 255,
      next() & 255, next() & 255];
    o.compare(o.reset(sequence, index % 6 === 0 ? -1 : sequence.length),
      `random ${sequence}`, index % 8 === 0);
  }
  o.compare(o.reset([0xf0, 0x90, 0x80, 0x80], 4), 'complete-memory baseline', true);
  o.compare([0x3ffffff, 4, STATE], 'input boundary trap', true);
  o.compare([INPUT, 4, 0x3ffffff], 'state boundary trap', true);
});
