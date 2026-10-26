import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createUnicodeCodecHooks, functionIds} from '../source/game/server/unicode-codecs.mjs';

let comparisons = 0;
const counts = {487: 0, 488: 0};
after(() => console.log(
  `server Unicode codec oracle comparisons: ${comparisons} total; `
  + `487=${counts[487]} UTF-8 to UTF-32, 488=${counts[488]} UTF-32 to UTF-8`));

const base = 0x410000;
const sourceBase = base + 0x1000;
const destinationBase = base + 0x2000;
const outputBase = base + 0x3000;
const frame = base + 0x8000;
const sourceCursorOut = outputBase;
const destinationCursorOut = outputBase + 8;

test('Unicode codecs 487/488 match the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createUnicodeCodecHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  assert.equal(hook[487].length, runtime.exports.__fn487.length);
  assert.equal(hook[488].length, runtime.exports.__fn488.length);

  function compare(id, capacity, sourceBytes, sourceLength = sourceBytes.length) {
    memory.fill(0x5a, base - 64, base + 0x9000);
    for (let index = 0; index < sourceBytes.length; index++)
      memory[sourceBase + index] = sourceBytes[index];
    view.setUint32(sourceCursorOut, 0xdeadbeef, true);
    view.setUint32(destinationCursorOut, 0xdeadbeef, true);
    view.setUint32(frame - 8, 0x11111111, true);
    view.setUint32(frame - 4, 0x22222222, true);
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(id, frame, 0xcafebabe, sourceBase, sourceBase + sourceLength,
      sourceCursorOut, destinationBase, destinationBase + capacity, destinationCursorOut);
    const expectedMemory = Buffer.from(memory);
    memory.set(before);
    runtime.stackPointer.value = stack;
    const actual = hook[id](frame, 0xcafebabe, sourceBase, sourceBase + sourceLength,
      sourceCursorOut, destinationBase, destinationBase + capacity, destinationCursorOut);
    const label = sourceBytes.map(byte => byte.toString(16).padStart(2, '0')).join('.');
    assert.equal(actual, expected, `${id} return for ${label}, capacity ${capacity}, source ${sourceLength}`);
    assert.ok(Buffer.from(memory).equals(expectedMemory),
      `${id} complete memory for ${label}, capacity ${capacity}, source ${sourceLength}`);
    assert.equal(runtime.stackPointer.value, stack, `${id} stack pointer`);
    comparisons++;
    counts[id]++;
  }

  const u32 = values => values.flatMap(value => [value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]);
  const bytes = (...values) => values;
  const ascii = Array.from({length: 128}, (_, byte) => [byte]);
  for (const sequence of ascii) compare(487, 16, sequence);
  for (const lead of [0xc2, 0xcf, 0xd0, 0xdf])
    for (const second of [0x80, 0x9f, 0xbf, 0x7f, 0xc0]) compare(487, 8, bytes(lead, second));
  for (const lead of [0xe0, 0xe1, 0xec, 0xed, 0xee, 0xef])
    for (const second of [0x80, 0x9f, 0xa0, 0xbf, 0x7f]) compare(487, 8, bytes(lead, second, 0x80));
  for (const lead of [0xf0, 0xf1, 0xf3, 0xf4, 0xf5])
    for (const second of [0x80, 0x8f, 0x90, 0xbf, 0xc0])
      compare(487, 8, bytes(lead, second, 0x80, 0x80));
  for (const sequence of [
    bytes(0xf0, 0x90, 0x80, 0x80), bytes(0xf4, 0x8f, 0xbf, 0xbf),
    bytes(0xed, 0x9f, 0xbf), bytes(0xed, 0xa0, 0x80), bytes(0xe0, 0xa0, 0x80),
    bytes(0xc2, 0x80), bytes(0x7f), bytes(0xc2), bytes(0xe1, 0x80),
    bytes(0xf0, 0x90, 0x80), bytes(0xe1, 0x80, 0x41), bytes(0xf0, 0x90, 0x80, 0x41),
    bytes(0x80), bytes(0xc0, 0x80), bytes(0xf5, 0x80, 0x80, 0x80),
    bytes(0x41, 0xe1, 0x80, 0x80, 0x42), bytes(0xe1, 0x80, 0x80, 0x42),
  ]) for (let capacity = 0; capacity <= 8; capacity++) compare(487, capacity, sequence);
  for (const sequence of [
    bytes(0x41, 0xc2, 0x80, 0xe1, 0x80, 0x80, 0xf0, 0x90, 0x80, 0x80),
    bytes(0xf0, 0x90, 0x80, 0x80, 0xf4, 0x8f, 0xbf, 0xbf),
  ]) compare(487, 32, sequence);
  {
    let state = 0x2545f491;
    for (let trial = 0; trial < 100; trial++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const length = state % 7;
      const sequence = [];
      for (let index = 0; index < length; index++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        sequence.push(state & 255);
      }
      compare(487, state % 9, sequence);
    }
  }

  for (const codePoint of [
    0x0, 0x1, 0x41, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xffff,
    0x10000, 0x10ffff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0x110000, 0xffffffff,
  ]) for (let capacity = 0; capacity <= 6; capacity++) compare(488, capacity, u32([codePoint]));
  for (const sequence of [
    [0x41], [0x7f], [0x80], [0x7ff], [0x800], [0xffff], [0x10000], [0x10ffff],
    [0x41, 0x80, 0x800, 0x10000], [0x10000, 0x41], [0x10ffff, 0x41],
    [0xd800], [0x41, 0xd800], [0xdc00], [0x110000], [0x41, 0x110000, 0x42],
  ]) {
    for (let capacity = 0; capacity <= 8; capacity++) compare(488, capacity, u32(sequence));
    compare(488, 32, u32(sequence));
  }
  for (let sourceLength = 0; sourceLength <= 8; sourceLength++)
    compare(488, 16, u32([0x41, 0x10000]), sourceLength);
  {
    let state = 0x9e3779b9;
    for (let trial = 0; trial < 100; trial++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const length = state % 6;
      const sequence = [];
      for (let index = 0; index < length; index++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        sequence.push(state);
      }
      compare(488, state % 10, u32(sequence));
    }
  }
});
