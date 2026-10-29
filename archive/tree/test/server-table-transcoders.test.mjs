import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createTableTranscoderHooks, functionIds} from '../source/game/server/table-transcoders.mjs';

let comparisons = 0;
after(() => console.log(
  `server table transcoder oracle comparisons: ${comparisons} total; copy, decode, scan and reset`));

test('table transcoders match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createTableTranscoderHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const base = 0x630000;

  const calls = {
    112: [base + 0x100, base + 0x200, 4],
    452: [0, base + 0x300, base + 0x310, 0x2a, base + 0x400],
    456: [0, base + 0x500, base + 0x510],
    458: [0, base + 0x520, base + 0x530],
    461: [0, base + 0x540, base + 0x550, 0x2a, base + 0x600],
    465: [0, base + 0x620, base + 0x630],
    467: [0, base + 0x640, base + 0x650],
    469: [0, 0x0101, base + 0x660, base + 0x670],
    470: [0, 0x0101, base + 0x680, base + 0x690],
    471: [0, base + 0x6a0, base + 0x6b0, base + 0x700],
    473: [0, 0, base + 0x800, base + 0x810, 7],
    482: [],
  };

  for (const id of functionIds) {
    for (let trial = 0; trial < 2; trial++) {
      memory.set(clean);
      for (let offset = 0x630000; offset < 0x630900; offset++) {
        memory[offset] = (id * 7 + trial * 41 + offset * 3) & 0xff;
      }
      const view = new DataView(runtime.memory.buffer);
      for (let index = 0; index < 4; index++) view.setUint32(base + 0x660 + index * 4, index, true);
      for (let index = 0; index < 4; index++) view.setUint32(base + 0x680 + index * 4, index, true);
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
      if (id === 473) {
        expectedMemory.fill(0, stack - 16, stack);
        actualMemory.fill(0, stack - 16, stack);
      }
      assert.ok(actualMemory.equals(expectedMemory), `${id}/${trial}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 24);
});
