import test from 'node:test';
import assert from 'node:assert/strict';
import wabtFactory from 'wabt';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { createEffectHooks, functionIds } from '../source/game/server/effects.mjs';

const P = { used: 8548308, blocks: 8548312, blockCapacity: 8548316, blockItems: 8548320,
  freeCount: 8548324, freeCapacity: 8548328, freeItems: 8548332 };
const wabt = await wabtFactory();
function callbackModule(parameters, results = []) {
  const type = parameters.map(value => `(param ${value})`).join(' ') + results.map(value => `(result ${value})`).join(' ');
  const arguments_ = parameters.map((_, index) => `local.get ${index}`).join(' ');
  const parsed = wabt.parseWat('effect-test-callback.wat', `(module (import "test" "run" (func $run ${type}))
    (func (export "entry") ${type} ${arguments_} call $run))`);
  try { return new WebAssembly.Module(parsed.toBinary({}).buffer); } finally { parsed.destroy(); }
}
const callbackModules = { copy: callbackModule(['i32', 'i32']), destroy: callbackModule(['i32']), wrong: callbackModule(['i32'], ['i32']) };

async function oracle() {
  let now = 5000;
  const events = [];
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, 14, 15, 16, 20, 21, 58, 128, 144, 217, 431, 676, 681],
    imports: { a: {
      a: (...args) => { events.push(['host.a', ...args]); return args[0] === 22855 ? now : 0; },
      b: (...args) => { events.push(['host.b', ...args]); return 0; },
      e: (...args) => { events.push(['oom', ...args]); throw new WebAssembly.RuntimeError('OOM'); },
      f: (...args) => { events.push(['abort', ...args]); throw new WebAssembly.RuntimeError('abort'); },
    } },
  });
  runtime.exports.u(0, 0);
  const bytes = Buffer.from(runtime.memory.buffer), view = new DataView(runtime.memory.buffer), hooks = createEffectHooks(runtime);
  const u32 = address => view.getUint32(address, true), word = (address, value) => view.setUint32(address, value, true);
  const allocate = size => { const pointer = runtime.call(16, size) >>> 0; bytes.fill(0, pointer, pointer + size); return pointer; };
  const capture = () => ({ memory: Buffer.from(bytes), stack: runtime.stackPointer.value });
  const restore = state => { bytes.set(state.memory); runtime.stackPointer.value = state.stack; };
  function compare(id, args, label) {
    const before = capture();
    function run(fn) {
      events.length = 0;
      let result, error;
      try { result = fn(...args); } catch (caught) { error = caught; }
      return { result, error, memory: Buffer.from(bytes), stack: runtime.stackPointer.value, events: structuredClone(events) };
    }
    const expected = run((...values) => runtime.call(id, ...values));
    restore(before);
    const actual = run(hooks[id]);
    assert.equal(actual.result, expected.result, `${label}: return`);
    assert.equal(actual.error?.constructor, expected.error?.constructor, `${label}: trap class`);
    assert.equal(actual.stack, expected.stack, `${label}: stack`);
    assert.deepEqual(actual.events, expected.events, `${label}: callback/host order`);
    if (!actual.memory.equals(expected.memory)) {
      let at = 0;
      while (actual.memory[at] === expected.memory[at]) at++;
      assert.fail(`${label}: memory at ${at}, expected ${expected.memory.subarray(at, at + 32).toString('hex')}, actual ${actual.memory.subarray(at, at + 32).toString('hex')}`);
    }
    return actual;
  }
  function callbacks() {
    const vtable = allocate(24);
    const tableFunctions = {
      1: ['copy', (source, destination) => {
        events.push(['copy', source, destination, u32(source + 4)]);
        const values = [u32(source), u32(source + 4), u32(source + 8)];
        values.forEach((value, index) => word(destination + index * 4, value));
      }],
      2: ['destroy', object => { events.push(['destroy.inline', object, u32(object + 4)]); word(object + 12, 0x778899aa); }],
      3: ['destroy', object => { events.push(['destroy.heap', object, u32(object + 4)]); word(object + 12, 0xaabbccdd); }],
      4: ['wrong', () => 0],
    };
    for (const [index, [kind, run]] of Object.entries(tableFunctions)) {
      runtime.table.set(Number(index), new WebAssembly.Instance(callbackModules[kind], { test: { run } }).exports.entry);
    }
    word(vtable + 4, 3); word(vtable + 12, 1); word(vtable + 16, 2); word(vtable + 20, 3);
    return vtable;
  }
  function callbackNode(vtable, kind, token) {
    const node = allocate(40);
    if (kind !== 'empty') {
      const callback = kind === 'inline' ? node : allocate(24);
      word(callback, vtable); word(callback + 4, token); word(callback + 8, token * 7);
      word(node + 16, callback);
    }
    return node;
  }
  function heap(values, capacity = values.length) {
    const items = capacity ? allocate(capacity * 4) : 0;
    values.forEach((value, index) => word(items + index * 4, value));
    word(P.freeCount, values.length); word(P.freeCapacity, capacity); word(P.freeItems, items);
    return items;
  }
  function realPeas(type = 11, id = 676) {
    const world = 22928, entity = runtime.call(144, world + 1936, 1, 300, 400, -1), petal = runtime.call(128, world + 268);
    word(entity + 124, petal); word(petal, entity); word(petal + 4, u32(world + 2140));
    bytes[petal + 8] = 0; word(petal + 12, 0); word(petal + 15, 0); word(petal + 20, 0);
    runtime.call(217, petal, -1, -1, type);
    const behavior = u32(petal + 20); bytes[behavior + 8] = 1; view.setFloat64(behavior + 16, 0, true);
    const context = allocate(16), owner = allocate(16), output = allocate(8);
    word(context, entity); word(context + 4, owner); word(owner, entity); bytes[owner + 10] = 1;
    runtime.call(id, output, behavior, context);
    return u32(u32(world + 1920) - 4);
  }
  return { runtime, bytes, view, hooks, events, u32, word, allocate, capture, restore, compare, callbacks, callbackNode, heap, realPeas, setTime(value) { now = value; } };
}

