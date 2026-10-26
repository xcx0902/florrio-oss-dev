import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createUtf8AdvanceHooks} from '../source/game/client/utf8-advance.mjs';

let comparisons = 0, fullChecks = 0;
after(() => console.log(
  `client utf8-advance-wide 1810 oracle comparisons: ${comparisons} total `
  + `(${fullChecks} complete-memory, 0 trapping); four-byte sequences consume two characters`));

const SAFE = 0x100000;
const DATA = SAFE + 0x400;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds: [1810], construct: false});
  const hooks = createUtf8AdvanceHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  function reset(sequence, offset = 0) {
    bytes.fill(0xa5);
    bytes.fill(0, SAFE, SAFE + 0x1000);
    bytes.set(sequence, DATA + offset);
    return [0, 0, DATA, DATA + offset + sequence.length, sequence.length];
  }
  function compare(args, label, full) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    let expected;
    try { expected = {result: runtime.call(1810, ...args)}; }
    catch (error) { expected = {error: [error.constructor.name, error.message]}; }
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    runtime.stackPointer.value = stack;
    let actual;
    try { actual = {result: hooks[1810](...args)}; }
    catch (error) { actual = {error: [error.constructor.name, error.message]}; }
    assert.deepEqual(actual, expected, `${label}: outcome`);
    if (full) {
      assert.ok(Buffer.from(bytes).equals(expectedMemory), `${label}: complete memory`);
      assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
      fullChecks++;
    }
    comparisons++;
  }
  return {runtime, hooks, reset, compare};
}

test('utf8-advance-wide 1810 keeps the original arity', async () => {
  const o = await oracle();
  assert.equal(o.hooks[1810].length, o.runtime.exports.__fn1810.length);
});

test('utf8-advance-wide 1810 matches valid, invalid and truncated sequences', async () => {
  const o = await oracle();
  const sequences = [
    [0x41], [0x7f], [0x41, 0x42, 0x43],
    [0xc2, 0x80], [0xdf, 0xbf], [0xc2], [0xc2, 0x7f],
    [0xe0, 0xa0, 0x80], [0xe0, 0x9f, 0xbf], [0xed, 0x9f, 0xbf],
    [0xed, 0xa0, 0x80], [0xe1, 0x80, 0x80], [0xe1, 0x80],
    [0xf0, 0x90, 0x80, 0x80], [0xf4, 0x8f, 0xbf, 0xbf],
    [0xf4, 0x90, 0x80, 0x80], [0xf1, 0x80, 0x80, 0x80],
    [0xf0, 0x8f, 0xbf, 0xbf], [0xf0, 0x90, 0x80], [0xf5, 0x80, 0x80, 0x80],
    [0x80], [0xc0, 0x80], [0xff]
  ];
  for (const sequence of sequences)
    o.compare(o.reset(sequence), `sequence ${sequence.map(x => x.toString(16))}`, true);
});

test('utf8-advance-wide 1810 honours end and character limits', async () => {
  const o = await oracle();
  const buffer = [0x41, 0xf0, 0x90, 0x80, 0x80, 0xc2, 0x80, 0x42];
  for (let end = 0; end <= buffer.length; end++) {
    for (let limit = 0; limit <= 6; limit++) {
      const args = o.reset(buffer);
      args[3] = DATA + end;
      args[4] = limit;
      o.compare(args, `end ${end} limit ${limit}`, end === buffer.length && limit === 6);
    }
  }
});

test('utf8-advance-wide 1810 matches deterministic random spans', async () => {
  const o = await oracle();
  let state = 0x2545f491;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) & 255;
  for (let row = 0; row < 120; row++) {
    const length = 1 + (next() % 12);
    const buffer = Array.from({length}, next);
    const args = o.reset(buffer);
    args[3] = DATA + (next() % (length + 1));
    args[4] = next() % 6;
    o.compare(args, `random ${row}`, row % 10 === 0);
  }
});
