import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createPetalTooltipHook, functionIds, dependencyIds} from '../source/game/client/petal-tooltip.mjs';

let comparisons = 0;
after(() => console.log(
  `client petal-tooltip oracle comparisons: ${comparisons} total (1 trapping); `
  + 'all rarities, stat counts, invalid ids, cached entries and one OOB trap'));

const DEFINITIONS = 382064, STRIDE = 52, CACHE = 395248;
const NAME = 0x600000, STRINGS = 0x601000, DISPLAY = 0x700000, TRANSFORM = 0x701000;
const PETAL_ID = 10;

function writeCString(bytes, address, text) {
  const encoded = new TextEncoder().encode(text);
  bytes.set(encoded, address);
  bytes[address + encoded.length] = 0;
  return address;
}

test('renderPetalTooltip 623 matches the original', async () => {
  const runtime = await loadOriginal('client', {
    functionIds: [...functionIds, ...dependencyIds, 623], construct: false});
  const hook = createPetalTooltipHook(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  assert.equal(hook[623].length, runtime.exports.__fn623.length);
  const baseline = Buffer.from(bytes);
  const stackPointer = runtime.stackPointer.value;

  function prepare(snapshot, {petalId = PETAL_ID, rarity = 0, statCount = 0, cached = false, name = 'Stinger', displayCount = 0} = {}) {
    bytes.set(snapshot);
    runtime.stackPointer.value = stackPointer;
    if (!cached) {
      bytes.fill(0, CACHE + petalId * 1080, CACHE + petalId * 1080 + 1080);
      bytes.fill(0, DISPLAY, DISPLAY + 0x100);
      bytes.fill(0, TRANSFORM, TRANSFORM + 0x100);
    } else {
      bytes.fill(0, DISPLAY, DISPLAY + 0x100);
      bytes.fill(0, TRANSFORM, TRANSFORM + 0x100);
    }
    bytes[DISPLAY] = displayCount;
    const definition = DEFINITIONS + petalId * STRIDE;
    bytes.fill(0, definition, definition + STRIDE);
    writeCString(bytes, NAME, name);
    view.setUint32(definition, NAME, true);
    view.setUint8(definition + 4, statCount);
    view.setUint32(definition + 24, rarity, true);
    const labels = ['Damage: 10', 'Reload: 2s', 'Cooldown: 1s', 'Special: poison'];
    for (let index = 0; index < statCount; index++) {
      const address = STRINGS + index * 64;
      writeCString(bytes, address, labels[index]);
      view.setUint32(definition + 8 + index * 4, address, true);
    }
  }

  function invoke(implementation, petalId, p2 = 1.0, p4 = 1.0, p5 = 1.0) {
    try {
      implementation(DISPLAY, TRANSFORM, p2, petalId, p4, p5);
      return {error: null};
    } catch (error) {
      return {error: `${error.constructor.name}:${error.message}`};
    }
  }
  const invokeNative = (petalId, p2 = 1.0, p4 = 1.0, p5 = 1.0) => {
    try {
      runtime.call(623, DISPLAY, TRANSFORM, p2, petalId, p4, p5);
      return {error: null};
    } catch (error) {
      return {error: `${error.constructor.name}:${error.message}`};
    }
  };

  function compare(snapshot, options) {
    prepare(snapshot, options);
    const native = invokeNative(options.petalId ?? PETAL_ID, options.p2 ?? 1.0, options.p4 ?? 1.0, options.p5 ?? 1.0);
    const expectedMemory = Buffer.from(bytes);
    const expectedStack = runtime.stackPointer.value;
    prepare(snapshot, options);
    const actual = invoke(hook[623], options.petalId ?? PETAL_ID, options.p2 ?? 1.0, options.p4 ?? 1.0, options.p5 ?? 1.0);
    const label = options.petalId ?? PETAL_ID;
    assert.equal(actual.error, native.error, `id ${label}: error`);
    assert.equal(runtime.stackPointer.value, expectedStack, `id ${label}: stack`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `id ${label}: complete memory`);
    comparisons++;
  }

  // Uncached builds: every rarity and three stat counts.
  for (let rarity = 0; rarity <= 6; rarity++)
    for (const statCount of [0, 2, 4])
      compare(baseline, {rarity, statCount, name: `Petal-${rarity}-${statCount}`});

  // Invalid petal ids leave the tooltip untouched.
  for (const petalId of [-1, 0, 39, 255])
    compare(baseline, {petalId, rarity: 0, statCount: 0});

  // A non-empty display list forces 691 through the full layout path.
  compare(baseline, {rarity: 0, statCount: 2, displayCount: 1});
  compare(baseline, {rarity: 5, statCount: 1, p2: 0});
  compare(baseline, {rarity: 3, statCount: 1, p2: -1, p4: NaN, p5: Infinity});

  // Warm the cache once, then verify that later table changes are ignored.
  prepare(baseline, {rarity: 2, statCount: 2, name: 'Cached Petal'});
  runtime.call(623, DISPLAY, TRANSFORM, 1.0, PETAL_ID, 1.0, 1.0);
  const cached = Buffer.from(bytes);
  compare(cached, {rarity: 5, statCount: 4, cached: true, name: 'Changed'});
  compare(cached, {rarity: 0, statCount: 0, cached: true, name: 'Other'});
  prepare(cached, {rarity: 1, statCount: 1, cached: true, name: 'Dirty'});
  view.setUint8(CACHE + PETAL_ID * 1080 + 8 + 136, 1);
  const dirty = Buffer.from(bytes);
  compare(dirty, {rarity: 4, statCount: 3, cached: true, name: 'Dirty'});

  // A display-list pointer outside linear memory traps in native 691.
  prepare(baseline, {rarity: 0, statCount: 1});
  let expectedError = null;
  try { runtime.call(623, 0xffffff00, TRANSFORM, 1.0, PETAL_ID, 1.0, 1.0); }
  catch (error) { expectedError = `${error.constructor.name}:${error.message}`; }
  assert.notEqual(expectedError, null, 'native OOB trap');
  const expectedTrapMemory = Buffer.from(bytes);
  const expectedTrapStack = runtime.stackPointer.value;
  prepare(baseline, {rarity: 0, statCount: 1});
  let actualError = null;
  try { hook[623](0xffffff00, TRANSFORM, 1.0, PETAL_ID, 1.0, 1.0); }
  catch (error) { actualError = `${error.constructor.name}:${error.message}`; }
  assert.equal(actualError, expectedError, 'out-of-bounds display list: error');
  assert.equal(runtime.stackPointer.value, expectedTrapStack, 'out-of-bounds display list: stack');
  assert.ok(Buffer.from(bytes).equals(expectedTrapMemory), 'out-of-bounds display list: memory');
  comparisons++;
});