test('effect lifetime preserves clock reads, float32 rounding and infinite/NaN expiry values', async () => {
  const o = await oracle(), effect = o.allocate(24), baseline = o.capture();
  for (const valid of [0, 1, 255]) for (const expiry of [0, -0, 4999.999999, 5000, 5000.000001, 1e-40, 1e20, Infinity, -Infinity, NaN]) {
    o.restore(baseline); o.bytes[effect + 8] = valid; o.view.setFloat64(effect + 16, expiry, true);
    o.compare(118, [effect], `expiry valid ${valid}, value ${expiry}`);
  }
  for (const pointer of [-1, o.bytes.length - 8, o.bytes.length - 20]) {
    o.restore(baseline); if (pointer === o.bytes.length - 20) o.bytes[pointer + 8] = 1;
    assert.ok(o.compare(118, [pointer], `lifetime pointer ${pointer}`).error);
  }
});

test('area effect replacement updates target vectors and destroys old ownership after transfer', async () => {
  const o = await oracle(), vtable = o.callbacks(), baseline = o.capture();
  for (const targets of [0, 1, 2, 3, 4, 7]) for (const mode of ['append', 'replace', 'remove', 'empty']) {
    o.restore(baseline);
    const area = o.allocate(28), holder = o.allocate(4), old = mode === 'replace' || mode === 'remove' ? o.allocate(24) : 0;
    const next = mode === 'append' || mode === 'replace' ? o.allocate(24) : 0;
    if (old) { o.word(old, vtable); o.word(old + 4, 123); }
    if (next) { o.word(next, vtable); o.word(next + 4, 456); }
    const handles = targets ? o.allocate(targets * 12) : 0;
    o.word(area + 8, old); o.word(area + 16, targets); o.word(area + 20, targets); o.word(area + 24, handles); o.word(holder, next);
    for (let index = 0; index < targets; index++) {
      const entity = o.runtime.call(144, 22928 + 1936, 1, 10, 20, -1), effects = o.allocate(40), head = o.allocate(12);
      o.word(entity + 192, effects);
      const handle = handles + index * 12;
      o.word(handle, entity); o.word(handle + 4, head); o.word(handle + 8, head);
      o.word(head + 4, handle); o.word(head + 8, handle);
      const length = old ? index % 3 + 1 : index % 3, capacity = length + (index % 2), items = capacity ? o.allocate(capacity * 4) : 0;
      for (let item = 0; item < length; item++) o.word(items + item * 4, old && item === length - 1 ? old : 0x1000 + item);
      o.word(effects + 28, length); o.word(effects + 32, capacity); o.word(effects + 36, items);
    }
    o.compare(271, [area, targets % 2 ? NaN : 1.23456789, holder], `area ${mode}, ${targets} targets`);
    assert.equal(o.u32(holder), 0);
    assert.equal(o.u32(area + 8), next);
  }
});

