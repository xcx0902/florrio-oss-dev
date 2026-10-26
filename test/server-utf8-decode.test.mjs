import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createUtf8DecodeHook, functionIds} from '../source/game/server/utf8-decode.mjs';

let comparisons = 0;
after(() => console.log(
  `server UTF-8 code-point scan oracle comparisons: ${comparisons} total; `
  + 'all one-byte inputs, lead/continuation classes, prefixes, budgets and random strings'));

test('UTF-8 code-point scanner 486 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createUtf8DecodeHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const base = 0x440000;
  assert.equal(hook[486].length, runtime.exports.__fn486.length);

  function check(bytes, budget, startOffset = 0, length = bytes.length) {
    memory.fill(0x5a, base - 32, base + 128);
    for (let i = 0; i < bytes.length; i++) memory[base + i] = bytes[i];
    const start = base + startOffset;
    const end = start + length;
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(486, 0xdead, 0xbeef, start, end, budget);
    const expectedMemory = Buffer.from(memory);
    memory.set(before);
    runtime.stackPointer.value = stack;
    const actual = hook[486](0xdead, 0xbeef, start, end, budget);
    assert.equal(actual, expected,
      `bytes=${bytes.map(b => b.toString(16)).join('.')} budget=${budget} length=${length}`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), 'memory');
    assert.equal(runtime.stackPointer.value, stack, 'stack');
    comparisons++;
  }

  for (let byte = 0; byte < 256; byte++) check([byte], 4);
  const leads = [0x00, 0x7f, 0x80, 0xbf, 0xc0, 0xc1, 0xc2, 0xdf, 0xe0, 0xe1, 0xec, 0xed, 0xee, 0xef, 0xf0, 0xf1, 0xf3, 0xf4, 0xf5, 0xff];
  const seconds = [0x00, 0x7f, 0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xaf, 0xbf, 0xc0, 0xff];
  for (const lead of leads) for (const second of seconds) check([lead, second], 4);
  const tripleSeconds = [0x00, 0x7f, 0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xbf, 0xc0, 0xff];
  const thirds = [0x00, 0x7f, 0x80, 0x8f, 0xbf, 0xc0, 0xff];
  for (const lead of [0xe0, 0xe1, 0xec, 0xed, 0xee, 0xef])
    for (const second of tripleSeconds)
      for (const third of thirds) check([lead, second, third], 4);
  for (const lead of [0xf0, 0xf1, 0xf3, 0xf4, 0xf5])
    for (const second of [0x00, 0x7f, 0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xbf, 0xc0, 0xff])
      for (const third of [0x80, 0xbf, 0xc0])
        for (const fourth of [0x7f, 0x80, 0xbf, 0xc0])
          check([lead, second, third, fourth], 4);

  const samples = [
    [0x41],
    [0xc2, 0xa2],
    [0xe2, 0x82, 0xac],
    [0xf0, 0x9f, 0x92, 0xa9],
    [0x41, 0xf0, 0x9f, 0x92, 0xa9, 0x42],
    [0xe4, 0xb8, 0xad, 0xe6, 0x96, 0x87],
  ];
  for (const bytes of samples) {
    for (let length = 0; length <= bytes.length; length++)
      for (const budget of [0, 1, 2, 3, 4, 5]) check(bytes, budget, 0, length);
  }
  for (const budget of [0, 1, 2, 3, 4, 0xffffffff])
    check([0x41, 0xc2, 0xa2, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x92, 0xa9], budget);
  check([0x41], 4, 3, 0);
  let state = 0x13579bdf;
  for (let trial = 0; trial < 200; trial++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const length = state % 10;
    const bytes = [];
    for (let i = 0; i < length; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      bytes.push((state >>> 24) & 0xff);
    }
    check(bytes, state % 8);
  }
});
