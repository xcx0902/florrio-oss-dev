import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createTimeConverterHooks, functionIds} from '../source/game/client/time-converters.mjs';

let comparisons = 0;
after(() => console.log(
  `client time converter oracle comparisons: ${comparisons} total; year and flag variants`));

test('time converters match original result and memory', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 500, 501], construct: false});
  const hooks = createTimeConverterHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0xce0000;
  const flags = 0xce1000;

  for (const id of functionIds) {
    for (const year of [50, 80, 150]) {
      for (const flag of [0, 4]) {
        memory.set(clean);
        memory[flags] = flag;
        let expected;
        let expectedError = null;
        try {
          expected = runtime.call(id, destination, year, 0, flags, 0);
        } catch (error) {
          expectedError = error;
        }
        const expectedMemory = Buffer.from(memory);
        memory.set(clean);
        memory[flags] = flag;
        let actual;
        let actualError = null;
        try {
          actual = hooks[id](destination, year, 0, flags, 0);
        } catch (error) {
          actualError = error;
        }
        assert.equal(actualError !== null, expectedError !== null, `${id}/${year}/${flag}: trap`);
        if (actualError === null) assert.equal(actual, expected, `${id}/${year}/${flag}: result`);
        assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${year}/${flag}: memory`);
        comparisons++;
      }
    }
  }
  assert.equal(comparisons, 12);
});