test('area clear retains missing-payload removal behavior and callback-induced replacement', async () => {
  const o = await oracle(), vtable = o.callbacks(), baseline = o.capture();
  for (const count of [0, 1, 3]) {
    o.restore(baseline);
    const area = o.allocate(28), old = o.allocate(24), holder = o.allocate(4), handles = o.allocate(12), effects = o.allocate(40), entity = o.allocate(200), items = o.allocate(16);
    o.word(old, vtable); o.word(old + 4, 7); o.word(area + 8, old); o.word(area + 16, 1); o.word(area + 20, 1); o.word(area + 24, handles);
    o.word(handles, entity); o.word(handles + 4, handles); o.word(handles + 8, handles); o.word(entity + 192, effects);
    for (let index = 0; index < count; index++) o.word(items + index * 4, 0x1111 + index);
    o.word(effects + 28, count); o.word(effects + 32, 4); o.word(effects + 36, items);
    o.compare(271, [area, -Infinity, holder], `clear missing old pointer in ${count}-item target`);
  }
  o.restore(baseline);
  const area = o.allocate(28), old = o.allocate(24), replacement = o.allocate(24), holder = o.allocate(4), retainedHandles = o.allocate(12);
  o.word(old, vtable); o.word(area + 8, old); o.word(area + 24, retainedHandles);
  o.runtime.table.set(3, new WebAssembly.Instance(callbackModules.destroy, { test: { run: object => {
    o.events.push(['replacement destructor', object]); o.word(area + 8, replacement);
  } } }).exports.entry);
  o.compare(271, [area, 5, holder], 'old payload destructor installs replacement');
  assert.equal(o.u32(area + 8), replacement);
  assert.equal(o.u32(area + 24), retainedHandles);
});

test('deferred slot acquire preserves max-heap pop ties, unsigned addresses and block allocation', async () => {
  const o = await oracle(), baseline = o.capture();
  for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 31, 32, 33]) for (const pattern of [0, 1, 2]) {
    o.restore(baseline);
    const values = Array.from({ length: count }, (_, index) => pattern === 0 ? 100000 - index * 40 : pattern === 1 ? 0xf0000000 - index * 80 : 0x10000000 - Math.floor(index / 3) * 40);
    o.heap(values);
    o.compare(277, [], `acquire heap ${count}, pattern ${pattern}`);
  }
  for (const used of [0, 1, 4095, 4096]) {
    o.restore(baseline); o.heap([]);
    const block = o.allocate(163840), blocks = o.allocate(4); o.word(blocks, block);
    o.word(P.used, used); o.word(P.blocks, 1); o.word(P.blockCapacity, 1); o.word(P.blockItems, blocks);
    o.compare(277, [], `block used ${used}`);
  }
});

test('slot release preserves unique ownership, inline/heap destruction and max-heap insertion', async () => {
  const o = await oracle(), vtable = o.callbacks(), baseline = o.capture();
  for (const count of [0, 1, 2, 3, 7, 15]) for (const kind of ['empty', 'inline', 'heap']) {
    o.restore(baseline);
    const free = Array.from({ length: count }, () => o.allocate(40)).sort((a, b) => b - a);
    o.heap(free, count);
    const node = o.callbackNode(vtable, kind, 17), holder = o.allocate(4); o.word(holder, node);
    o.compare(150, [holder], `release ${kind}, heap ${count}`);
    assert.equal(o.u32(holder), 0);
    assert.equal(o.compare(277, [], `reacquire ${kind}, heap ${count}`).result, Math.max(node, ...free));
  }
  const holder = o.allocate(4); o.compare(150, [holder], 'empty unique owner');
});

test('callback swap covers empty, inline and heap states with exact stack scratch and callback order', async () => {
  const o = await oracle(), vtable = o.callbacks(), baseline = o.capture();
  for (const left of ['empty', 'inline', 'heap']) for (const right of ['empty', 'inline', 'heap']) {
    o.restore(baseline);
    const a = o.callbackNode(vtable, left, 11), b = o.callbackNode(vtable, right, 22);
    o.compare(276, [a, b], `swap ${left}/${right}`);
    o.compare(276, [a, a], `self swap ${left}/${right}`);
  }
});

