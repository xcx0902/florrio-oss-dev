import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSort3AndStateHooks, functionIds} from '../source/game/server/sort3-and-state-helpers.mjs';

let comparisons = 0;
after(() => console.log(
  `server sort3/state oracle comparisons: ${comparisons} total; networks, decimals and stream states`));

test('sort-three, decimal and stream-state helpers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createSort3AndStateHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const base = 0x660000;
  const values = [0n, 1n, 9n, 10n, 99n, 4294967295n, 4294967296n, 1234567890123n,
    18446744073709551615n, 10000000000000000000n];

  const permutations = [[3, 1, 2], [1, 2, 3], [3, 2, 1], [2, 1, 3], [1, 3, 2], [2, 3, 1]];

  for (let trial = 0; trial < permutations.length; trial++) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    for (let index = 0; index < 3; index++) view.setUint32(base + index * 4, permutations[trial][index], true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(137, base, base + 4, base + 8);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hooks[137](base, base + 4, base + 8);
    assert.equal(actual, expected, `137/${trial}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `137/${trial}: memory`);
    comparisons++;
  }

  for (const value of values) {
    memory.set(clean);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(138, value, base + 0x100);
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    runtime.stackPointer.value = stack;
    const actual = hooks[138](value, base + 0x100);
    assert.equal(actual, expected, `138/${value}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `138/${value}: memory`);
    comparisons++;
  }

  let state = 0x77889900;
  for (let trial = 0; trial < 24; trial++) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const match = trial % 2 === 0;
    view.setUint32(base + 4, 5, true);
    view.setUint32(base + 16, match ? 7 : 9, true);
    view.setUint32(base + 24, trial % 3 === 0 ? 2 : 1, true);
    view.setUint32(base + 36, trial, true);
    view.setUint32(base + 48, trial % 5 === 0 ? 1 : 0, true);
    const args = [base, match ? 7 : 8, 5, trial % 4];
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(222, ...args);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hooks[222](...args);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `222/${trial}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 30);
});
