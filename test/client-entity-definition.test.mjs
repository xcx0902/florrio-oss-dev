import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createEntityDefinitionHooks} from '../source/game/client/entity-definition.mjs';

let comparisons = 0, trapComparisons = 0;
let catalogComparisons = 0, catalogTrapComparisons = 0;
after(() => console.log(
  `entity-definition oracle comparisons: ${comparisons + catalogComparisons} total ` +
  `(${comparisons} for 441, ${catalogComparisons} for 391), ` +
  `${trapComparisons + catalogTrapComparisons} trapping`));

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds: [441], construct: false});
  runtime.instance.exports.Nf();
  const initialize = createEntityDefinitionHooks(runtime)[441];
  const bytes = new Uint8Array(runtime.memory.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  function compare(args, label) {
    const before = Buffer.from(bytes);
    const expected = invoke(() => runtime.call(441, ...args));
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    const actual = invoke(() => initialize(...args));
    assert.deepEqual(actual, expected, `${label}: outcome`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${label}: complete memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    if (expected.error) trapComparisons++;
    comparisons++;
  }
  return {runtime, bytes, compare};
}

test('initializeEntityDefinition441 writes every field and both packed arrays', async () => {
  const o = await oracle(), view = new DataView(o.bytes.buffer);
  o.bytes.fill(0xa5);
  const destination = 8192, description = 16384, entries = 12288;
  // A description-pointer array with all 256 lengths, followed by byte counters.
  for (let count = 0; count <= 255; count++) {
    const source = description + count * 4;
    view.setUint32(description, 0x11110000 + count, true);
    view.setBigUint64(32768, BigInt(source) | BigInt(count) << 32n, true);
    view.setUint8(entries, count);
    for (let index = 0; index < count; index++)
      view.setBigUint64(entries + 4 + index * 8, 0x0102030405060708n + BigInt(index) + BigInt(count), true);
    for (let index = 0; index < count; index++)
      view.setUint32(source + index * 4, 0xc0000000 + count * 256 + index, true);
    o.compare([destination, 0x90000000 + count, 32768, count * 7 - 3, count / 8 - 2, entries,
      0x70000000 + count, 0x78000000 + count], `count ${count}`);
    if (count % 37 === 0) view.setUint32(destination + 100, 0xdeadbeef, true);
  }
});

test('initializeEntityDefinition441 preserves the exact f32 scale and callback stores', async () => {
  const o = await oracle(), view = new DataView(o.bytes.buffer);
  const destination = 512, description = 2048, entries = 4096;
  view.setBigUint64(description, 0n, true);
  view.setUint8(entries, 0);
  for (const scale of [0, -0, 1, -1, 2.5, 1e-45, 3.4028234663852886e38, Infinity, -Infinity, NaN, undefined]) {
    o.compare([destination, -1, description, -1, scale, entries, -1, -2], `scale ${scale}`);
  }
});

test('initializeEntityDefinition441 preserves forward overlap and rereads the entry count', async () => {
  const o = await oracle(), view = new DataView(o.bytes.buffer);
  const cases = [
    // destination and description array overlap; each dword read precedes its write.
    [8192, 8192, 8192, 0, 1, 9000, 1, 2],
    [9000, 8192, 8992, 0, 1, 9500, 1, 2],
    [9500, 8192, 9480, 0, 1, 9500, 1, 2],
    // entry array starts inside the record; later reads see earlier stores.
    [8192, 8192, 8192, 7, 2.5, 8200, 3, 4],
    [8192, 8192, 8192, 7, 2.5, 8000, 3, 4],
    [8192, 8192, 8192, 7, 2.5, 8320, 3, 4],
    // +32 lies inside the entry array, so the final count is reread from p5.
    [8192, 8192, 8192, 7, 2.5, 8160, 3, 4],
  ];
  for (const args of cases) {
    o.bytes.fill(0x3c, Math.min(...args.slice(0, 1)) - 256, 10240);
    const [p0, , , , , p5] = args;
    for (let index = 0; index < 40; index++)
      view.setBigUint64((p5 + 4 + index * 8) >>> 0, 0x1122334455667788n + BigInt(index), true);
    view.setUint8(p5, 20);
    view.setBigUint64(8192, 0x0000000280002000n, true);
    o.compare(args, `overlap ${args.join('/')}`);
  }
});

test('initializeEntityDefinition441 traps at the first inaccessible read or write', async () => {
  const o = await oracle(), limit = o.bytes.length, view = new DataView(o.bytes.buffer);
  view.setBigUint64(4096, 0x0000000111110000n, true);
  view.setUint8(8192, 1);
  const cases = [
    [limit - 4, 1, 4096, 0, 0, 8192, 0, 0],
    [limit - 5, 1, 4096, 0, 0, 8192, 0, 0],
    [8192, 1, limit - 8, 0, 0, 8192, 0, 0],
    [8192, 1, limit - 4, 0, 0, 8192, 0, 0],
    [8192, 1, 4096, 0, 0, limit - 1, 0, 0],
    [8192, 1, 4096, 0, 0, limit, 0, 0],
    [8192, 1, 4096, 0, 0, limit - 4, 0, 0],
    [limit - 116, 1, limit - 8, 0, 0, limit - 1, 0, 0],
    [-1, 1, -8, 0, 0, -1, 0, 0],
    [4096, 1, -8, 0, 0, 0xffffffff, 0, 0],
    [0xffffffff, 1, 4096, 0, 0, 8192, 0, 0],
  ];
  for (const args of cases) o.compare(args, `boundary ${args.join('/')}`);
});


const CATALOG_START = 384000;
const CATALOG_END = 387000;
const GUARD = 386764;
const invoke = call => {
  try { return {result: call()}; }
  catch (error) { return {error: [error.constructor.name, error.message]}; }
};

async function catalogOracle() {
  const runtime = await loadOriginal('client', {functionIds: [391], construct: false});
  runtime.instance.exports.Nf();
  const getDefinition = createEntityDefinitionHooks(runtime)[391];
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);

  function compare(args, label, {full = false} = {}) {
    const entryStack = runtime.stackPointer.value;
    const beforeCatalog = Buffer.from(bytes.subarray(CATALOG_START, CATALOG_END));
    const beforeGuard = Buffer.from(bytes.subarray(GUARD, GUARD + 2));
    const beforeFull = full ? Buffer.from(bytes) : undefined;

    const expected = invoke(() => runtime.call(391, ...args));
    const expectedCatalog = Buffer.from(bytes.subarray(CATALOG_START, CATALOG_END));
    const expectedGuard = Buffer.from(bytes.subarray(GUARD, GUARD + 2));
    const expectedStack = runtime.stackPointer.value;
    const expectedFull = full ? Buffer.from(bytes) : undefined;

    if (full) bytes.set(beforeFull);
    else {
      bytes.set(beforeCatalog, CATALOG_START);
      bytes.set(beforeGuard, GUARD);
    }
    runtime.stackPointer.value = entryStack;

    const actual = invoke(() => getDefinition(...args));
    assert.deepEqual(actual, expected, `${label}: outcome`);
    assert.ok(Buffer.from(bytes.subarray(CATALOG_START, CATALOG_END)).equals(expectedCatalog),
      `${label}: catalog bytes`);
    assert.ok(Buffer.from(bytes.subarray(GUARD, GUARD + 2)).equals(expectedGuard), `${label}: guard`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);

    if (full) {
      const actualFull = Buffer.from(bytes);
      for (let address = 0; address < actualFull.length; address++)
        assert.equal(actualFull[address], expectedFull[address],
          `${label}: complete memory at ${address}`);
    }
    if (expected.error) catalogTrapComparisons++;
    catalogComparisons++;
  }
  return {runtime, bytes, view, compare};
}

