import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSequenceAndTableHelperHooks, functionIds} from '../source/game/server/sequence-and-table-helpers.mjs';

let comparisons = 0;
after(() => console.log(
  `server sequence/table helper oracle comparisons: ${comparisons} total; pairs, copies, decodes and bitsets`));

test('sequence and table helpers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createSequenceAndTableHelperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const base = 0x620000;

  const calls = {
    40: [base + 0x100, 0x12345678, base + 0x200],
    350: [base + 0x100, base + 0x200],
    354: [base + 0x300],
    454: [0, base + 0x400, base + 0x410, base + 0x500],
    457: [0, 5],
    459: [0, 5],
    463: [0, base + 0x600, base + 0x610, base + 0x700],
    472: [0, 0x0101, 4],
  };

  for (const id of functionIds) {
    for (let trial = 0; trial < 3; trial++) {
      memory.set(clean);
      for (let offset = 0x620000; offset < 0x620900; offset++) {
        memory[offset] = (id * 13 + trial * 29 + offset * 7) & 0xff;
      }
      if (id === 354) {
        const view = new DataView(runtime.memory.buffer);
        for (let index = 0; index < 6; index++) view.setUint32(base + 0x300 + index * 4, index + 1, true);
        view.setUint32(base + 0x300 + 6 * 4, 0, true);
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
      if (id === 40 || id === 350) {
        // The native leaf uses 16 bytes of dead scratch below the entry SP.
        expectedMemory.fill(0, stack - 16, stack);
        actualMemory.fill(0, stack - 16, stack);
      }
      assert.ok(actualMemory.equals(expectedMemory), `${id}/${trial}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 24);
});
