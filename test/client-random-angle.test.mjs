import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRandomAngleHooks, functionIds} from '../source/game/client/random-angle.mjs';

let comparisons = 0;
after(() => console.log(
  `client random-angle oracle comparisons: ${comparisons} total (0 trapping); `
  + 'Park–Miller Schrage sequence and f32 angle quantization'));

test('random-angle constructors reproduce the original sequence', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 371], construct: false});
  const hooks = createRandomAngleHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const seedAddress = 7948176;
  const starts = [0, 1, 48271, 182605794, 2147483646];
  for (const start of starts) {
    for (const id of functionIds) {
      view.setUint32(seedAddress, start, true);
      const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
      const expected = runtime.call(id);
      const expectedMemory = Buffer.from(bytes);
      bytes.set(before);
      runtime.stackPointer.value = stack;
      const actual = hooks[id]();
      assert.equal(actual >>> 0, expected >>> 0, `${id}/${start}: object`);
      assert.ok(Buffer.from(bytes).equals(expectedMemory), `${id}/${start}: complete memory`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${start}: stack`);
      comparisons++;
    }
  }
});
