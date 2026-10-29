import test from "node:test";

import assert from "node:assert/strict";

import { loadOriginal } from "./helpers/wasm-probe.mjs";

import { createClientClockHooks, functionIds } from "../source/game/client/clock.mjs";

async function oracle() {
  let runtime, now = 1234.56789, valid = 1, throwAt = 0;
  const events = [];
  function host(address, signature, pointer) {
    events.push({
      address: address,
      signature: signature,
      pointer: pointer,
      bytes: Buffer.from(new Uint8Array(runtime.memory.buffer, pointer, 16)).toString("hex")
    });
    if (throwAt === events.length) throw new Error("clock failure");
    return address === 141250 ? valid : now;
  }
  runtime = await loadOriginal("client", {
    functionIds: [ ...functionIds, 368 ],
    imports: {
      a: {
        a: host,
        c: host
      }
    }
  });
  const bytes = Buffer.from(runtime.memory.buffer), view = new DataView(runtime.memory.buffer), hooks = createClientClockHooks(runtime);
  const word = (a, v) => view.setUint32(a, v, true), double = (a, v) => view.setFloat64(a, v, true);
  const allocate = n => runtime.call(368, n), capture = () => ({
    memory: Buffer.from(bytes),
    stack: runtime.stackPointer.value
  });
  const restore = s => {
    bytes.set(s.memory);
    runtime.stackPointer.value = s.stack;
  };
  function compare(id, args, label) {
    const before = capture();
    events.length = 0;
    let expectedReturn, expectedError, actualReturn, actualError;
    try {
      expectedReturn = runtime.call(id, ...args);
    } catch (e) {
      expectedError = [ e.constructor.name, e.message ];
    }
    const expected = capture(), expectedEvents = structuredClone(events);
    restore(before);
    events.length = 0;
    try {
      actualReturn = hooks[id](...args);
    } catch (e) {
      actualError = [ e.constructor.name, e.message ];
    }
    assert.equal(actualReturn, expectedReturn, `${label}: result`);
    assert.deepEqual(actualError, expectedError, `${label}: error`);
    assert.deepEqual(events, expectedEvents, `${label}: host`);
    assert.equal(runtime.stackPointer.value, expected.stack, `${label}: stack`);
    if (!bytes.equals(expected.memory)) {
      const diff = [];
      for (let i = 0; i < bytes.length && diff.length < 20; i++) if (bytes[i] !== expected.memory[i]) diff.push({
        at: i,
        original: expected.memory[i],
        recovered: bytes[i]
      });
      assert.fail(`${label}: memory ${JSON.stringify(diff)}`);
    }
  }
  return {
    runtime: runtime,
    bytes: bytes,
    view: view,
    word: word,
    double: double,
    allocate: allocate,
    capture: capture,
    restore: restore,
    compare: compare,
    configure: (clockValid, clockNow, throws = 0) => {
      valid = clockValid;
      now = clockNow;
      throwAt = throws;
    }
  };
}

test("client initializer guards preserve every state byte, recursive traps and complete scratch writes", (async () => {
  const o = await oracle(), {bytes: bytes, allocate: allocate, compare: compare, capture: capture, restore: restore} = o, guard = allocate(8), initial = capture();
  for (const first of [ 0, 1, 2, 255 ]) for (let second = 0; second < 256; second++) {
    restore(initial);
    bytes[guard] = first;
    bytes[guard + 1] = second;
    compare(369, [ guard ], `acquire ${first}/${second}`);
  }
  for (const first of [ 0, 1, 2, 255 ]) for (const second of [ 0, 1, 2, 3, 4, 255 ]) {
    restore(initial);
    bytes[guard] = first;
    bytes[guard + 1] = second;
    compare(370, [ guard ], `release ${first}/${second}`);
  }
}));

