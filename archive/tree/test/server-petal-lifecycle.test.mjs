import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import wabtFactory from 'wabt';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { createPetalLifecycleHooks, functionIds } from '../source/game/server/petal-lifecycle.mjs';
import { functionIds as petalMethods } from '../source/game/server/petals.mjs';
import { functionIds as specialMethods } from '../source/game/server/petals-special.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../source/semantic/server-catalogs.json', import.meta.url))).petalDefinitions;
const signatures = {
  22: { parameters: ['i32'], results: [] }, 98: { parameters: ['i32'], results: ['i32'] },
  152: { parameters: ['i32', 'i32', 'i32'], results: [] },
  171: { parameters: ['i32', 'i32'], results: [] },
  281: { parameters: ['i32', 'i32', 'i32', 'i32'], results: [] },
};
const wabt = await wabtFactory();
const adapters = {};
for (const [id, { parameters, results }] of Object.entries(signatures)) {
  const signature = parameters.map(type => `(param ${type})`).join(' ') + results.map(type => `(result ${type})`).join(' ');
  const arguments_ = parameters.map((_, index) => `local.get ${index}`).join(' ');
  const parsed = wabt.parseWat('lifecycle-adapter.wat', `(module
    (import "test" "hook" (func $hook ${signature}))
    (func (export "entry") ${signature} ${arguments_} call $hook))`);
  try { adapters[id] = new WebAssembly.Module(parsed.toBinary({}).buffer); } finally { parsed.destroy(); }
}

async function oracle() {
  const events = [];
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, 14, 15, 16, 128, 144, 217, 654, 655],
    imports: { a: {
      a: (...args) => { events.push(['host.a', ...args]); return args[0] === 22855 ? 5000 : 0; },
      b: (...args) => { events.push(['host.b', ...args]); return 0; },
    } },
  });
  runtime.exports.u(0, 0);
  const bytes = Buffer.from(runtime.memory.buffer), view = new DataView(runtime.memory.buffer);
  const hooks = createPetalLifecycleHooks(runtime);
  const u32 = address => view.getUint32(address, true), word = (address, value) => view.setUint32(address, value, true);
  const allocate = size => { const pointer = runtime.call(16, size) >>> 0; bytes.fill(0, pointer, pointer + size); return pointer; };
  const capture = () => ({ memory: Buffer.from(bytes), stack: runtime.stackPointer.value });
  const restore = state => { bytes.set(state.memory); runtime.stackPointer.value = state.stack; };
  function compareCalls(expectedCall, recoveredCall, label) {
    const before = capture();
    function run(fn) {
      events.length = 0;
      let result, error;
      try { result = fn(); } catch (caught) { error = caught; }
      return { result, error, memory: Buffer.from(bytes), stack: runtime.stackPointer.value, events: structuredClone(events) };
    }
    const expected = run(expectedCall);
    restore(before);
    const actual = run(recoveredCall);
    assert.equal(actual.result, expected.result, `${label}: return`);
    assert.equal(actual.error?.constructor, expected.error?.constructor, `${label}: trap class`);
    assert.equal(actual.stack, expected.stack, `${label}: stack`);
    assert.deepEqual(actual.events, expected.events, `${label}: host order`);
    if (!actual.memory.equals(expected.memory)) {
      let at = 0;
      while (actual.memory[at] === expected.memory[at]) at++;
      assert.fail(`${label}: memory at ${at}, expected ${expected.memory.subarray(at, at + 32).toString('hex')}, actual ${actual.memory.subarray(at, at + 32).toString('hex')}`);
    }
    return actual;
  }
  const compare = (id, args, label) => compareCalls(() => runtime.call(id, ...args), () => hooks[id](...args), label);
  function compareIndirect(method, args, label, signature = signatures[method.functionIndex]) {
    const entry = runtime.table.get(method.tableIndex);
    const replacement = new WebAssembly.Instance(adapters[method.functionIndex], { test: { hook: hooks[method.functionIndex] } }).exports.entry;
    try {
      return compareCalls(() => runtime.indirect(signature, method.tableIndex, ...args), () => {
        runtime.table.set(method.tableIndex, replacement);
        return runtime.indirect(signature, method.tableIndex, ...args);
      }, label);
    } finally { runtime.table.set(method.tableIndex, entry); }
  }
  function equipped() {
    const world = 22928, entity = runtime.call(144, world + 1936, 1, 300, 400, -1);
    const petal = runtime.call(128, world + 268) >>> 0;
    word(entity + 124, petal); word(petal, entity); word(petal + 4, u32(world + 2140));
    bytes[petal + 8] = 0; word(petal + 12, 0); word(petal + 15, 0); word(petal + 20, 0);
    return { world, entity, petal };
  }
  return { runtime, bytes, view, hooks, u32, word, allocate, capture, restore, compare, compareIndirect, equipped };
}

