import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFixedAddressForwarderHooks, functionIds} from '../source/game/client/fixed-address-forwarders.mjs';

let comparisons = 0;
after(() => console.log(
  `client fixed-address forwarder oracle comparisons: ${comparisons} total; fixed addresses`));

const dependencies = [377, 381, 413, 552, 564];

test('fixed-address forwarders match original calls', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createFixedAddressForwarderHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    memory.set(clean);
    let expected;
    let expectedError = null;
    try {
      expected = runtime.call(id, 0);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    const stack = runtime.stackPointer.value;
    let actual;
    let actualError = null;
    try {
      actual = hooks[id](0);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    if (actualError === null) assert.equal(actual, expected, `${id}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.equal(comparisons, functionIds.length);
});
