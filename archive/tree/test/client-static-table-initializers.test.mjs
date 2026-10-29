import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStaticTableInitializerHooks, functionIds} from '../source/game/client/static-table-initializers.mjs';

let comparisons = 0;
after(() => console.log(
  `client static table initializer oracle comparisons: ${comparisons} total; flag states`));

const dependencies = [369, 370, 389, 396, 397];
const guards = {
  1840: [7945984, 7947112], 1841: [7945968, 7946768], 1842: [7945952, 7946296],
  1856: [7945992, 7947144], 1857: [7945976, 7947072], 1858: [7945960, 7946472],
};

test('static table initializers match original results and flags', async () => {
  const native = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const recovered = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createStaticTableInitializerHooks(recovered);
  const cleanNative = Buffer.from(new Uint8Array(native.memory.buffer));
  const cleanRecovered = Buffer.from(new Uint8Array(recovered.memory.buffer));

  for (const id of functionIds) {
    for (const flag of [0, 1]) {
      new Uint8Array(native.memory.buffer).set(cleanNative);
      new Uint8Array(recovered.memory.buffer).set(cleanRecovered);
      new DataView(native.memory.buffer).setUint8(guards[id][0], flag);
      new DataView(recovered.memory.buffer).setUint8(guards[id][0], flag);
      const expected = native.call(id, 0);
      const actual = hooks[id](0);
      assert.equal(actual, expected, `${id}/${flag}: result`);
      assert.equal(new DataView(recovered.memory.buffer).getUint8(guards[id][0]),
        new DataView(native.memory.buffer).getUint8(guards[id][0]), `${id}/${flag}: outer flag`);
      assert.equal(new DataView(recovered.memory.buffer).getUint8(guards[id][1]),
        new DataView(native.memory.buffer).getUint8(guards[id][1]), `${id}/${flag}: inner flag`);
      comparisons++;
    }
  }
  assert.equal(comparisons, functionIds.length * 2);
});