test("client clock cold/warm initialization, override, clock kind and nonfinite timestamps match", (async () => {
  const o = await oracle(), {bytes: bytes, word: word, double: double, allocate: allocate, compare: compare, capture: capture, restore: restore, configure: configure} = o, output = allocate(16), initial = capture();
  for (let initialized = 0; initialized < 8; initialized++) for (const override of [ 0, 1 ]) for (const valid of [ 0, 1, undefined ]) for (const now of [ 0, 1234.56789, Infinity, NaN ]) {
    restore(initial);
    [ 7910224, 7910220, 7922328 ].forEach(((guard, i) => {
      bytes[guard] = initialized >>> i & 1;
      bytes[guard + 1] = initialized >>> i & 1;
    }));
    bytes[7910216] = 7;
    bytes[7922312] = override;
    word(7922316, 305419896);
    double(7922320, -45.25);
    configure(valid, now);
    compare(372, [ output ], `read initialized=${initialized},override=${override},valid=${valid},now=${now}`);
  }
}));

test("client elapsed time preserves origin initialization and both infinity sentinels", (async () => {
  const o = await oracle(), {bytes: bytes, double: double, allocate: allocate, compare: compare, capture: capture, restore: restore, configure: configure} = o, timestamp = allocate(16), initial = capture();
  for (let initialized = 0; initialized < 4; initialized++) for (const timestampValid of [ 0, 1 ]) for (const originValid of [ 0, 1 ]) for (const time of [ 0, -1, 1234.5, Infinity, NaN ]) for (const now of [ 0, 500.25 ]) {
    restore(initial);
    [ 7910224, 7910220 ].forEach(((guard, i) => {
      bytes[guard] = initialized >>> i & 1;
      bytes[guard + 1] = initialized >>> i & 1;
    }));
    bytes[7910216] = initialized & 1;
    bytes[7948184] = originValid;
    double(7948192, -125.5);
    bytes[timestamp] = timestampValid;
    double(timestamp + 8, time);
    configure(1, now);
    compare(554, [ timestamp ], `elapsed initialized=${initialized},timestampValid=${timestampValid},originValid=${originValid},time=${time},now=${now}`);
  }
}));

test("client elapsed and guard aliases preserve partial stack writes and host failures", (async () => {
  const o = await oracle(), {runtime: runtime, bytes: bytes, allocate: allocate, compare: compare, capture: capture, restore: restore, configure: configure} = o, timestamp = allocate(16), initial = capture();
  for (const guard of [ 7910224, 7910220 ]) {
    restore(initial);
    bytes[guard] = 0;
    bytes[guard + 1] = 2;
    compare(554, [ timestamp ], `elapsed pending guard ${guard}`);
  }
  for (const throws of [ 1, 2 ]) {
    restore(initial);
    for (const guard of [ 7910224, 7910220 ]) {
      bytes[guard] = 0;
      bytes[guard + 1] = 0;
    }
    configure(1, 1e3, throws);
    compare(554, [ timestamp ], `elapsed host failure ${throws}`);
  }
  configure(1, 1e3);
  for (const pointer of [ bytes.length - 4, -1 ]) {
    restore(initial);
    if (pointer >= 0) bytes[pointer] = 1;
    compare(554, [ pointer ], `elapsed pointer ${pointer}`);
  }
  for (const offset of [ -64, -48, -32, -16, -8 ]) for (const id of [ 369, 370, 372, 554 ]) {
    restore(initial);
    compare(id, [ runtime.stackPointer.value + offset ], `stack overlap func${id}/${offset}`);
  }
}));

test("client clock retains host failures, recursive static initialization and output access traps", (async () => {
  const o = await oracle(), {bytes: bytes, allocate: allocate, compare: compare, capture: capture, restore: restore, configure: configure} = o, output = allocate(16), initial = capture();
  for (const guard of [ 7910224, 7910220, 7922328 ]) {
    restore(initial);
    bytes[guard] = 0;
    bytes[guard + 1] = 2;
    compare(372, [ output ], `pending guard ${guard}`);
  }
  for (const throws of [ 1, 2, 3 ]) {
    restore(initial);
    for (const guard of [ 7910224, 7910220, 7922328 ]) {
      bytes[guard] = 0;
      bytes[guard + 1] = 0;
    }
    configure(1, 1e3, throws);
    compare(372, [ output ], `host failure ${throws}`);
  }
  configure(1, 1e3);
  for (const [id, args] of [ [ 372, [ bytes.length - 8 ] ], [ 372, [ -1 ] ], [ 370, [ bytes.length - 1 ] ], [ 369, [ bytes.length ] ] ]) {
    restore(initial);
    compare(id, args, `func${id} invalid pointer`);
  }
}));
