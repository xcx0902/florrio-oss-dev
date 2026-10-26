import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSpawnComponentHooks, functionIds} from '../source/game/server/spawn-components.mjs';

let comparisons = 0;
after(() => console.log(
  `server spawn-component oracle comparisons: ${comparisons} total; `
  + 'active-vector growth, cache clearing and stamp tables'));

test('spawn component publication 266 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [266, 16, 15, 14], construct: false});
  const hook = createSpawnComponentHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const world = 0x500000;
  const entity = 0x510000;
  const cell = 7;
  assert.equal(hook[266].length, runtime.exports.__fn266.length);

  function setupVector(size, capacity) {
    memory.fill(0x6a, world, world + 0x3000);
    view.setUint32(world + 2140, 0x12345678, true);
    view.setUint32(world + 1164, size, true);
    view.setUint32(world + 1168, capacity, true);
    let data = 0;
    view.setUint32(world + 1172, 0, true);
    if (capacity !== 0) {
      data = runtime.call(16, capacity * 4) >>> 0;
      memory.fill(0x21, data, data + capacity * 4);
      view.setUint32(world + 1172, data, true);
    }
    return data;
  }

  for (const [size, capacity] of [[0, 0], [1, 1], [3, 4], [7, 8], [16, 16], [1023, 1024], [1024, 1024], [0, 1024], [5, 128], [99, 256], [255, 512], [4096, 4096]]) {
    for (const withCaches of [false, true]) {
      memory.fill(0x55, entity, entity + 512);
      view.setUint32(entity, world, true);
      view.setUint32(entity + 16, cell | (2 << 14), true);
      view.setUint8(entity + 94, 0x11);
      view.setUint32(entity + 400, 0xaaaaaaaa, true);
      view.setUint32(entity + 404, 0xbbbbbbbb, true);
      const data = setupVector(size, capacity);
      for (let i = 0; i < size; i++) view.setUint32(data + i * 4, 0x7000 + i, true);
      if (withCaches) {
        for (const table of [264876, 264880]) {
          const record = runtime.call(16, 32) >>> 0;
          memory.fill(0x99, record, record + 32);
          const inner = runtime.call(16, 16) >>> 0;
          view.setUint32(record + 12, inner, true);
          view.setUint32(world + table + cell * 8, record, true);
        }
      } else {
        view.setUint32(world + 264876 + cell * 8, 0, true);
        view.setUint32(world + 264880 + cell * 8, 0, true);
      }
      const before = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      runtime.call(266, entity, 0x600000 + size);
      const expected = Buffer.from(memory);
      memory.set(before);
      runtime.stackPointer.value = stack;
      hook[266](entity, 0x600000 + size);
      assert.ok(Buffer.from(memory).equals(expected),
        `${size}/${capacity}/${withCaches}: memory`);
      assert.equal(runtime.stackPointer.value, stack, `${size}: stack`);
      comparisons++;
    }
  }
});

test('entity string assignment 265 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [265, 16, 15, 14], construct: false});
  const hook = createSpawnComponentHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const slot = 0x520000;
  const target = slot + 8;
  const source = 0x530000;
  const world = 0x500000;
  const entity = 0x510000;
  const cell = 9;
  assert.equal(hook[265].length, runtime.exports.__fn265.length);

  function writeInline(address, text) {
    view.setBigUint64(address, 0n, true);
    view.setUint32(address + 8, 0, true);
    for (let i = 0; i < text.length; i++) view.setUint8(address + i, text[i]);
    view.setUint8(address + 11, text.length);
  }
  function writeHeap(address, text) {
    const data = runtime.call(16, text.length + 1) >>> 0;
    for (let i = 0; i < text.length; i++) view.setUint8(data + i, text[i]);
    view.setUint8(data + text.length, 0);
    view.setUint32(address, data, true);
    view.setUint32(address + 4, text.length, true);
    view.setUint32(address + 8, text.length + 1, true);
    view.setUint8(address + 11, 0x80);
  }
  function resetGlobals(preload) {
    memory.fill(0, 8551040, 8551072);
    memory.fill(0, 8555152, 8555184);
    if (!preload) return;
    for (const cache of [[8551040, 8551052], [8555152, 8555164]]) {
      const data = runtime.call(16, 64) >>> 0;
      memory.fill(0x33, data, data + 64);
      view.setUint32(cache[0] + 4, 3, true);
      view.setUint32(cache[0] + 8, 64, true);
      view.setUint32(cache[1], data, true);
    }
  }
  function scenario(name, targetKind, targetText, sourceKind, sourceText, preload) {
    memory.fill(0, slot, slot + 64);
    memory.fill(0, source, source + 64);
    memory.fill(0x44, entity, entity + 512);
    memory.fill(0, world, world + 0x3000);
    view.setUint32(world + 2140, 0x0badcafe, true);
    view.setUint32(entity, world, true);
    view.setUint32(entity + 16, cell, true);
    view.setUint32(slot, entity, true);
    view.setUint32(slot + 20, 0x11111111, true);
    (targetKind === 'heap' ? writeHeap : writeInline)(target, targetText);
    (sourceKind === 'heap' ? writeHeap : writeInline)(source, sourceText);
    view.setUint32(world + 264876 + cell * 8, 0, true);
    view.setUint32(world + 264880 + cell * 8, 0, true);
    resetGlobals(preload);
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(265, target, source);
    const expected = Buffer.from(memory);
    memory.set(before);
    runtime.stackPointer.value = stack;
    hook[265](target, source);
    if (!Buffer.from(memory).equals(expected)) {
      const actual = Buffer.from(memory); const diffs = [];
      for (let i = 0; i < actual.length && diffs.length < 8; i++)
        if (actual[i] !== expected[i]) diffs.push([i.toString(16), actual[i], expected[i]]);
      assert.fail(`${name}: memory ${JSON.stringify(diffs)}`);
    }
    assert.equal(runtime.stackPointer.value, stack, `${name}: stack`);
    comparisons++;
  }

  const texts = ['', 'a', 'alpha', 'entity name', 'same length!!', 'with\u0000nul'];
  for (let i = 0; i < texts.length; i++) {
    scenario(`equal inline ${i}`, 'inline', texts[i], 'inline', texts[i], false);
    scenario(`equal heap ${i}`, 'heap', texts[i], 'heap', texts[i], false);
    scenario(`heap to inline ${i}`, 'heap', texts[i], 'inline', 'other', false);
    scenario(`inline to heap ${i}`, 'inline', texts[i], 'heap', 'other', true);
    scenario(`both heap ${i}`, 'heap', texts[i], 'heap', 'different', true);
  }
  scenario('long inline to inline', 'inline', 'x'.repeat(11), 'inline', 'y'.repeat(11), false);
  scenario('heap empty', 'heap', '', 'heap', 'value', false);
  scenario('repeated first', 'inline', 'one', 'inline', 'two', false);
});
