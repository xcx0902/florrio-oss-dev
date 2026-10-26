import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createInt64ParseLimitHooks, functionIds} from '../source/game/server/int64-parse-limits.mjs';

let comparisons = 0;
after(() => console.log(
  `server int64 parse limit oracle comparisons: ${comparisons} total; two limits`));

test('int64 parse limit wrappers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 373], construct: false});
  const hooks = createInt64ParseLimitHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const text = 0x930000;
  const output = 0x930100;

  for (const id of functionIds) {
    for (const textValue of ['123', '-9']) {
      memory.set(clean);
      for (let index = 0; index < textValue.length; index++) memory[text + index] = textValue.charCodeAt(index);
      memory[text + textValue.length] = 0;
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(id, output, text, text + textValue.length);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[id](output, text, text + textValue.length);
      assert.equal(actual, expected, `${id}/${textValue}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${textValue}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${textValue}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 4);
});
