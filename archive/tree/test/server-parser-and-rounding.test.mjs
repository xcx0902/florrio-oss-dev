import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createParserAndRoundingHooks, functionIds} from '../source/game/server/parser-and-rounding.mjs';

let comparisons = 0;
after(() => console.log(
  `server parser/rounding oracle comparisons: ${comparisons} total; prefixes, error state and roundf`));

test('parser and rounding helpers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createParserAndRoundingHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const base = 0x650000;
  const values = [0, -0, 0.1, 0.5, -0.5, 0.7, 1.2, 1.5, -1.5, 2.5, -2.5,
    3.7, -3.7, 8388607.5, 8388608, 1e-8, -1e-8, 1e30, -1e30, Infinity, -Infinity, NaN];

  for (let trial = 0; trial < 6; trial++) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    const text = ['', '+12', '-7', '0x1f', '0X2A', '9'][trial];
    for (let index = 0; index <= text.length; index++) view.setUint8(base + 0x100 + index, text.charCodeAt(index) || 0);
    view.setUint32(base + 0x200 + 4, [16, 32, 16, 16, 0, 16][trial], true);
    view.setUint32(base + 0x300, 0, true);
    view.setUint32(base + 0x320, 0, true);

    for (const [id, args] of [
      [70, [base + 0x100, base + 0x100 + text.length, base + 0x200]],
      [82, [base + 0x300, base + 0x320]],
    ]) {
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(id, ...args);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[id](...args);
      assert.equal(actual, expected, `${id}/${trial}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${trial}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${trial}: memory`);
      comparisons++;
    }
  }

  for (const value of values) {
    for (let syntaxTrial = 0; syntaxTrial < 3; syntaxTrial++) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      view.setUint8(base + 0x400, syntaxTrial === 0 ? 65 : syntaxTrial === 1 ? 66 : 67);
      view.setUint8(base + 0x401, 0);
      view.setUint32(base + 0x400 + 4, 512, true);
      const flags = [0, 8, 64, 74, 2048 | 512 | 16384][syntaxTrial];
      const stack = runtime.stackPointer.value;
      runtime.call(110, base + 0x500, base + 0x400, syntaxTrial & 1, flags);
      const expectedMemory = Buffer.from(memory);
      memory.set(clean);
      view.setUint8(base + 0x400, syntaxTrial === 0 ? 65 : syntaxTrial === 1 ? 66 : 67);
      view.setUint8(base + 0x401, 0);
      view.setUint32(base + 0x404, 512, true);
      runtime.stackPointer.value = stack;
      hooks[110](base + 0x500, base + 0x400, syntaxTrial & 1, flags);
      const actualBytes = Buffer.from(memory);
      if (!actualBytes.equals(expectedMemory)) {
        let where = -1; for (let index = 0; index < actualBytes.length; index++) if (actualBytes[index] !== expectedMemory[index]) { where = index; break; }
        assert.fail(`110/${syntaxTrial}/${value}: memory at ${where}: ${expectedMemory[where]} vs ${actualBytes[where]}`);
      }
      comparisons++;
      break;
    }

    memory.set(clean);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(212, value);
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    runtime.stackPointer.value = stack;
    const actual = hooks[212](value);
    assert.ok(Object.is(actual, expected), `212/${value}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `212/${value}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 40);
});
