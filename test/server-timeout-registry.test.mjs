import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createTimeoutRegistryHook, functionIds, dependencyIds} from '../source/game/server/timeout-registry.mjs';

let comparisons = 0;
after(() => console.log(
  `server timeout-registry oracle comparisons: ${comparisons} total (0 trapping); `
  + 'empty list, callback-free nodes, dispatched callbacks and auxiliary block'));

const LIST_HEAD = 8569340, AUXILIARY = 8569332, SAFE = 0x200000;

test('destroyTimeoutRegistry 658 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, ...dependencyIds, 16, 270], construct: false});
  const hook = createTimeoutRegistryHook(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  let safeIndex = -1;
  const noop = runtime.exports.__fn270;
  for (let index = 0; index < runtime.table.length; index++)
    if (runtime.table.get(index) === noop) { safeIndex = index; break; }
  assert.notEqual(safeIndex, -1, 'noop in table');
  assert.equal(hook[658].length, runtime.exports.__fn658.length);

  const configurations = [0, 1, 2, 3];
  for (const configuration of configurations) {
    bytes.fill(0, SAFE, SAFE + 0x1000);
    view.setUint32(SAFE + 0x100, 0, true);
    view.setUint32(SAFE + 0x114, safeIndex, true);
    const allocate = () => runtime.call(16, 64) >>> 0;
    const nodes = [];
    const count = configuration === 0 ? 0 : configuration === 3 ? 3 : 2;
    for (let index = 0; index < count; index++) nodes.push(allocate());
    for (let index = 0; index < nodes.length; index++) {
      view.setUint32(nodes[index], nodes[index + 1] ?? 0, true);
      const withCallback = configuration === 2 || (configuration === 3 && index === 1);
      if (withCallback) {
        const callback = allocate();
        view.setUint32(callback, SAFE + 0x100, true);
        view.setUint32(nodes[index] + 12, callback, true);
      } else {
        view.setUint32(nodes[index] + 12, 0, true);
      }
    }
    const auxiliary = configuration === 3 ? allocate() : 0;
    view.setUint32(LIST_HEAD, nodes[0] ?? 0, true);
    view.setUint32(AUXILIARY, auxiliary, true);
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    runtime.call(658, 0);
    const expectedMemory = Buffer.from(bytes);
    bytes.set(before);
    runtime.stackPointer.value = stack;
    hook[658](0);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `configuration ${configuration}: complete memory`);
    assert.equal(runtime.stackPointer.value, stack, `configuration ${configuration}: stack`);
    comparisons++;
  }
});
