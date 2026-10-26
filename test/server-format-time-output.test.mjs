import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFormatTimeOutputHook, functionIds} from '../source/game/server/format-time-output.mjs';

let comparisons = 0;
after(() => console.log(
  `server format time output oracle comparisons: ${comparisons} total; patterns`));

test('locale time output matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 328, 360, 365, 6], construct: false});
  const hook = createFormatTimeOutputHook(runtime)[548];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const locale = 0xab0000;
  const output = 0xab1000;

  for (const [first, second] of [[88, 0], [88, 89]]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(locale + 8, 0, true);
    view.setUint32(output, 0, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(548, locale, output, 0, 123, first, second);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(locale, output, 0, 123, first, second);
    assert.equal(actual, expected, `${first}/${second}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${first}/${second}: stack`);
    const low = Math.max(0, stack - 160);
    assert.ok(Buffer.from(memory.subarray(0, low)).equals(expectedMemory.subarray(0, low)), `${first}/${second}: memory below stack`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
