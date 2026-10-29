import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createMbrtowcHook, functionIds} from '../source/game/server/mbrtowc.mjs';

let comparisons = 0;
after(() => console.log(
  `server mbrtowc oracle comparisons: ${comparisons} total; `
  + 'C locale, strict UTF-8, persistence and special pointers'));

test('mbrtowc 184 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createMbrtowcHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const input = 0x300000;
  const output = 0x301000;
  const state = 0x302000;
  assert.equal(hook[184].length, runtime.exports.__fn184.length);

  const localePointer = view.getUint32(22540, true);
  function setLocale(utf8) {
    view.setUint32(localePointer, utf8 ? 1 : 0, true);
  }

  function resetBytes(bytes) {
    memory.fill(0x6d, input - 64, input + 128);
    memory.fill(0x6e, output, output + 64);
    memory.fill(0x6f, state, state + 64);
    memory.set(bytes, input);
    view.setUint32(state, 0, true);
    view.setUint32(8569384, 0, true);
  }

  const digest = () => createHash('sha1').update(memory).digest('hex');

  function prepare(bytes, codePoint, statePointer, initial, count, inputPointer) {
    setLocale(true);
    resetBytes(bytes);
    view.setUint32(statePointer, initial, true);
    const stack = runtime.stackPointer.value;
    memory.fill(0x6b, stack - 16, stack + 16);
    return stack;
  }

  function check(bytes, options = {}) {
    const {
      utf8 = true, codePoint = output, statePointer = state,
      initial = 0, count = bytes.length, inputPointer = input,
    } = options;
    const stack = prepare(bytes, codePoint, statePointer, initial, count, inputPointer);
    setLocale(utf8);
    const expected = runtime.call(184, codePoint, inputPointer, count, statePointer);
    const expectedDigest = digest();
    const expectedState = view.getUint32(statePointer, true);
    const expectedOut = view.getUint32(codePoint === 0 ? stack - 4 : codePoint, true);
    prepare(bytes, codePoint, statePointer, initial, count, inputPointer);
    setLocale(utf8);
    runtime.stackPointer.value = stack;
    const actual = hook[184](codePoint, inputPointer, count, statePointer);
    assert.equal(actual, expected, `return ${[...bytes]}/${utf8}/${count}`);
    assert.equal(digest(), expectedDigest, `memory ${[...bytes]}/${utf8}/${count}`);
    assert.equal(view.getUint32(statePointer, true), expectedState, 'state');
    assert.equal(view.getUint32(codePoint === 0 ? stack - 4 : codePoint, true), expectedOut, 'output');
    assert.equal(runtime.stackPointer.value, stack, 'stack');
    comparisons++;
  }

  // All one-byte inputs in both locales.
  for (const utf8 of [false, true]) {
    for (let byte = 0; byte < 256; byte++) check([byte], {utf8});
  }

  // Two-byte lead/continuation combinations.
  for (const lead of [0xc0, 0xc1, 0xc2, 0xdf, 0xe0, 0xed, 0xef, 0xf0, 0xf4, 0xf5, 0xff]) {
    for (const continuation of [0x00, 0x7f, 0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xbf, 0xc0, 0xff]) {
      check([lead, continuation]);
    }
  }

  // Representative complete and truncated multibyte sequences.
  for (const bytes of [
    [0xc2, 0xa2], [0xdf, 0xbf], [0xe0, 0xa0, 0x80], [0xe1, 0x80, 0x80],
    [0xed, 0x9f, 0xbf], [0xee, 0x80, 0x80], [0xef, 0xbf, 0xbf],
    [0xf0, 0x90, 0x80, 0x80], [0xf1, 0x80, 0x80, 0x80],
    [0xf3, 0xbf, 0xbf, 0xbf], [0xf4, 0x8f, 0xbf, 0xbf],
    [0xe0, 0x9f, 0xbf], [0xed, 0xa0, 0x80], [0xf0, 0x8f, 0xbf, 0xbf],
    [0xf4, 0x90, 0x80, 0x80], [0xf5, 0x80, 0x80, 0x80],
    [0xe1, 0x80], [0xe1], [0xf0, 0x90], [0xf0, 0x90, 0x80],
  ]) check(bytes);

  // Truncation boundaries: every prefix of every accepted 2/3/4-byte form.
  for (const bytes of [
    [0xc2, 0xa2], [0xe0, 0xa0, 0x80], [0xe1, 0x80, 0x80],
    [0xf0, 0x90, 0x80, 0x80], [0xf4, 0x8f, 0xbf, 0xbf],
  ]) {
    for (let length = 0; length <= bytes.length; length++) check(bytes.slice(0, length));
  }

  // Special pointers and zero count.
  check([], {count: 0});
  check([], {count: 0, initial: 0xc0000002});
  check([0x41], {codePoint: 0});
  check([0xff], {codePoint: 0, utf8: false});
  check([0xc2, 0xa2], {codePoint: 0});
  check([0x41], {inputPointer: 0});
  check([0x41], {inputPointer: 0, initial: 0xc0000002});
  check([0x41], {statePointer: 0, initial: 0xc0000002});

  // Persistence across two calls: first call leaves a partial state, the
  // second resumes it. Both callers are driven identically.
  function checkSplit(bytes, split) {
    setLocale(true);
    const stack = prepare(bytes, output, state, 0, bytes.length, input);
    const first = runtime.call(184, output, input, split, state);
    const resumedState = view.getUint32(state, true);
    const second = runtime.call(184, output + 8, input + split, bytes.length - split, state);
    const expectedDigest = digest();
    prepare(bytes, output, state, 0, bytes.length, input);
    runtime.stackPointer.value = stack;
    const actualFirst = hook[184](output, input, split, state);
    const actualResumedState = view.getUint32(state, true);
    const actualSecond = hook[184](output + 8, input + split, bytes.length - split, state);
    assert.equal(actualFirst, first, `split first ${bytes}/${split}`);
    assert.equal(actualResumedState, resumedState, `split state ${bytes}/${split}`);
    assert.equal(actualSecond, second, `split second ${bytes}/${split}`);
    assert.equal(digest(), expectedDigest, `split memory ${bytes}/${split}`);
    comparisons++;
  }
  for (const bytes of [
    [0xc2, 0xa2], [0xe0, 0xa0, 0x80], [0xe1, 0x80, 0x80],
    [0xf0, 0x90, 0x80, 0x80], [0xf4, 0x8f, 0xbf, 0xbf],
  ]) {
    for (let split = 1; split < bytes.length; split++) checkSplit(bytes, split);
  }
});