test('owned scheduler vector growth preserves moved-from entries and actual Peas callback cleanup', async () => {
  const o = await oracle(), baseline = o.capture();
  for (const count of [0, 1, 2, 7, 16]) for (const alias of [false, true]) {
    if (alias && !count) continue;
    o.restore(baseline);
    const vector = o.allocate(12), items = count ? o.allocate(count * 4) : 0, holder = alias ? items + (count - 1) * 4 : o.allocate(4);
    for (let index = 0; index < count; index++) o.word(items + index * 4, o.allocate(40));
    if (!alias) o.word(holder, o.allocate(40));
    o.word(vector, items); o.word(vector + 4, items + count * 4); o.word(vector + 8, items + count * 4);
    o.compare(275, [vector, holder], `vector ${count}, aliased holder ${alias}`);
    assert.equal((o.u32(vector + 4) - o.u32(vector)) / 4, count + 1);
  }
  o.restore(baseline);
  const a = o.realPeas(11, 676), b = o.realPeas(12, 681);
  assert.ok(o.u32(a + 16) && o.u32(b + 16), 'actual Peas launches contain callback objects');
  o.compare(276, [a, b], 'actual Peas callbacks swap');
  for (const node of [a, b]) { const holder = o.allocate(4); o.word(holder, node); o.compare(150, [holder], 'actual Peas callback destruction'); }
  o.compare(277, [], 'actual Peas slot reused');
});

test('typed callback failures and malformed storage preserve partial writes and trapped stack frames', async () => {
  const o = await oracle(), vtable = o.callbacks(), baseline = o.capture();
  for (const id of [150, 271, 276]) {
    o.restore(baseline); o.word(vtable + 4, 4); o.word(vtable + 12, 4); o.word(vtable + 16, 4); o.word(vtable + 20, 4);
    if (id === 150) { const node = o.callbackNode(vtable, 'inline', 11), holder = o.allocate(4); o.word(holder, node); assert.ok(o.compare(id, [holder], 'bad release destructor signature').error); }
    if (id === 271) { const area = o.allocate(28), old = o.allocate(24), holder = o.allocate(4); o.word(old, vtable); o.word(area + 8, old); assert.ok(o.compare(id, [area, 5, holder], 'bad area destructor signature').error); }
    if (id === 276) { const a = o.callbackNode(vtable, 'inline', 11), b = o.callbackNode(vtable, 'empty', 22); assert.ok(o.compare(id, [a, b], 'bad inline copier signature').error); }
  }
  for (const id of [150, 271, 275, 276]) {
    o.restore(baseline);
    const args = id === 150 ? [-1] : id === 271 ? [-1, 0, 0] : [-1, 0];
    assert.ok(o.compare(id, args, `bad pointer func${id}`).error);
  }
  o.restore(baseline);
  const vector = o.allocate(12), holder = o.allocate(4); o.word(vector, 8); o.word(vector + 4, 0);
  assert.ok(o.compare(275, [vector, holder], 'owned vector length error').error);
});

test('effect and scheduler allocation failures retain real allocator aborts and preceding ownership writes', async () => {
  const o = await oracle(), area = o.allocate(28), incoming = o.allocate(4), payload = o.allocate(24);
  const handles = o.allocate(12), entity = o.allocate(200), effects = o.allocate(40), node = o.allocate(40), holder = o.allocate(4), vector = o.allocate(12);
  o.word(area + 16, 1); o.word(area + 20, 1); o.word(area + 24, handles);
  o.word(handles, entity); o.word(handles + 4, handles); o.word(handles + 8, handles); o.word(entity + 192, effects); o.word(incoming, payload); o.word(holder, node);
  o.word(P.used, 4096); o.word(P.freeCount, 0); o.word(P.freeCapacity, 0); o.word(P.freeItems, 0);
  for (const size of [32 << 20, 16 << 20, 8 << 20, 4 << 20, 2 << 20, 1 << 20,
    1 << 19, 1 << 18, 1 << 17, 1 << 16, 1 << 15, 1 << 14, 1 << 13, 1 << 12,
    2048, 1024, 512, 256, 128, 64, 32, 16, 1]) {
    for (let attempt = 0; attempt < 64; attempt++) {
      try { if (!o.runtime.call(16, size)) break; } catch { break; }
    }
  }
  const exhausted = o.capture();
  for (const [id, args] of [[150, [holder]], [271, [area, 4, incoming]], [275, [vector, holder]], [277, []]]) {
    o.restore(exhausted);
    const result = o.compare(id, args, `exhausted allocation func${id}`);
    assert.ok(result.error, `func${id} actually reaches allocator failure`);
    assert.ok(result.events.some(event => event[0] === 'oom'));
  }
});
