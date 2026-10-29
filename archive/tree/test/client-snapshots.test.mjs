import test from 'node:test';

import assert from 'node:assert/strict';

import { readFile } from 'node:fs/promises';

import { createHash } from 'node:crypto';

import wabtFactory from 'wabt';

import { loadOriginal } from './helpers/wasm-probe.mjs';

import { createClientSnapshotHooks, functionIds } from '../source/game/client/snapshots.mjs';

const wabt = await wabtFactory();

const dependencies = [362, 363, 368, 371, 762, 763, 1009, 1015, 1096, 3256, 3364, 3475];

const trace = JSON.parse(
  await readFile(new URL('../reports/runtime/client-packet-traces.json', import.meta.url), 'utf8'),
);

const realPackets = trace.packets.filter(
  packet => packet.direction === 'fromWorker' && packet.bytes.length,
);

const hash = data => createHash('sha256').update(data.bytes).digest('hex');

async function typedCallback(parameters, results, callback) {
  const parsed = wabt.parseWat(
    'snapshot-callback.wat',
    `(module(import "x" "f"(func $f ${parameters.map(type => `(param ${type})`).join(' ')} ${results.map(type => `(result ${type})`).join(' ')}))(export "f"(func $f)))`,
  );
  try {
    return new WebAssembly.Instance(new WebAssembly.Module(parsed.toBinary({}).buffer), {
      x: {
        f: callback,
      },
    }).exports.f;
  } finally {
    parsed.destroy();
  }
}

async function scenario(recovered, setup, action) {
  const events = [];
  let runtime;
  runtime = await loadOriginal('client', {
    functionIds: [...functionIds, ...dependencies],
    imports: {
      a: {
        Me: () => 0,
        o: (...args) => events.push(['worker', ...args]),
        a: (...args) => {
          events.push(['bridge', ...args]);
          return 0;
        },
        Oa: (fd, vectors, count, written) => {
          const v = new DataView(runtime.memory.buffer);
          let n = 0;
          for (let i = 0; i < count; i++) n += v.getUint32(vectors + i * 8 + 4, true);
          v.setUint32(written, n, true);
          return 0;
        },
      },
    },
  });
  let hooks;
  const original = runtime.call.bind(runtime);
  const running = {
    get memory() {
      return runtime.memory;
    },
    get table() {
      return runtime.table;
    },
    host: runtime.host.bind(runtime),
    call(id, ...args) {
      return recovered && hooks[id] ? hooks[id](...args) : original(id, ...args);
    },
  };
  hooks = createClientSnapshotHooks(running);
  const data = {
    runtime: runtime,
    running: running,
    events: events,
    get bytes() {
      return new Uint8Array(runtime.memory.buffer);
    },
    get view() {
      return new DataView(runtime.memory.buffer);
    },
    malloc: bytes => original(368, bytes) >>> 0,
    get: address => new DataView(runtime.memory.buffer).getUint32(address, true),
    set: (address, value) => new DataView(runtime.memory.buffer).setUint32(address, value, true),
    nextSlot: runtime.table.length - 1,
    async attach(parameters, results, fn) {
      const slot = this.nextSlot--;
      runtime.table.set(slot, await typedCallback(parameters, results, fn));
      return slot;
    },
  };
  await setup(data);
  const stack = runtime.stackPointer.value;
  let error;
  try {
    await action(data);
  } catch (e) {
    error = {
      name: e.constructor.name,
      message: e.message,
    };
  }
  return {
    data: data,
    events: events,
    error: error,
    stack: runtime.stackPointer.value - stack,
  };
}

async function compare(setup, action, { allMemory: allMemory = true } = {}) {
  const original = await scenario(false, setup, action),
    recovered = await scenario(true, setup, action);
  assert.deepEqual(recovered.events, original.events);
  assert.deepEqual(recovered.error, original.error);
  assert.equal(recovered.stack, original.stack);
  if (allMemory) assert.equal(hash(recovered.data), hash(original.data));
  return {
    original: original,
    recovered: recovered,
  };
}

