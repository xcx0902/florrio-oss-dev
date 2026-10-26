import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamPutbackHook, functionIds} from '../source/game/server/stream-putback.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream put-back oracle comparisons: ${comparisons} total; byte, EOF and flag paths`));

test('stream put-back matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createStreamPutbackHook(runtime)[624];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const base = 0x700000;
  const buffer = 0x701000;

  for (const [read, limit] of [[0, 0], [0, 1], [1, 4], [4, 4], [5, 4]]) {
    for (const value of [-1, 0x41, 0x42, 0xff, 0x141]) {
      for (const flags of [0, 16]) {
        memory.set(clean);
        const view = new DataView(runtime.memory.buffer);
        memory[buffer] = 0x42;
        view.setUint32(base + 8, read, true);
        view.setUint32(base + 12, limit, true);
        view.setUint32(base + 16, 1, true);
        view.setUint32(base + 24, 3, true);
        view.setUint32(base + 44, 2, true);
        view.setUint32(base + 48, flags, true);
        const setup = Buffer.from(memory);
        const stack = runtime.stackPointer.value;
        const expected = runtime.call(624, base, value);
        const expectedMemory = Buffer.from(memory);
        memory.set(setup);
        runtime.stackPointer.value = stack;
        const actual = hook(base, value);
        assert.equal(actual, expected, `${read}/${limit}/${value}/${flags}: result`);
        assert.ok(Buffer.from(memory).equals(expectedMemory), `${read}/${limit}/${value}/${flags}: memory`);
        comparisons++;
      }
    }
  }
  assert.ok(comparisons >= 50);
});
