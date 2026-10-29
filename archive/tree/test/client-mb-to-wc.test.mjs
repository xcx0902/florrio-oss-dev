import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createMbToWcHooks, functionIds} from '../source/game/client/mb-to-wc.mjs';

let comparisons = 0;
after(() => console.log(
  `client mb-to-wc 651 oracle comparisons: ${comparisons} total (0 trapping); `
  + 'C locale, table decoding, state save/resume, errno and stack output'));

const SAFE = 0x100000;
const INPUT = SAFE + 0x400;
const OUTPUT = SAFE + 0x500;
const STATE = SAFE + 0x600;
const GLOBAL_STATE = 7945608;
const ERRNO = 7944552;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createMbToWcHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const set32 = (address, value) => view.setUint32(address, value, true);
  function reset(sequence, {state = 0, locale = 0} = {}) {
    bytes.fill(0, SAFE, SAFE + 0x1000);
    bytes.set(sequence, INPUT);
    set32(GLOBAL_STATE, state);
    set32(STATE, state);
    set32(ERRNO, 0);
    const flagPointer = view.getUint32(133584, true);
    set32(flagPointer, locale);
    return [OUTPUT, INPUT, sequence.length, STATE];
  }
  function compare(args, label) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    let expected;
    try { expected = {result: runtime.call(651, ...args)}; }
    catch (error) { expected = {error: [error.constructor.name, error.message]}; }
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    runtime.stackPointer.value = stack;
    let actual;
    try { actual = {result: hooks[651](...args)}; }
    catch (error) { actual = {error: [error.constructor.name, error.message]}; }
    assert.deepEqual(actual, expected, `${label}: outcome`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${label}: complete memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    comparisons++;
  }
  return {runtime, hooks, reset, compare, set32};
}

test('mb-to-wc 651 keeps the original arity and replaces id 651', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds], [651]);
  assert.equal(o.hooks[651].length, o.runtime.exports.__fn651.length);
});

test('mb-to-wc 651 matches the C-locale fast path and ASCII', async () => {
  const o = await oracle();
  for (const sequence of [[0x41], [0x7f], [0], [0x80], [0xc2], [0xff], [0xc2, 0x80], [0xe1, 0x80, 0x80], [0xf0, 0x90, 0x80, 0x80]]) {
    o.compare(o.reset(sequence), `ascii ${sequence.map(x => x.toString(16))}`);
  }
});

test('mb-to-wc 651 decodes locale table sequences and resumes saved state', async () => {
  const o = await oracle();
  const sequences = [
    [0xc2, 0x80], [0xdf, 0xbf], [0xe0, 0xa0, 0x80], [0xed, 0x9f, 0xbf],
    [0xe1, 0x80, 0x80], [0xf0, 0x90, 0x80, 0x80], [0xf4, 0x8f, 0xbf, 0xbf]
  ];
  for (const sequence of sequences) {
    o.compare(o.reset(sequence, {locale: 1}), `valid ${sequence.map(x => x.toString(16))}`);
  }
  for (const sequence of [[0xc2, 0x7f], [0x80], [0xc0, 0x80], [0xed, 0xa0, 0x80], [0xf0, 0x8f, 0xbf, 0xbf], [0xff]]) {
    o.compare(o.reset(sequence, {locale: 1}), `invalid ${sequence.map(x => x.toString(16))}`);
  }
  for (const [sequence, count] of [[[0xc2], 1], [[0xe1, 0x80], 2], [[0xf0, 0x90, 0x80], 3]]) {
    const args = o.reset(sequence, {locale: 1});
    args[2] = count;
    o.compare(args, `truncated ${sequence.map(x => x.toString(16))}`);
    const saved = viewState(o.runtime);
    const resumeArgs = o.reset([0x80, 0x41]);
    resumeArgs[3] = STATE;
    resumeArgs[2] = 1;
    o.set32(STATE, saved);
    o.compare(resumeArgs, `resume ${sequence.map(x => x.toString(16))}`);
  }
});

function viewState(runtime) {
  return new DataView(runtime.memory.buffer).getUint32(STATE, true);
}

test('mb-to-wc 651 handles null inputs, zero counts, globals and stack output', async () => {
  const o = await oracle();
  o.compare(o.reset([0x41]), 'normal');
  const nullInput = o.reset([0x41]);
  nullInput[1] = 0;
  o.compare(nullInput, 'null input state 0');
  const nullState = o.reset([0x41]);
  nullState[1] = 0;
  o.set32(STATE, 0x100);
  o.compare(nullState, 'null input state 256');
  const zeroCount = o.reset([0x41]);
  zeroCount[2] = 0;
  o.compare(zeroCount, 'zero count');
  const stackOutput = o.reset([0x41]);
  stackOutput[0] = 0;
  o.compare(stackOutput, 'stack output');
  const globalState = o.reset([0xc2, 0x80], {locale: 1});
  globalState[3] = 0;
  o.compare(globalState, 'global state pointer');
  const pending = o.reset([0x80], {state: 0x100, locale: 1});
  o.compare(pending, 'pending state');
});

test('mb-to-wc 651 matches deterministic random byte spans', async () => {
  const o = await oracle();
  let state = 0x6d2b79f5;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) & 255;
  for (let row = 0; row < 96; row++) {
    const length = 1 + (next() % 8);
    const sequence = Array.from({length}, next);
    const args = o.reset(sequence, {locale: row % 2, state: row % 3 === 0 ? 0x100 : 0});
    args[2] = 1 + (next() % length);
    o.compare(args, `random ${row}`);
  }
});
