import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createTypeCheckHook, functionIds} from '../source/game/server/type-check.mjs';

let comparisons = 0;
after(() => console.log(
  `server type predicate oracle comparisons: ${comparisons} total; nested type values`));

test('type predicate matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createTypeCheckHook(runtime)[731];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0x840000;
  const nested = 0x841000;

  for (const kind of ['none', 'type0', 'type22', 'type255']) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(record + 148, kind === 'none' ? 0 : nested, true);
    view.setUint8(nested + 8, kind === 'type0' ? 0 : kind === 'type22' ? 22 : 255);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(731, 0, record);
    const actual = hook(0, record);
    assert.equal(actual, expected, `${kind}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${kind}: stack`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