test('getEntityDefinition391 initializes all 23 records and every lookup pointer', async () => {
  const o = await catalogOracle();
  for (const type of [...Array(23).keys(), 23, 255, 256, 257, 277, 278, 279]) {
    o.bytes.fill((0x5a + type) & 255, CATALOG_START, CATALOG_END);
    o.bytes[GUARD] = 0;
    o.bytes[GUARD + 1] = 0;
    o.compare([type], `type ${type}`);
  }
});

test('getEntityDefinition391 reproduces all record bytes, including copy-path tails', async () => {
  const o = await catalogOracle();
  o.bytes.fill(0x5a, CATALOG_START, CATALOG_END);
  o.bytes[GUARD] = 0;
  o.bytes[GUARD + 1] = 0;
  // Full linear-memory equality, including the original dead argument frame
  // and the nested one-time guard frames.
  o.compare([1], 'full initialization', {full: true});

  o.bytes.fill(0x5a, CATALOG_START, CATALOG_END);
  o.bytes[GUARD] = 0;
  o.bytes[GUARD + 1] = 0;
  o.compare([22], 'prefilled record tails');
  // Types 5, 14, 16, 18 and 21 arrive through the 116-byte record copy
  // constructor, which writes the complete tail byte 111; the others leave it.
  for (const type of [5, 14, 16, 18, 21])
    assert.equal(o.bytes[384096 + type * 116 + 111], 0, `type ${type} copy-path tail`);
  assert.equal(o.bytes[384096 + 16 * 116 + 108], 0x00, 'type 16 flags low byte');
  assert.equal(o.bytes[384096 + 16 * 116 + 109], 0x0f, 'type 16 flags high byte');
  assert.equal(o.bytes[384096 + 16 * 116 + 110], 0x0f, 'type 16 marker');
  assert.equal(o.bytes[384096 + 18 * 116 + 108], 0x00, 'type 18 flags low byte');
  assert.equal(o.bytes[384096 + 18 * 116 + 109], 0x11, 'type 18 flags high byte');
  assert.equal(o.bytes[384096 + 18 * 116 + 110], 0x11, 'type 18 marker');
});

test('getEntityDefinition391 preserves the one-time guard state machine', async () => {
  const o = await catalogOracle();
  o.bytes.fill(0x33, CATALOG_START, CATALOG_END);
  for (const [flag, state] of [[1, 0], [2, 0], [3, 0], [0x80, 0], [0xff, 0],
    [0, 1], [0, 4], [0, 0x80], [0, 2], [0, 3], [0, 6], [0, 0xff]]) {
    o.bytes[GUARD] = flag;
    o.bytes[GUARD + 1] = state;
    o.compare([1], `guard ${flag}/${state}`);
  }

  // Committed guard: an edited record must survive later lookups.
  o.bytes[GUARD] = 1;
  o.bytes[GUARD + 1] = 1;
  o.view.setUint32(384096, 0xdeadbeef, true);
  o.compare([1], 'committed guard leaves an edited record alone');
});

test('getEntityDefinition391 maps wrapped type values with native index arithmetic', async () => {
  const o = await catalogOracle();
  o.bytes[GUARD] = 1;
  o.bytes[GUARD + 1] = 1;
  for (const type of [0, 1, 22, 23, 255, 256, 257, 258, 260, 277, 278, 279, 280,
    -1, -22, -23, -256, 0x7fffffff, -0x80000000, 0x10000001, -1 >>> 0])
    o.compare([type], `wrapped type ${type}`);
});
