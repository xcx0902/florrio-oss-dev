import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringCopyConstructorHook, functionIds} from '../source/game/server/string-copy-constructor.mjs';

let comparisons = 0;
after(() => console.log(
  `server string copy-constructor oracle comparisons: ${comparisons} total; short, inline and heap paths`));

test('libc++ string copy constructor matches original', async () => {
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, 58, 112, 121], construct: false,
  });
  const hook = createStringCopyConstructorHook(runtime)[534];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const dest = 0x500000;
  const source = 0x502000;
  const text = 0x504000;
  const view = () => new DataView(runtime.memory.buffer);

  const cases = [];
  for (let size = 0; size <= 40; size++) cases.push(size);
  cases.push(63, 64, 65, 127, 1000);
  let state = 0x31415926;

  for (const size of cases) {
    for (const inline of [true, false]) {
      if (size > 1 && inline) continue;
      memory.set(clean);
      const memoryView = view();
      for (let index = 0; index <= size; index++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        memory[text + index] = state >>> 24;
      }
      if (inline) {
        memoryView.setBigUint64(source, 0x1122334455667788n, true);
        memoryView.setUint32(source + 8, 0xaabbccdd, true);
        memoryView.setUint8(source + 11, size);
      } else {
        memoryView.setUint32(source, text, true);
        memoryView.setUint32(source + 4, size, true);
        memoryView.setUint32(source + 8, (size + 1) | 0x80000000, true);
      }
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      runtime.call(534, dest, 0, 0, 0, 0, source);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      hook(dest, 0, 0, 0, 0, source);
      assert.equal(runtime.stackPointer.value, stack, `size ${size}/${inline}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `size ${size}/${inline}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 40);
});
