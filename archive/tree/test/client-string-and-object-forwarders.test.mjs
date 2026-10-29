import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringAndObjectForwarderHooks, functionIds} from '../source/game/client/string-and-object-forwarders.mjs';

let comparisons = 0;
after(() => console.log(
  `client string/object forwarder oracle comparisons: ${comparisons} total; zero records`));

const dependencies = [378, 459, 453, 673, 876, 921, 730, 533, 549, 679, 682, 678, 680, 1042, 1046, 718, 890, 647, 364];
const argumentsFor = {
  423: [0, 0], 471: [0, 0], 728: [0], 864: [0], 927: [0, 0, 0], 980: [0, 0],
  1133: [0, 0, 0], 1819: [0, 0], 1826: [0, 0], 1862: [0, 0, 0, 0, 0, 0],
  1939: [0, 0, 0, 0], 1942: [0, 0, 0, 0], 2008: [], 2315: [],
  2508: [0], 2510: [0], 2511: [0], 2513: [0], 2517: [0], 2520: [0],
  2524: [0], 2526: [0], 2528: [0], 2531: [0], 2542: [0], 2544: [0],
};

test('string and object forwarders match original results and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createStringAndObjectForwarderHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    memory.set(clean);
    const args = argumentsFor[id];
    let expected;
    let expectedError = null;
    try {
      expected = runtime.call(id, ...args);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    const stack = runtime.stackPointer.value;
    let actual;
    let actualError = null;
    try {
      actual = hooks[id](...args);
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
