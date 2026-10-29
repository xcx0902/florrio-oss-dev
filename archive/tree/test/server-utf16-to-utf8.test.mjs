import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createUtf16ToUtf8Hook, functionIds} from '../source/game/server/utf16-to-utf8.mjs';

let comparisons = 0;
after(() => console.log(
  `server UTF-16 to UTF-8 oracle comparisons: ${comparisons} total; `
  + 'BMP ranges, surrogate pairs, unpaired surrogates, capacities and truncation'));

test('UTF-16 to UTF-8 transcoder 485 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createUtf16ToUtf8Hook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const base = 0x410000;
  const sourceBase = base + 0x1000;
  const destinationBase = base + 0x2000;
  const outputBase = base + 0x3000;
  const frame = base + 0x8000;
  const sourceCursorOut = outputBase;
  const destinationCursorOut = outputBase + 8;
  assert.equal(hook[485].length, runtime.exports.__fn485.length);

  function check(units, destinationCapacity = 16, sourceUnits = units.length) {
    memory.fill(0x5a, base - 64, base + 0x9000);
    for (let index = 0; index < units.length; index++)
      view.setUint16(sourceBase + index * 2, units[index], true);
    view.setUint32(sourceCursorOut, 0xdeadbeef, true);
    view.setUint32(destinationCursorOut, 0xdeadbeef, true);
    view.setUint32(frame - 8, 0x11111111, true);
    view.setUint32(frame - 4, 0x22222222, true);
    const sourceEnd = sourceBase + sourceUnits * 2;
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(485, frame, 0xcafebabe, sourceBase, sourceEnd,
      sourceCursorOut, destinationBase, destinationBase + destinationCapacity,
      destinationCursorOut);
    const expectedMemory = Buffer.from(memory);
    memory.set(before);
    runtime.stackPointer.value = stack;
    const actual = hook[485](frame, 0xcafebabe, sourceBase, sourceEnd,
      sourceCursorOut, destinationBase, destinationBase + destinationCapacity,
      destinationCursorOut);
    const label = units.map(unit => unit.toString(16).padStart(4, '0')).join('.');
    assert.equal(actual, expected, `return for ${label}, capacity ${destinationCapacity}, source ${sourceUnits}`);
    assert.ok(Buffer.from(memory).equals(expectedMemory),
      `complete memory for ${label}, capacity ${destinationCapacity}, source ${sourceUnits}`);
    assert.equal(runtime.stackPointer.value, stack, 'stack pointer');
    comparisons++;
  }

  // Every one-byte BMP unit, then representative wider units.
  for (let unit = 0; unit <= 0x7f; unit++) check([unit]);
  for (let unit = 0x80; unit <= 0x7ff; unit += 31) check([unit]);
  for (let unit = 0x800; unit <= 0xd7ff; unit += 257) check([unit]);
  for (let unit = 0xe000; unit <= 0xffff; unit += 257) check([unit]);

  // Surrogate pairs spanning the whole high range with representative lows.
  for (let high = 0xd800; high <= 0xdbff; high += 16) check([high, 0xdc00]);
  for (let low = 0xdc00; low <= 0xdfff; low += 16) check([0xd800, low]);
  for (const [high, low] of [
    [0xd800, 0xdc00], [0xd800, 0xdfff], [0xdbff, 0xdc00], [0xdbff, 0xdfff],
    [0xd800, 0xe000], [0xdbff, 0xd7ff],
  ]) check([high, low]);

  // Unpaired and reversed surrogate shapes.
  for (const unit of [0xd800, 0xd801, 0xdbff, 0xdc00, 0xdc01, 0xdfff]) check([unit]);
  for (const pair of [
    [0xd800, 0xd800], [0xdbff, 0xdbff], [0xdc00, 0xdc00], [0xdfff, 0xdfff],
    [0xd800, 0x0041], [0xd800, 0xffff], [0xd800, 0xd7ff], [0xdc00, 0xd800],
  ]) check(pair);

  // Destination capacity 0..4 for each encoded length (invalid pairs consume nothing).
  for (const units of [[0x41], [0x7f], [0x80], [0x7ff], [0x800], [0xffff], [0xd800, 0xdc00], [0xd800, 0xd800]])
    for (let capacity = 0; capacity <= 4; capacity++) check(units, capacity);

  // Every source truncation prefix of a pair, plus trailing data.
  for (const units of [[0xd800, 0xdc00], [0x41, 0xd800, 0xdc00], [0xd800, 0xdc00, 0x42]])
    for (let sourceUnits = 0; sourceUnits <= units.length; sourceUnits++)
      for (const capacity of [0, 1, 3, 4, 8]) check(units, capacity, sourceUnits);

  // Unaligned destination cursor and multi-unit strings.
  for (const units of [[0x41, 0x80, 0x800, 0xffff], [0xd800, 0xdc00, 0x41], [0x41, 0x42, 0x43, 0x44]])
    check(units, 32);

  let state = 0x2545f491;
  for (let trial = 0; trial < 100; trial++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const length = state % 6;
    const units = [];
    for (let index = 0; index < length; index++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      units.push(state >>> 16);
    }
    check(units, state % 7, length - (state % 3 === 0 ? 1 : 0));
  }
});
