import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStaticInitializerGuardHooks, functionIds} from '../source/game/client/static-initializer-guards.mjs';

let comparisons = 0;
after(() => console.log(
  `client static initializer guard oracle comparisons: ${comparisons} total; both flag states`));

const dependencies = [369, 370, 552, 521];
const guards = {
  1833: 7946040, 1835: 7946008, 1837: 7946104, 1839: 7946072,
  1848: 7946056, 1850: 7946024, 1852: 7946120, 1855: 7946088,
};

test('static initializer guards match original in both flag states', async () => {
  const native = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const recovered = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createStaticInitializerGuardHooks(recovered);
  const cleanNative = Buffer.from(new Uint8Array(native.memory.buffer));
  const cleanRecovered = Buffer.from(new Uint8Array(recovered.memory.buffer));

  for (const id of functionIds) {
    if (id === 629) {
      for (const flag of [0, 1]) {
        new Uint8Array(native.memory.buffer).set(cleanNative);
        new Uint8Array(recovered.memory.buffer).set(cleanRecovered);
        new DataView(native.memory.buffer).setUint8(151560, flag);
        new DataView(recovered.memory.buffer).setUint8(151560, flag);
        const expected = native.call(629, 0);
        const actual = hooks[629](0);
        assert.equal(actual, expected, `629/${flag}: result`);
        assert.equal(new DataView(recovered.memory.buffer).getUint8(151560),
          new DataView(native.memory.buffer).getUint8(151560), `629/${flag}: flag`);
        comparisons++;
      }
      continue;
    }
    for (const flag of [0, 1]) {
      new Uint8Array(native.memory.buffer).set(cleanNative);
      new Uint8Array(recovered.memory.buffer).set(cleanRecovered);
      new DataView(native.memory.buffer).setUint8(guards[id], flag);
      new DataView(recovered.memory.buffer).setUint8(guards[id], flag);
      const expected = native.call(id, 0);
      const actual = hooks[id](0);
      assert.equal(actual, expected, `${id}/${flag}: result`);
      assert.equal(new DataView(recovered.memory.buffer).getUint8(guards[id]),
        new DataView(native.memory.buffer).getUint8(guards[id]), `${id}/${flag}: flag`);
      comparisons++;
    }
  }
  assert.equal(comparisons, functionIds.length * 2);
});
