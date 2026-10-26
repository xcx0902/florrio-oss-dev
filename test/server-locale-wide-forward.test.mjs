import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLocaleWideForwardHook, functionIds} from '../source/game/server/locale-wide-forward.mjs';

let comparisons = 0;
after(() => console.log(
  `server locale wide forward oracle comparisons: ${comparisons} total; table slot 269`));

test('wide locale forwarder matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createLocaleWideForwardHook(runtime)[619];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const self = 0xa40000;
  const record = 0xa41000;
  const vtable = 0xa42000;
  const source = 0xa43000;

  for (const value of [0n, 1234567890123n]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(record, vtable, true);
    view.setUint32(vtable + 16, 269, true);
    view.setBigUint64(source + 8, value, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(619, self, record, source, 11);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hook(self, record, source, 11);
    assert.equal(runtime.stackPointer.value, stack, `${value}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${value}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
