import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createUtf8ToUtf16Hook, functionIds} from '../source/game/server/utf8-to-utf16.mjs';

let comparisons = 0;
after(() => console.log(
  `server UTF-8→UTF-16 oracle comparisons: ${comparisons} total; valid, truncated and invalid input`));

test('UTF-8 to UTF-16 decoder matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createUtf8ToUtf16Hook(runtime)[484];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const input = 0x690000;
  const output = 0x691000;
  const inputCursor = 0x692000;
  const outputCursor = 0x692010;

  const samples = [
    [], [0x41], [0x41, 0x42, 0x43], [0x7f], [0xc2, 0x80], [0xdf, 0xbf],
    [0xe0, 0xa0, 0x80], [0xed, 0x9f, 0xbf], [0xef, 0xbf, 0xbf],
    [0xf0, 0x90, 0x80, 0x80], [0xf4, 0x8f, 0xbf, 0xbf],
    [0x41, 0xc2], [0xe0, 0xa0], [0xf0, 0x90, 0x80],
    [0xc0, 0x80], [0xc2, 0x20], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80],
    [0xf0, 0x80, 0x80, 0x80], [0xf5, 0x80, 0x80, 0x80], [0xff],
    [0x41, 0x42, 0x43, 0x44, 0x45, 0x46],
  ];

  for (const sample of samples) {
    for (const outUnits of [0, 1, 2, 3, 8]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      for (let index = 0; index < sample.length; index++) memory[input + index] = sample[index];
      const bytes = sample.length;
      const args = [0, 0, input, input + bytes, inputCursor, output, output + outUnits * 2, outputCursor];
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(484, ...args);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hook(...args);
      assert.equal(actual, expected, `${sample}/${outUnits}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${sample}/${outUnits}: stack`);
      const actualMemory = Buffer.from(memory);
      // The native decoder uses 16 bytes of dead scratch below the entry SP.
      expectedMemory.fill(0, stack - 16, stack);
      actualMemory.fill(0, stack - 16, stack);
      assert.ok(actualMemory.equals(expectedMemory), `${sample}/${outUnits}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 100);
});
