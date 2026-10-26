import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringAndSequencePrimitiveHooks, functionIds} from '../source/game/server/string-and-sequence-primitives.mjs';

let comparisons = 0;
after(() => console.log(
  `server string/sequence primitive oracle comparisons: ${comparisons} total; SSO, seek, compare, reverse and hash`));

test('string and sequence primitives match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createStringAndSequencePrimitiveHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const base = 0x640000;

  const calls = {
    71: [base + 0x100],
    83: [base + 0x200, 5n],
    126: [base + 0x300, base + 0x340],
    181: [base + 0x400, base + 0x410],
    606: [0, base + 0x500, base + 0x510],
    608: [0, base + 0x600, base + 0x610, base + 0x620, base + 0x630],
    609: [0, base + 0x700, base + 0x710],
  };

  for (const id of functionIds) {
    for (let trial = 0; trial < 3; trial++) {
      memory.set(clean);
      for (let offset = 0x640000; offset < 0x640800; offset++) {
        memory[offset] = (id * 19 + trial * 23 + offset * 5) & 0xff;
      }
      const view = new DataView(runtime.memory.buffer);
      // Deterministic structures.
      view.setUint8(base + 0x100 + 11, trial % 2 ? 0 : 0x80);
      view.setUint32(base + 0x100, base + 0x180, true);
      view.setUint32(base + 0x200 + 8, 64, true);
      view.setUint32(base + 0x200 + 4, 8, true);
      const left = 'hello';
      const right = trial % 2 ? 'hello' : 'hellp';
      for (let index = 0; index < 6; index++) {
        view.setUint8(base + 0x300 + index, left.charCodeAt(index) || 0);
        view.setUint8(base + 0x340 + index, right.charCodeAt(index) || 0);
      }
      for (let index = 0; index < 4; index++) view.setInt32(base + 0x400 + index * 4, index + 1, true);
      for (let index = 0; index < 4; index++) {
        view.setInt32(base + 0x600 + index * 4, index, true);
        view.setInt32(base + 0x620 + index * 4, index, true);
      }
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(id, ...calls[id]);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[id](...calls[id]);
      assert.equal(actual, expected, `${id}/${trial}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${trial}: stack`);
      const actualMemory = Buffer.from(memory);
      if (id === 71) {
        expectedMemory.fill(0, stack - 16, stack);
        actualMemory.fill(0, stack - 16, stack);
      }
      assert.ok(actualMemory.equals(expectedMemory), `${id}/${trial}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 21);
});
