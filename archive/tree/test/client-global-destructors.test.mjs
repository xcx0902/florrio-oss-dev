import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createGlobalDestructorHooks, functionIds} from '../source/game/client/global-destructors.mjs';

let comparisons = 0;
after(() => console.log(
  `client global-destructors oracle comparisons: ${comparisons} total (0 trapping); `
  + `${functionIds.length} free/zeroing destructors`));

async function oracle() {
  const runtime = await loadOriginal('client', {
    functionIds: [...functionIds, 362, 371], construct: false});
  const hooks = createGlobalDestructorHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const allocate = size => runtime.call(371, size) >>> 0;
  const set8 = (address, value) => view.setUint8(address, value);
  const set32 = (address, value) => view.setUint32(address, value, true);

  function prepare(id, variant) {
    if (id === 374) return [allocate(32)];
    if (id === 381) {
      const object = allocate(128);
      set8(object + 11, variant === 0 ? 0 : 0x80);
      set32(object, allocate(32));
      return [object];
    }
    if (id === 1412) {
      const count = variant === 0 ? 3 : 10;
      const data = allocate(count * 4);
      const table = new DataView(bytes.buffer);
      for (let index = 0; index < count; index++)
        table.setUint32(data + index * 4, allocate(16), true);
      set32(386772, count); set32(386780, data);
      set32(386792, allocate(16));
      return [];
    }
    if (id === 1335) {
      for (let slot = 441260; slot >= 441148; slot -= 16) set32(slot, allocate(32));
      return [];
    }
    if (id === 439 || id === 499) {
      const destination = allocate(128), source = allocate(128);
      set32(destination + 8, 0x11111111);
      set32(destination, 0x22222222); set32(destination + 4, 0x33333333);
      set8(destination + 11, variant === 0 ? 0 : 0x80);
      set32(destination, allocate(32));
      set32(source + 8, 0x44444444);
      set32(source, 0x55555555); set32(source + 4, 0x66666666);
      set8(source + 11, 0xaa); set8(source, 0xbb);
      return [destination, source];
    }
    if (id === 1280) {
      for (const slot of [7908904, 7908892, 7908880, 7908868])
        set32(slot, allocate(32));
      return [];
    }
    if (id === 1379) {
      const second = allocate(64), first = allocate(64), tail = allocate(16);
      for (const node of [first, second]) {
        set8(node + 31, variant === 0 ? 0x80 : 0);
        set8(node + 19, variant === 0 ? 0x80 : 0);
        set32(node + 20, allocate(16)); set32(node + 8, allocate(16));
      }
      set32(first, second); set32(second, 0);
      set32(395156, first); set32(395148, tail);
      return [];
    }
    if (id === 413) {
      const object = allocate(128), text = allocate(32);
      set32(object, text);
      set8(object + 11, 0x80);
      return [object];
    }
    if (id === 833) {
      const object = allocate(64), child = allocate(32);
      set32(object + 8, child);
      set8(object + 12, 1);
      return [object];
    }
    if (id === 845) {
      const left = allocate(192), right = allocate(64);
      return variant === 0 ? [left, left] : [left, right];
    }
    if (id === 895) return [variant === 0 ? allocate(32) : variant === 1 ? 0 : 131484];
    if (id === 1269) {
      const second = allocate(16), first = allocate(16), tail = allocate(16);
      set32(first, second); set32(second, 0);
      set32(7910236, first); set32(7910228, tail);
      return [];
    }
    if (id === 1291) {
      set8(441395, variant === 0 ? 0xff : 0); set8(441383, variant === 0 ? 0xff : 0);
      set32(441384, allocate(32)); set32(441372, allocate(32));
      return [];
    }
    if (id === 1302) {
      set8(439203, variant === 0 ? 0xff : 0); set8(439191, variant === 0 ? 0xff : 0);
      set32(439192, allocate(32)); set32(439180, allocate(32));
      return [];
    }
    if (id === 1313) {
      const tail = allocate(16), node = allocate(16);
      set32(node, 0); set32(441352, node); set32(441344, tail);
      return [];
    }
    if (id === 1390) { set32(391048, allocate(32)); return []; }
    if (id === 1401) { set32(386936, allocate(32)); return []; }
    if (id === 2285) {
      set8(7922303, variant === 0 ? 0xff : 0);
      set32(7922292, allocate(32));
      return [];
    }
    if (id === 2398) { set32(441276, allocate(32)); return []; }
    if (id === 2574) {
      set8(167971, variant === 0 ? 0x80 : 0x7f);
      set32(167960, allocate(32));
      return [];
    }
    if (id === 2604) { set32(7922264, allocate(32)); return []; }
    if (id === 2608) {
      set32(7948276, variant === 0 ? allocate(32) : 0);
      set32(7948280, 0);
      return [];
    }
    if (id === 2635) {
      const object = allocate(64), child = allocate(64);
      set32(object + 12, child); set32(child + 12, allocate(32));
      return [object];
    }
    if (id === 2661) { set32(437396, allocate(32)); return []; }
    if (id === 3841) {
      const object = allocate(64), first = allocate(16), second = allocate(16);
      set32(object + 28, first); set32(object + 32, second);
      return [object];
    }
    throw new Error(`no setup for ${id}`);
  }

  function compare(id, variant) {
    const args = prepare(id, variant);
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    let expected;
    try { expected = {result: runtime.call(id, ...args)}; }
    catch (error) { expected = {error: [error.constructor.name, error.message]}; }
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    runtime.stackPointer.value = stack;
    let actual;
    try { actual = {result: hooks[id](...args)}; }
    catch (error) { actual = {error: [error.constructor.name, error.message]}; }
    assert.deepEqual(actual, expected, `${id}/${variant}: outcome`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${id}/${variant}: complete memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${id}/${variant}: stack`);
    comparisons++;
  }
  return {runtime, hooks, prepare, compare};
}

test('global destructors free and clear the original structures', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    o.compare(id, 0);
    if ([381, 439, 499, 845, 895, 1291, 1302, 1379, 1412, 2285, 2574, 2608].includes(id)) o.compare(id, 1);
  }
});
