import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { createSimulationTickHooks, functionIds } from '../source/game/server/simulation-tick.mjs';

const inventory = JSON.parse(await fs.readFile(new URL('../reports/wasm/sp_server-functions.json', import.meta.url), 'utf8'));
async function fixture() {
  let runtime, clock = 1000, entropy = 0x6f6c6446;
  const outgoing = [], hosts = [], view = () => new DataView(runtime.memory.buffer);
  function bridge(code, signature, pointer) {
    hosts.push([code, signature, pointer, runtime.stackPointer.value]);
    const memory = view();
    switch (code) {
      case 22600: case 22639: return 0;
      case 22791: return 1;
      case 22855: return clock;
      case 22903: return memory.getFloat64(pointer, true) % memory.getFloat64(pointer + 8, true);
      default: throw new Error(`Unexpected host ${code}`);
    }
  }
  const imports = { a: {
    a: bridge, b: bridge,
    c: (pointer, length) => outgoing.push(['final', pointer, length]),
    d: (pointer, length) => outgoing.push(['data', Buffer.from(new Uint8Array(runtime.memory.buffer, pointer, length)).toString('hex')]),
    e: () => { throw new WebAssembly.RuntimeError('OOM'); },
    f: () => { throw new WebAssembly.RuntimeError('abort'); },
    i: (count, size) => { view().setUint32(count, 0, true); view().setUint32(size, 0, true); return 0; },
    j: (fd, vectors, count, written) => {
      let size = 0; for (let i = 0; i < count; i++) size += view().getUint32(vectors + i * 8 + 4, true);
      view().setUint32(written, size, true); return 0;
    },
    n: (pointer, length) => {
      const bytes = new Uint8Array(runtime.memory.buffer);
      for (let i = 0; i < length; i++) { entropy ^= entropy << 13; entropy ^= entropy >>> 17; entropy ^= entropy << 5; bytes[pointer + i] = entropy & 255; }
      return 0;
    },
  } };
  runtime = await loadOriginal('sp_server', { imports, construct: false, functionIds: inventory.map(entry => entry.id) });
  runtime.exports.p(); runtime.call(656, 0, 0);
  const hooks = createSimulationTickHooks(runtime);
  function snapshot() { return { bytes: Buffer.from(new Uint8Array(runtime.memory.buffer)), stack: runtime.stackPointer.value, entropy }; }
  function restore(state) { new Uint8Array(runtime.memory.buffer).set(state.bytes); runtime.stackPointer.value = state.stack; entropy = state.entropy; }
  function compare(label, invoke = () => hooks[654]()) {
    const before = snapshot(); hosts.length = 0; outgoing.length = 0;
    let expectedError, actualError;
    try { runtime.call(654); } catch (error) { expectedError = [error.constructor.name, error.message]; }
    const expected = snapshot(), expectedHosts = structuredClone(hosts), expectedOutgoing = structuredClone(outgoing);
    restore(before); hosts.length = 0; outgoing.length = 0;
    try { invoke(); } catch (error) { actualError = [error.constructor.name, error.message]; }
    assert.deepEqual(actualError, expectedError, `${label}: error`);
    const actual = Buffer.from(runtime.memory.buffer);
    if (!actual.equals(expected.bytes)) {
      const differences = [];
      for (let address = 0; address < actual.length && differences.length < 24; address++) if (actual[address] !== expected.bytes[address]) differences.push({ address, original: expected.bytes[address], recovered: actual[address] });
      assert.fail(`${label}: complete memory ${JSON.stringify(differences)}`);
    }
    assert.equal(runtime.stackPointer.value, expected.stack, `${label}: stack`);
    if (JSON.stringify(hosts) !== JSON.stringify(expectedHosts)) { const at = expectedHosts.findIndex((entry, index) => JSON.stringify(entry) !== JSON.stringify(hosts[index])); assert.fail(`${label}: hosts length ${hosts.length}/${expectedHosts.length}, first difference ${at}, actual ${JSON.stringify(hosts.slice(at - 3, at + 6))}, expected ${JSON.stringify(expectedHosts.slice(at - 3, at + 6))}`); }
    assert.deepEqual(outgoing, expectedOutgoing, `${label}: outgoing`);
  }
  return { runtime, hooks, compare, snapshot, restore, outgoing, hosts,
    setClock(value) { clock = value; },
    advance(ms = 50) { clock += ms; },
    send(packet) { const pointer = runtime.call(16, packet.length); new Uint8Array(runtime.memory.buffer).set(packet, pointer); runtime.call(655, pointer, packet.length); runtime.call(14, pointer); },
  };
}

test('complete main tick is direct source and advertises only original654', () => {
  assert.deepEqual(functionIds, [654]);
});

test('main tick preserves every memory byte, stack and host/output order over captured-input replay', async () => {
  const world = await fixture();
  const packets = JSON.parse(await fs.readFile(new URL('../reports/runtime/client-packet-traces.json', import.meta.url), 'utf8')).packets.filter(packet => packet.direction === 'toWorker');
  for (let tick = 0; tick < 40; tick++) {
    if (tick < packets.length) world.send(Uint8Array.from(packets[tick].bytes));
    world.advance(); world.compare(`captured tick ${tick}`); world.runtime.call(657, 0, 0);
  }
});

test('main tick covers pause, output backpressure, clock deltas and lobby/countdown modes', async () => {
  const world = await fixture(), baseline = world.snapshot();
  const memory = () => new DataView(world.runtime.memory.buffer);
  const cases = [
    ['paused scheduler', () => memory().setUint8(8545776, 0)],
    ['output backpressure', () => memory().setUint8(8545512, 17)],
    ['lobby status', () => memory().setUint8(24837, 1)],
    ['countdown starts', () => { memory().setUint8(23801, 1); memory().setUint8(23252, 1); memory().setFloat32(23248, 10, true); }],
    ['countdown running', () => { memory().setUint8(23801, 1); memory().setUint8(23252, 1); memory().setFloat32(23248, 1000, true); }],
    ['finished match', () => { memory().setUint8(23801, 1); memory().setUint8(24839, 1); }],
    ['collision tree refresh', () => { memory().setUint8(22929, 1); memory().setUint8(24948, 0); }],
  ];
  for (const [label, setup] of cases) { world.restore(baseline); world.setClock(1050); setup(); world.compare(label); }
  for (const delta of [-25, 0, 0.125, 99.999999, 100, 600, 3000]) {
    world.restore(baseline); memory().setUint8(8545496, 1); memory().setFloat64(8545504, 1000, true); world.setClock(1000 + delta); world.compare(`delta ${delta}`);
  }
});
