import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLocaleFacetReleaseHook, functionIds} from '../source/game/server/locale-facet-release.mjs';

let comparisons = 0;
after(() => console.log(
  `server locale facet release oracle comparisons: ${comparisons} total; shared, owned and null facets`));

test('locale facet release matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 33, 355, 121, 14], construct: false});
  const hooks = createLocaleFacetReleaseHook(runtime);
  const hook = hooks[225];
  const hook301 = hooks[301];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0x820000;

  for (const kind of ['null', 'shared', 'owned']) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    const facet = kind === 'null' ? 0 : kind === 'shared' ? runtime.call(33) : runtime.call(121, 4);
    view.setUint32(record + 8, facet, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(225, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(record);
    assert.equal(actual, expected, `${kind}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${kind}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${kind}: memory`);
    comparisons++;
  }

  for (const kind of ['null', 'shared', 'owned']) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    const record = runtime.call(121, 64);
    const facet = kind === 'null' ? 0 : kind === 'shared' ? runtime.call(33) : runtime.call(121, 4);
    view.setUint32(record + 8, facet, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(301, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hook301(record);
    assert.equal(runtime.stackPointer.value, stack, `301/${kind}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `301/${kind}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 6);
});
