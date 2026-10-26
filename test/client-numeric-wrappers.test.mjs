import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createNumericWrapperHooks, functionIds} from '../source/game/client/numeric-wrappers.mjs';

let comparisons = 0;
after(() => console.log(
  `client numeric wrapper oracle comparisons: ${comparisons} total; full and non-stack memory`));

test('numeric wrappers match original result and memory', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 457, 513], construct: false});
  const hooks = createNumericWrapperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0xd20000;

  memory.set(clean);
  const start = runtime.stackPointer.value;
  let expected;
  let expectedError1891 = null;
  try {
    expected = runtime.call(1891, 0, 0, 0, 0, 0, 0);
  } catch (error) {
    expectedError1891 = error;
  }
  const expectedMemory1891 = Buffer.from(memory);
  memory.set(clean);
  let actual;
  let actualError1891 = null;
  try {
    actual = hooks[1891](0, 0, 0, 0, 0, 0);
  } catch (error) {
    actualError1891 = error;
  }
  assert.equal(actualError1891 !== null, expectedError1891 !== null, '1891: trap');
  if (actualError1891 === null) assert.equal(actual, expected, '1891: result');
  const bytes = Buffer.from(memory);
  const low = Math.max(0, start - 256);
  const high = Math.min(bytes.length, start + 256);
  assert.ok(bytes.subarray(0, low).equals(expectedMemory1891.subarray(0, low)), '1891: low memory');
  assert.ok(bytes.subarray(high).equals(expectedMemory1891.subarray(high)), '1891: high memory');
  comparisons++;
  assert.equal(comparisons, 1);
});