test('catalog shared methods have complete bodies and close the 57-method petal coverage set', async () => {
  const distinct = new Set(catalog.flatMap(entry => entry.virtualMethods.map(method => method.functionIndex)));
  const recovered = new Set([...petalMethods, ...specialMethods, ...functionIds]);
  assert.equal(distinct.size, 57);
  assert.deepEqual([...distinct].filter(id => !recovered.has(id)), []);
  const o = await oracle(), baseline = o.capture();
  for (const pointer of [0, 1, -1, 0x7fffffff, 0x80000000, 0xffffffff, 0x100000001]) {
    o.restore(baseline);
    assert.equal(o.compare(98, [pointer], `identity ${pointer}`).result, pointer | 0);
    for (const id of [152, 171, 281]) o.compare(id, Array(signatures[id].parameters.length).fill(pointer), `empty ${id}, pointer ${pointer}`);
  }
  for (const size of [0, 4, 24, 32, 128, 4096]) {
    o.restore(baseline);
    const pointer = size ? o.allocate(size) : 0;
    o.compare(22, [pointer], `delete object ${size} bytes`);
  }
});

test('all shared catalog table entries retain their exact signatures and typed traps', async () => {
  const o = await oracle(), selected = new Map();
  for (const definition of catalog) for (const method of definition.virtualMethods) {
    if (signatures[method.functionIndex]) selected.set(method.tableIndex, method);
  }
  for (const method of selected.values()) {
    const args = method.functionIndex === 22 ? [o.allocate(32)]
      : Array(signatures[method.functionIndex].parameters.length).fill(-1);
    o.compareIndirect(method, args, `table ${method.tableIndex}, func${method.functionIndex}`);
  }
  for (const id of Object.keys(signatures).map(Number)) {
    const method = [...selected.values()].find(entry => entry.functionIndex === id);
    const wrong = { parameters: signatures[id].parameters, results: signatures[id].results.length ? [] : ['i32'] };
    assert.ok(o.compareIndirect(method, Array(wrong.parameters.length).fill(0), `wrong table signature for ${id}`, wrong).error);
  }
});

test('orbit indices match every catalog type and every missing/entity/component combination', async () => {
  const o = await oracle(), loadout = o.allocate(744), equipped = Array.from({ length: 24 }, () => o.equipped());
  const baseline = o.capture();
  for (let type = 0; type < catalog.length; type++) for (let shape = 0; shape < 27; shape++) {
    o.restore(baseline);
    o.bytes[loadout + 148] = [0, 14, 15, 29, 30, 44, 45, 255][shape % 8];
    for (let slot = 0; slot < 8; slot++) {
      o.bytes[loadout + 20 + slot] = slot === 0 ? type : [1, 16, 17, 24, 25, 27, 30][slot - 1];
      let states = shape;
      for (let instance = 0; instance < 3; instance++) {
        const object = equipped[slot * 3 + instance], state = states % 3;
        states = Math.floor(states / 3);
        o.word(loadout + slot * 36 + instance * 12 + 296, state ? object.entity : 0);
        o.word(object.entity + 124, state === 2 ? object.petal : 0);
        o.bytes[object.petal + 18] = 0xa5;
      }
    }
    o.compare(85, [loadout], `orbit type ${type}, entity/component states ${shape}`);
  }
});

