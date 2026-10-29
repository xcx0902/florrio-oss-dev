import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createComponentReleaseHook, functionIds} from '../source/game/server/component-release.mjs';

let comparisons = 0;
after(() => console.log(
  `server component release oracle comparisons: ${comparisons} total; both slot variants`));

test('component release matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 121, 14], construct: false});
  const hooks = createComponentReleaseHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);

  let caseIndex = 0;
  for (const id of functionIds) for (const linked of [false, true]) {
    const view = new DataView(runtime.memory.buffer);
    const record = 0xa80000 + caseIndex * 0x1000;
    caseIndex++;
    let node = 0;
    if (linked) {
      const host = runtime.call(121, 4096);
      memory.fill(0, host, host + 4096);
      node = runtime.call(121, 64);
      memory.fill(0, node, node + 64);
      view.setUint32(node, host, true);
      view.setUint32(host + 2140, 0x55, true);
    }
    view.setUint32(record - (id === 421 ? 8 : 96), node, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(id, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hooks[id](record);
    assert.equal(runtime.stackPointer.value, stack, `${id}/${linked}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${linked}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
