import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createCheckWebSocketsHook, functionIds, dependencyIds} from '../source/game/server/check-websockets.mjs';

let comparisons = 0;
after(() => console.log(
  `server websocket-pump oracle comparisons: ${comparisons} total; `
  + 'empty list, no-event socket, event kinds 1-5, close callback and OOB trap'));

const LIST = 8548284;

function tableIndex(runtime, id) {
  const fn = runtime.exports[`__fn${id}`];
  for (let index = 0; index < runtime.table.length; index++)
    if (runtime.table.get(index) === fn) return index;
  throw new Error(`function ${id} is not in the table`);
}

test('cp6CheckWebSockets 660 matches the original', async () => {
  const scripts = new Map();
  const state = {cursor: new Map(), closeWord: new Map(), kinds: []};
  const dispatcher = (selector, operation, frame) => {
    assert.equal(selector, 22639);
    assert.equal(operation, 5170);
    const view = new DataView(runtime.memory.buffer);
    const key = view.getUint32(frame, true);
    const events = scripts.get(key) ?? [];
    const cursor = state.cursor.get(key) ?? 0;
    if (cursor < events.length) {
      const event = events[cursor];
      state.cursor.set(key, cursor + 1);
      view.setUint32(frame + 20, event.payload, true);
      view.setUint32(frame + 16, event.word, true);
      state.kinds.push(event.kind);
      return event.kind;
    }
    view.setUint32(frame + 20, state.closeWord.get(key) ?? 0, true);
    view.setUint32(frame + 16, 0, true);
    state.kinds.push(0);
    return 0;
  };
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, ...dependencyIds, 16, 152, 604],
    imports: {a: {b: dispatcher}},
    construct: false,
  });
  const hook = createCheckWebSocketsHook(runtime);
  assert.equal(hook[660].length, runtime.exports.__fn660.length);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const counter = tableIndex(runtime, 604);
  const noopThree = tableIndex(runtime, 152);
  let allocations = 0;
  const allocate = size => {
    const pointer = runtime.call(16, size) >>> 0;
    if (pointer === 0) throw new Error(`malloc ${size} returned 0 after ${allocations} allocations`);
    allocations++;
    return pointer;
  };
  const reset = () => { state.cursor = new Map(); state.kinds = []; };
  const invoke = (which, capture = false) => {
    reset();
    const stack = runtime.stackPointer.value;
    let outcome;
    try {
      outcome = {value: which === 'native' ? runtime.call(660) : hook[660]()};
    } catch (error) {
      outcome = {error};
    }
    return {outcome, stack: runtime.stackPointer.value, saved: stack};
  };

  let nextToken = 0x1000;
  function buildSocket({events = [], withClose = false, handlers = true, trapSlot = 0} = {}) {
    const socket = allocate(128);
    bytes.fill(0, socket, socket + 128);
    const token = nextToken++;
    view.setUint32(socket, token, true);
    const makeHandler = slot => {
      const base = allocate(64), vtable = allocate(64);
      bytes.fill(0, base, base + 64);
      bytes.fill(0, vtable, vtable + 64);
      view.setUint32(base, vtable, true);
      view.setUint32(vtable + 24, trapSlot === slot ? 0xffffffff
        : slot === 48 ? noopThree : counter, true);
      return base;
    };
    if (handlers) {
      view.setUint32(socket + 24, makeHandler(24), true);
      view.setUint32(socket + 48, makeHandler(48), true);
      view.setUint32(socket + 72, makeHandler(72), true);
      view.setUint32(socket + 96, withClose ? makeHandler(96) : 0, true);
    }
    const list = events.map(({kind}) => {
      const payload = allocate(48);
      bytes.fill((kind * 17) & 0xff, payload, payload + 48);
      return {kind, payload, word: 0x5a5a0000 + kind};
    });
    scripts.set(token, list);
    if (withClose) state.closeWord.set(token, allocate(32));
    return socket;
  }
  function buildNode(socket, next = 0) {
    const node = allocate(32);
    bytes.fill(0, node, node + 32);
    view.setUint32(node, next, true);
    view.setUint32(node + 8, socket, true);
    return node;
  }

  const cases = [];
  cases.push({name: 'empty list', setup() { view.setUint32(LIST, 0, true); }});
  cases.push({name: 'no pending event', setup() {
    const socket = buildSocket({handlers: false});
    view.setUint32(LIST, buildNode(socket), true);
  }});
  cases.push({name: 'event kinds and close', setup() {
    const socket = buildSocket({withClose: true,
      events: [{kind: 1}, {kind: 2}, {kind: 3}, {kind: 4}]});
    const second = buildSocket({handlers: false});
    view.setUint32(LIST, buildNode(socket, buildNode(second)), true);
  }});
  cases.push({name: 'close event without close handler', setup() {
    const socket = buildSocket({events: [{kind: 4}], handlers: false});
    view.setUint32(LIST, buildNode(socket), true);
  }});
  cases.push({name: 'no event with close handler', setup() {
    const socket = buildSocket({withClose: true});
    view.setUint32(LIST, buildNode(socket), true);
  }});
  cases.push({name: 'discarded event kind', setup() {
    const socket = buildSocket({events: [{kind: 5}]});
    view.setUint32(LIST, buildNode(socket), true);
  }});
  for (const [name, options] of [
    ['kind 1 handler trap', {events: [{kind: 1}], trapSlot: 48}],
    ['kind 2 handler trap', {events: [{kind: 2}], trapSlot: 24}],
    ['kind 3 handler trap', {events: [{kind: 3}], trapSlot: 72}],
    ['close handler trap', {events: [{kind: 4}], withClose: true, trapSlot: 96}],
  ]) {
    cases.push({name, setup() {
      const socket = buildSocket(options);
      view.setUint32(LIST, buildNode(socket), true);
    }});
  }
  cases.push({name: 'malformed socket pointer', setup() {
    const node = buildNode(0);
    view.setUint32(node + 8, 0xfffffff0, true);
    view.setUint32(LIST, node, true);
  }});

  for (const current of cases) {
    scripts.clear();
    current.setup();
    const before = Buffer.from(bytes);
    const native = invoke('native');
    if (current.name.includes('kinds'))
      assert.deepEqual(state.kinds, [1, 2, 3, 4, 0], 'all event branches');
    const expected = Buffer.from(bytes);
    bytes.set(before);
    runtime.stackPointer.value = native.saved;
    const recovered = invoke('recovered');
    if (current.name.includes('kinds'))
      assert.deepEqual(state.kinds, [1, 2, 3, 4, 0], 'all event branches (recovered)');
    const actual = Buffer.from(bytes);
    if (!actual.equals(expected)) {
      let at = 0;
      while (at < actual.length && actual[at] === expected[at]) at++;
      assert.fail(`${current.name}: memory differs at 0x${at.toString(16)}: `
        + `native=${expected[at]} recovered=${actual[at]}`);
    }
    if (native.outcome.error) {
      assert.ok(recovered.outcome.error, `${current.name}: expected trap`);
      assert.equal(recovered.outcome.error.constructor, native.outcome.error.constructor,
        `${current.name}: error type`);
      assert.equal(recovered.outcome.error.message, native.outcome.error.message,
        `${current.name}: error message`);
      assert.equal(recovered.stack, native.stack, `${current.name}: stack after trap`);
    } else {
      assert.equal(recovered.outcome.value, native.outcome.value, `${current.name}: result`);
      assert.equal(recovered.stack, native.stack, `${current.name}: stack`);
    }
    comparisons++;
    runtime.stackPointer.value = native.saved;
  }
});
