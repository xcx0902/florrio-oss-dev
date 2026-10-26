import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLifecycleHelperHooks, functionIds, dependencyIds} from '../source/game/server/lifecycle-helpers.mjs';

let comparisons = 0;
after(() => console.log(
  `server lifecycle-helper oracle comparisons: ${comparisons} total (0 trapping); `
  + 'small-string flag variants and default-true predicate'));

test('destroyLocalServerString 653 and returnTrue 117 match the original', async () => {
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, ...dependencyIds], construct: false});
  const hooks = createLifecycleHelperHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  assert.equal(hooks[653].length, runtime.exports.__fn653.length);
  assert.equal(hooks[117].length, runtime.exports.__fn117.length);
  assert.equal(hooks[117](0), runtime.call(117, 0));
  comparisons++;

  for (const flag of [0, 0x01, 0x7f, 0x80, 0xff]) {
    const block = runtime.call(16, 24) >>> 0;
    assert.notEqual(block, 0, 'malloc');
    bytes.fill(0x5a, block, block + 24);
    view.setUint32(8559264, block, true);
    view.setUint8(8559275, flag);
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    runtime.call(653);
    const expectedMemory = Buffer.from(bytes);
    bytes.set(before);
    runtime.stackPointer.value = stack;
    hooks[653]();
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `flag ${flag}: complete memory`);
    assert.equal(runtime.stackPointer.value, stack, `flag ${flag}: stack`);
    comparisons++;
  }
});