test('captured real player loadout preserves level boundaries and grouped orbital positions', async () => {
  const o = await oracle();
  const capture = JSON.parse(fs.readFileSync(new URL('../reports/runtime/client-packet-traces.json', import.meta.url)));
  for (const packet of capture.packets.filter(entry => entry.direction === 'toWorker').slice(0, 4)) {
    const pointer = o.allocate(packet.bytes.length); o.bytes.set(packet.bytes, pointer);
    o.runtime.call(655, pointer, packet.bytes.length); o.runtime.call(14, pointer); o.runtime.call(654);
  }
  const player = o.u32(o.u32(22928 + 264)), entity = o.u32(player + 100), loadout = o.u32(entity + 200);
  assert.ok(entity && loadout, 'captured spawn produces a real loadout');
  const baseline = o.capture();
  for (const level of [0, 14, 15, 29, 30, 44, 45, 255]) {
    o.restore(baseline); o.bytes[loadout + 148] = level;
    o.compare(85, [loadout], `real player level ${level}`);
  }
});

test('petal slot attachment matches vector reuse/growth, cache destruction and three initial epochs', async () => {
  const o = await oracle(), object = o.equipped(), baseline = o.capture();
  for (const [count, capacity] of [[0, 0], [0, 1], [1, 1], [3, 3], [3, 4], [1023, 1024], [1024, 1024]]) {
    o.restore(baseline);
    const items = capacity ? o.allocate(capacity * 4) : 0;
    for (let index = 0; index < count; index++) o.word(items + index * 4, object.petal);
    o.word(object.world + 300, count); o.word(object.world + 304, capacity); o.word(object.world + 308, items);
    o.word(object.world + 2140, 0xdeadbeef);
    const index = o.u32(object.entity + 16) & 16383;
    for (const offset of [264876, 264880]) {
      const packet = o.allocate(16), payload = o.allocate(32);
      o.word(packet + 12, payload); o.word(object.world + (index << 3) + offset, packet);
    }
    o.compare(218, [object.entity, object.petal], `attachment vector count ${count}, capacity ${capacity}`);
    assert.equal(o.u32(object.world + 300), count + 1);
    assert.equal(o.u32(o.u32(object.world + 308) + count * 4), object.petal);
    for (const offset of [68268, 133804, 199340]) assert.equal(o.u32(object.world + (index << 2) + offset), 0xdeadbeef);
    o.compare(218, [object.entity, object.petal], `repeated attachment ${count}, ${capacity}`);
  }
});

test('lifecycle malformed pointers preserve WASM traps and preceding memory writes', async () => {
  const o = await oracle(), loadout = o.allocate(744), object = o.equipped(), baseline = o.capture();
  for (const pointer of [-1, o.bytes.length - 10, o.bytes.length - 100]) {
    o.restore(baseline);
    assert.ok(o.compare(85, [pointer], `bad loadout ${pointer}`).error);
  }
  for (const type of [0, 1, 25, 39, 255]) {
    o.restore(baseline); o.bytes[loadout + 20] = type; o.word(loadout + 296, o.bytes.length - 1);
    o.compare(85, [loadout], `bad child, type ${type}`);
  }
  for (const pointer of [-1, o.bytes.length - 92, o.bytes.length - 93]) {
    o.restore(baseline);
    assert.ok(o.compare(218, [pointer, object.petal], `bad entity ${pointer}`).error);
  }
  o.restore(baseline); o.word(object.entity, o.bytes.length - 8);
  assert.ok(o.compare(218, [object.entity, object.petal], 'bad world pointer').error);
});