function workerFixture(data) {
  data.worker = data.malloc(20);
  data.bytes.fill(0, data.worker, data.worker + 20);
  data.set(data.worker + 16, 17);
}

test('actual captured startup, spawn, attack, defend and wheel packets enqueue and detach identically', async () => {
  assert.ok(realPackets.some(packet => packet.stage === 'spawn' && packet.bytes.length > 1e3));
  const { original: original } = await compare(
    async data => {
      workerFixture(data);
      data.receive = await data.attach(
        ['i32', 'i32', 'i32', 'i32'],
        [],
        (type, pointer, length, user) =>
          data.events.push([
            'receive',
            type,
            Array.from(data.bytes.slice(pointer, pointer + length)),
            user,
          ]),
      );
    },
    data => {
      for (const packet of realPackets) {
        const pointer = data.malloc(packet.bytes.length);
        data.bytes.set(packet.bytes, pointer);
        data.running.call(2348, pointer, packet.bytes.length, data.worker);
      }
      data.running.call(2348, 0, 100, data.worker);
      data.running.call(2348, 123, -1, data.worker);
      data.running.call(2346, data.worker, 99, data.receive);
    },
  );
  assert.ok(!original.error);
  assert.equal(original.events.filter(event => event[0] === 'receive').length, realPackets.length);
});

test('worker buffers cross 4096 byte and vector capacity boundaries without losing ownership', async () => {
  const { original: original } = await compare(
    async data => {
      workerFixture(data);
      data.pointer = data.malloc(9e3);
      for (let i = 0; i < 9e3; i++) data.bytes[data.pointer + i] = i & 255;
      data.receive = await data.attach(['i32', 'i32', 'i32', 'i32'], [], (type, pointer, length) =>
        data.events.push([
          type,
          length,
          createHash('sha256')
            .update(data.bytes.slice(pointer, pointer + length))
            .digest('hex'),
        ]),
      );
    },
    data => {
      for (const length of [1, 4096, 4097, 4098, 8194])
        data.running.call(2348, data.pointer, length, data.worker);
      // Force another growth from a valid 5-entry vector, rather than allocating 513 packets.
      data.set(data.worker + 8, 5);
      data.running.call(2348, data.pointer, 2, data.worker);
      data.running.call(2346, data.worker, 0, data.receive);
    },
  );
  assert.ok(!original.error);
});

test('detaching worker responses preserves packets queued reentrantly by its callback', async () => {
  const { original: original } = await compare(
    async data => {
      workerFixture(data);
      data.pointer = data.malloc(4);
      data.bytes.set([1, 8, 9, 10], data.pointer);
      data.queued = false;
      data.receive = await data.attach(
        ['i32', 'i32', 'i32', 'i32'],
        [],
        (type, pointer, length) => {
          data.events.push(['deliver', type, length]);
          if (!data.queued) {
            data.queued = true;
            data.running.call(2348, data.pointer, 4, data.worker);
          }
        },
      );
    },
    data => {
      data.running.call(2348, data.pointer, 4, data.worker);
      data.running.call(2346, data.worker, 0, data.receive);
      data.events.push(['pending', data.get(data.worker + 4)]);
      data.running.call(2346, data.worker, 0, data.receive);
    },
  );
  assert.ok(!original.error);
  assert.ok(original.events.some(event => event[0] === 'pending' && event[1] === 1));
});

test('single-player send and flush preserve worker ABI path, callback index and callback context', async () => {
  await compare(workerFixture, data => {
    data.running.call(2347, data.worker, 123, 456);
    data.running.call(2349, data.worker, 42.5);
  });
});

