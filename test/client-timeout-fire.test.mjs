import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import wabtFactory from 'wabt';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {
  createTimeoutFireHook, dependencyIds, functionIds,
} from '../source/game/client/timeout-fire.mjs';

const wabt = await wabtFactory();

const REGISTRY = {
  buckets: 7932796,
  capacity: 7932800,
  sentinel: 7932804,
  liveCount: 7932808,
  maxLoad: 7932812,
  initialized: 7932816,
};
const INVOKE_SLOT = 6;

let comparisons = 0;
after(() => console.log(
  `client fireTimeoutCallback oracle comparisons: ${comparisons} total; `
  + 'empty, absent, power-of-two, collisions, rehash, duplicate, self/normal callback, null trap, lazy init and OOB bucket'));

async function callbackObject(parameters, results, fn) {
  const types = parameters.map(type => `(param ${type})`).join(' ');
  const resultTypes = results.map(type => `(result ${type})`).join(' ');
  const parsed = wabt.parseWat('timeout-callback.wat',
    `(module(import "x" "f"(func $f ${types} ${resultTypes}))(export "f"(func $f)))`);
  try {
    return new WebAssembly.Instance(new WebAssembly.Module(parsed.toBinary({}).buffer), {
      x: {f: fn},
    }).exports.f;
  } finally {
    parsed.destroy();
  }
}

test('client fireTimeoutCallback 3278 matches the original', async () => {
  const runtime = await loadOriginal('client', {
    functionIds: [...functionIds, ...dependencyIds, 368], construct: true});
  const hook = createTimeoutFireHook(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const u32 = address => view.getUint32(address >>> 0, true);
  const set32 = (address, value) => view.setUint32(address >>> 0, value >>> 0, true);
  const allocate = size => runtime.call(368, size) >>> 0;
  assert.equal(hook[3278].length, runtime.exports.__fn3278.length);

  // One JS no-op is enough for every vtable slot exercised below.
  const noopSlot = runtime.table.length - 1;
  let invocations = 0;
  runtime.table.set(noopSlot, await callbackObject(['i32'], [], () => { invocations++; }));

  function makeCallback({self = false, vtable = 0, entry = 0} = {}) {
    const table = vtable || allocate(128);
    bytes.fill(0, table, table + 128);
    set32(table + INVOKE_SLOT * 4, noopSlot);
    set32(table + 5 * 4, noopSlot);
    set32(table + 4 * 4, noopSlot);
    if (self) {
      set32(entry, table);
      set32(entry + 16, entry);
      return entry;
    }
    const callback = allocate(32);
    set32(callback, table);
    set32(entry + 16, callback);
    return callback;
  }

  function makeEntry(callbackEnabled = true, self = false) {
    const entry = allocate(32);
    bytes.fill(0, entry, entry + 32);
    if (callbackEnabled) makeCallback({self, entry});
    return entry;
  }

  function makeNode(next, hash, id, entry) {
    const node = allocate(16);
    set32(node, next);
    set32(node + 4, hash);
    set32(node + 8, id);
    set32(node + 12, entry);
    return node;
  }

  function resetRegistry() {
    bytes.fill(0, REGISTRY.buckets, REGISTRY.initialized + 8);
  }

  function prepare({capacity = 4, guard = 1, lazy = false} = {}) {
    resetRegistry();
    if (lazy) return null;
    set32(REGISTRY.capacity, capacity);
    set32(REGISTRY.initialized, guard);
    const buckets = allocate(capacity * 4);
    set32(REGISTRY.buckets, buckets);
    for (let bucket = 0; bucket < capacity; bucket++)
      set32(buckets + bucket * 4, REGISTRY.sentinel);
    set32(REGISTRY.sentinel, 0);
    set32(REGISTRY.liveCount, 0);
    set32(REGISTRY.maxLoad, 0x3f800000);
    return buckets;
  }

  function run(id, setup, expectedInvocations = 0) {
    setup();
    invocations = 0;
    const before = Buffer.from(bytes);
    const stack = runtime.stackPointer.value;
    let expectedError, actualError;
    let expectedReturn, actualReturn;
    try { expectedReturn = runtime.call(3278, id); }
    catch (error) { expectedError = {name: error.constructor.name, message: error.message}; }
    const expectedMemory = Buffer.from(bytes);
    bytes.set(before);
    runtime.stackPointer.value = stack;
    try { actualReturn = hook[3278](id); }
    catch (error) { actualError = {name: error.constructor.name, message: error.message}; }
    assert.deepEqual(actualError, expectedError, `id ${id}: error`);
    assert.equal(actualReturn, expectedReturn, `id ${id}: return`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `id ${id}: complete memory`);
    assert.equal(runtime.stackPointer.value, stack, `id ${id}: stack`);
    assert.equal(invocations, expectedInvocations, `id ${id}: callback invocations`);
    comparisons++;
  }

  run(5, () => prepare());

  run(5, () => {
    prepare();
    return null;
  });

  run(4, () => {
    const buckets = prepare();
    const node = makeNode(0, 4, 4, makeEntry());
    set32(buckets, REGISTRY.sentinel);
    set32(REGISTRY.sentinel, node);
    set32(REGISTRY.liveCount, 1);
    return buckets;
  }, 4);

  run(9, () => {
    const buckets = prepare();
    const node9 = makeNode(0, 9, 9, makeEntry());
    const node5 = makeNode(node9, 5, 5, makeEntry());
    set32(buckets + 4, REGISTRY.sentinel);
    set32(REGISTRY.sentinel, node5);
    set32(REGISTRY.liveCount, 2);
    return buckets;
  }, 4);

  run(5, () => {
    const buckets = prepare();
    const node9 = makeNode(0, 9, 9, makeEntry());
    const node5 = makeNode(node9, 5, 5, makeEntry());
    set32(buckets + 4, REGISTRY.sentinel);
    set32(REGISTRY.sentinel, node5);
    set32(REGISTRY.liveCount, 2);
    return buckets;
  }, 4);

  run(5, () => {
    const buckets = prepare();
    const node6 = makeNode(0, 6, 6, makeEntry());
    const node5 = makeNode(node6, 5, 5, makeEntry());
    set32(buckets + 4, node5);
    set32(buckets + 8, node5);
    set32(REGISTRY.sentinel, node5);
    set32(REGISTRY.liveCount, 2);
    return buckets;
  });

  run(5, () => {
    const buckets = prepare();
    const duplicate = makeNode(0, 5, 5, makeEntry());
    const node9 = makeNode(duplicate, 9, 9, makeEntry());
    const node5 = makeNode(node9, 5, 5, makeEntry());
    set32(buckets + 4, REGISTRY.sentinel);
    set32(REGISTRY.sentinel, node5);
    set32(REGISTRY.liveCount, 3);
    return buckets;
  }, 4);

  run(7, () => {
    const buckets = prepare();
    const node = makeNode(0, 7, 7, makeEntry(true, true));
    set32(buckets + 12, REGISTRY.sentinel);
    set32(REGISTRY.sentinel, node);
    set32(REGISTRY.liveCount, 1);
    return buckets;
  }, 4);

  run(3, () => {
    const buckets = prepare();
    const node = makeNode(0, 3, 3, makeEntry(false));
    set32(buckets + 12, REGISTRY.sentinel);
    set32(REGISTRY.sentinel, node);
    set32(REGISTRY.liveCount, 1);
    return buckets;
  });

  run(5, () => {
    const buckets = prepare();
    set32(REGISTRY.buckets, 0x3ffffffe);
    set32(REGISTRY.liveCount, 1);
    return buckets;
  });

  run(5, () => prepare({lazy: true}));
});
