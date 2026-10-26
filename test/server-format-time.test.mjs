import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFormatTimeHook, functionIds} from '../source/game/server/format-time.mjs';

let comparisons = 0;
after(() => console.log(
  `server format time oracle comparisons: ${comparisons} total; patterns`));

test('locale time formatting matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 6], construct: false});
  const hook = createFormatTimeHook(runtime)[328];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const locale = 0xaa0000;
  const destination = 0xaa1000;
  const end = 0xaa2000;

  for (const [first, second] of [[88, 0], [88, 89], [0, 89]]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(locale, 0, true);
    view.setUint32(end, destination + 64, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(328, locale, destination, end, 123, first, second);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hook(locale, destination, end, 123, first, second);
    assert.equal(runtime.stackPointer.value, stack, `${first}/${second}: stack`);
    const low = Math.max(0, stack - 64);
    assert.ok(Buffer.from(memory.subarray(0, low)).equals(expectedMemory.subarray(0, low)), `${first}/${second}: memory below stack`);
    assert.ok(Buffer.from(memory.subarray(stack)).equals(expectedMemory.subarray(stack)), `${first}/${second}: memory above stack`);
    comparisons++;
  }
  assert.ok(comparisons >= 3);
});