test('real snapshots decode through the restored frame bridge into original entity state before its renderer boundary', async () => {
  const { original: original, recovered: recovered } = await compare(
    data => {
      data.bytes[441368] = 1;
      data.runtime.call(1096);
      data.worker = data.get(7784368);
    },
    data => {
      // This minimal offline instance has no SDL window. The full snapshot decoder
      // still runs before func763 reaches its unavailable drawing context.
      for (const packet of realPackets) {
        const pointer = data.malloc(packet.bytes.length);
        data.bytes.set(packet.bytes, pointer);
        data.running.call(2348, pointer, packet.bytes.length, data.worker);
      }
      data.running.call(2339, 441400, 0, 16.7, 1920, 1080);
    },
  );
  assert.equal(original.error.name, 'RuntimeError');
  assert.equal(
    recovered.data.get(441408 + 2276),
    89,
    'captured final sequence reached entity state',
  );
  assert.equal(original.stack, recovered.stack);
});

test('type-5 event decoder preserves XOR, partial sequences and duplicate suppression', async () => {
  for (const pending of [0, 1])
    for (const sequences of [[0], [1], [1, 1, 2], [127, 128, 16384, 4294967295]]) {
      const { original: original } = await compare(
        data => {
          data.state = data.malloc(2600);
          data.bytes.fill(0, data.state, data.state + 2600);
          data.reader = data.malloc(16);
          const wire = [];
          for (let sequence of sequences) {
            do {
              const byte = sequence & 127;
              sequence >>>= 7;
              wire.push(byte | (sequence ? 128 : 0));
            } while (sequence);
            wire.push(0, 0);
          }
          data.packet = data.malloc(wire.length + pending);
          if (pending) data.bytes[data.packet] = 255;
          for (let index = 0; index < wire.length; index++)
            data.bytes[data.packet + pending + index] =
              wire[index] ^ data.bytes[32272 + (index & 255)];
          data.set(data.reader, data.packet);
          data.set(data.reader + 4, wire.length + pending);
          data.set(data.reader + 8, 0);
          data.set(data.reader + 12, pending);
        },
        data => data.running.call(1006, data.state, data.reader),
      );
      assert.ok(!original.error);
    }
});

test('entity-reference vector growth repairs empty and populated circular lists', async () => {
  for (const heap of [false, true]) {
    const { original: original } = await compare(
      data => {
        data.vector = data.malloc(12 + 64);
        const entries = heap ? data.malloc(64) : data.vector + 12;
        data.set(data.vector, 3);
        data.set(data.vector + 4, 4);
        data.set(data.vector + 8, heap ? entries : 0);
        for (let index = 0; index < 3; index++) {
          const entry = entries + index * 16,
            sentinel = entry + 4;
          data.set(entry, 100 + index);
          data.set(sentinel, index ? 1 : 0);
          if (index) {
            const node = data.malloc(12);
            data.set(entry + 8, node);
            data.set(entry + 12, node);
            data.set(node, 0);
            data.set(node + 4, sentinel);
            data.set(node + 8, sentinel);
          } else {
            data.set(entry + 8, sentinel);
            data.set(entry + 12, sentinel);
          }
        }
      },
      data => data.running.call(1011, data.vector, 70),
    );
    assert.ok(!original.error);
  }
});

test('snapshot canvas destructor removes cached renderer and handles unused contexts', async () => {
  for (const context of [-1, 19]) {
    const { original: original } = await compare(
      data => {
        data.cache = data.malloc(256);
        data.bytes.fill(0, data.cache, data.cache + 256);
        data.set(data.cache + 112, context);
        if (context !== -1) {
          data.set(441324, data.cache + 16);
          data.set(441320, 1);
        }
      },
      data => data.running.call(1013, data.cache),
    );
    assert.ok(!original.error);
  }
});

test('transport status predicates read original byte and optional connection state', async () => {
  await compare(
    data => {
      data.game = data.malloc(7343072);
      data.bytes.fill(0, data.game, data.game + 7343072);
      data.transport = data.malloc(108);
    },
    data => {
      for (const state of [0, 1, 2, 3]) {
        data.set(data.transport + 104, state);
        data.set(data.game + 7343004, data.transport);
        data.bytes[data.game + 7343001] = state;
        data.events.push([data.running.call(2400, data.game), data.running.call(2401, data.game)]);
      }
      data.set(data.game + 7343004, 0);
      data.events.push([data.running.call(2401, data.game)]);
    },
  );
});
