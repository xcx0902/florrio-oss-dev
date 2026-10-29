import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createUtf8ScanHook, functionIds} from '../source/game/server/utf8-scan.mjs';

let comparisons = 0;
after(() => console.log(
  `server UTF-8 scan oracle comparisons: ${comparisons} total; `
  + 'all one-byte inputs, lead/continuation classes, truncation and limits'));

test('UTF-8 scanner 483 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createUtf8ScanHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const base = 0x430000;
  assert.equal(hook[483].length, runtime.exports.__fn483.length);

  function check(bytes, budget, startOffset = 0, length = bytes.length) {
    memory.fill(0x3c, base - 32, base + 128);
    for (let i = 0; i < bytes.length; i++) memory[base + i] = bytes[i];
    const start = base + startOffset;
    const end = start + length;
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(483, 0xdead, 0xbeef, start, end, budget);
    const expectedMemory = Buffer.from(memory);
    memory.set(before);
    runtime.stackPointer.value = stack;
    const actual = hook[483](0xdead, 0xbeef, start, end, budget);
    assert.equal(actual, expected,
      `bytes=${bytes.map(b => b.toString(16)).join('.')} budget=${budget}`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), 'memory');
    assert.equal(runtime.stackPointer.value, stack, 'stack');
    comparisons++;
  }

  for (let byte = 0; byte < 256; byte++) check([byte], 4);
  const leads = [0x00, 0x7f, 0x80, 0xc0, 0xc1, 0xc2, 0xdf, 0xe0, 0xed, 0xf0, 0xf4, 0xf5, 0xff];
  const seconds = [0x00, 0x7f, 0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xbf, 0xc0, 0xff];
  for (const lead of leads) for (const second of seconds) check([lead, second], 4);
  const tripleLeads = [0xe0, 0xe1, 0xed, 0xef, 0xf0, 0xf1, 0xf4, 0xf5];
  const tripleSeconds = [0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xbf, 0xc0];
  const thirds = [0x7f, 0x80, 0xbf, 0xc0];
  for (const lead of tripleLeads)
    for (const second of tripleSeconds)
      for (const third of thirds) check([lead, second, third], 4);
  for (const lead of [0xf0, 0xf4, 0xf5])
    for (const second of [0x80, 0x8f, 0x90, 0xa0, 0xbf, 0xc0])
      for (const third of [0x80, 0xbf])
        for (const fourth of [0x7f, 0x80, 0xbf, 0xc0])
          check([lead, second, third, fourth], 4);

  const samples = [
    [0x41],
    [0xc2, 0xa2],
    [0xe2, 0x82, 0xac],
    [0xf0, 0x9f, 0x92, 0xa9],
    [0x41, 0xf0, 0x9f, 0x92, 0xa9, 0x42],
  ];
  for (const bytes of samples) {
    for (let length = 0; length <= bytes.length; length++)
      for (const budget of [0, 1, 2, 3, 4]) check(bytes, budget, 0, length);
  }
  check([0x41, 0x42, 0x43], 2);
  check([0x41, 0x42, 0x43], 1);
  check([0xf0, 0x9f, 0x92, 0xa9, 0x41], 3);
  check([0xf0, 0x9f, 0x92, 0xa9, 0x41], 2);
  check([0x41], 4, 3, 0);
  check([0x41, 0xc2, 0xa2, 0xe2, 0x82, 0xac], 0xffffffff);
  let state = 0x7f4a7c15;
  for (let trial = 0; trial < 100; trial++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const length = state % 9;
    const bytes = [];
    for (let i = 0; i < length; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      bytes.push((state >>> 24) & 0xff);
    }
    check(bytes, state % 7);
  }
});
