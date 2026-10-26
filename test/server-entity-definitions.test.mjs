import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {
  createEntityDefinitionHook,
  dependencyIds,
  functionIds,
} from '../source/game/server/entity-definitions.mjs';

let comparisons = 0;
after(() => console.log(
  `server entity-definition oracle comparisons: ${comparisons} total; `
  + 'cold catalog construction, warm lookups, aliases and invalid ids'));

const CATALOG_IDS = Array.from({length: 23}, (_, index) => index + 1);
const ALIAS_IDS = CATALOG_IDS.map(id => id + 256);
const INVALID_IDS = [
  0, 23, 24, 255, 256, 279, 280, 511, 535, -1, -2, -23, -256,
  0x7fffffff, 0x80000000,
];
const MEMORY_BYTES = 64 * 1024 * 1024;

function snapshot(runtime) {
  return {
    memory: Buffer.from(new Uint8Array(runtime.memory.buffer)),
    stack: runtime.stackPointer.value,
  };
}

function restore(runtime, image) {
  new Uint8Array(runtime.memory.buffer).set(image.memory);
  runtime.stackPointer.value = image.stack;
}

function compare(runtime, expected, actual, label) {
  assert.equal(actual.result, expected.result, `${label}: result`);
  assert.equal(actual.stack, expected.stack, `${label}: stack pointer`);
  const memory = new Uint8Array(runtime.memory.buffer);
  assert.ok(Buffer.from(memory).equals(expected.memory), `${label}: complete memory`);
  comparisons++;
}

test('getEntityDefinition 103 cold and warm behaviour matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, ...dependencyIds],
    construct: false,
  });
  const hook = createEntityDefinitionHook(runtime);
  assert.equal(hook[103].length, runtime.exports.__fn103.length);

  const pristine = snapshot(runtime);
  assert.equal(new Uint8Array(runtime.memory.buffer)[8551036] & 1, 0,
    'guard must start clear');

  // Cold path: the first lookup on any id builds the whole catalog, including
  // the 2192-byte descriptor frame left behind by the original.
  for (const id of [0, 1, 23, 257]) {
    restore(runtime, pristine);
    const expectedResult = runtime.call(103, id);
    const expected = {
      result: expectedResult,
      stack: runtime.stackPointer.value,
      memory: Buffer.from(new Uint8Array(runtime.memory.buffer)),
    };
    restore(runtime, pristine);
    const actualResult = hook[103](id);
    compare(runtime, expected, {
      result: actualResult,
      stack: runtime.stackPointer.value,
      memory: Buffer.from(new Uint8Array(runtime.memory.buffer)),
    }, `cold id ${id}`);
    assert.equal(new Uint8Array(runtime.memory.buffer)[8551036] & 1, 1,
      `cold id ${id}: guard marked complete`);
  }

  // Build once through the hook, then compare every warm lookup against the
  // original from exactly the same post-initialisation image.
  restore(runtime, pristine);
  hook[103](1);
  const warm = snapshot(runtime);
  assert.equal(new Uint8Array(warm.memory)[8551036] & 1, 1);

  for (const id of [...CATALOG_IDS, ...ALIAS_IDS, ...INVALID_IDS]) {
    restore(runtime, warm);
    const expected = {
      result: runtime.call(103, id),
      stack: runtime.stackPointer.value,
      memory: Buffer.from(new Uint8Array(runtime.memory.buffer)),
    };
    restore(runtime, warm);
    const actual = {
      result: hook[103](id),
      stack: runtime.stackPointer.value,
      memory: Buffer.from(new Uint8Array(runtime.memory.buffer)),
    };
    compare(runtime, expected, actual, `warm id ${id}`);
  }
});
