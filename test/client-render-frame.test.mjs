import test from "node:test";

import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";

import { createHash } from "node:crypto";

import wabtFactory from "wabt";

import { typedIndirectCall } from "../source/runtime/indirect.mjs";

import { loadOriginal } from "./helpers/wasm-probe.mjs";

import { makeReadableWat } from "../tools/lib/readable-wasm.mjs";

import { createRenderFrameHooks } from "../source/game/client/render-frame.mjs";

import { createRecoveredFunctions, recoveredFunctionPlan } from "../source/runtime/registry.mjs";

const functionIds = [ 763 ];

const originalBytes = await readFile(new URL("../web/client.wasm", import.meta.url));

const originalModule = new WebAssembly.Module(originalBytes);

const inventory = JSON.parse(await readFile(new URL("../reports/wasm/client-functions.json", import.meta.url)));

const names = inventory.find((row => row.id === 763)).directCalls;

const dependencies = [ ...names.map((name => inventory.find((row => row.name === name)).id)), 1096, 1015, 368, 392, 444, 556, 561, 818 ];

const packetTrace = JSON.parse(await readFile(new URL("../reports/runtime/client-packet-traces.json", import.meta.url)));

const packets = packetTrace.packets.filter((packet => packet.direction === "fromWorker" && packet.bytes[0] === 1));

const patchedModules = new Map;

async function getPatchedModule(combined) {
  if (patchedModules.has(combined)) return patchedModules.get(combined);
  const wabt = await wabtFactory();
  const wat = await readFile(new URL("../source/wasm/client.wat", import.meta.url), "utf8");
  const inventory = JSON.parse(await readFile(new URL("../reports/wasm/client-functions.json", import.meta.url)));
  const plan = combined ? recoveredFunctionPlan("client") : functionIds.map((id => ({
    id: id,
    source: "game/client/render-frame.mjs"
  })));
  const result = makeReadableWat(wat, inventory, plan);
  const parsed = wabt.parseWat("client-frame.wat", result.text);
  let patchedModule;
  try {
    patchedModule = new WebAssembly.Module(parsed.toBinary({}).buffer);
  } finally {
    parsed.destroy();
  }
  patchedModules.set(combined, patchedModule);
  return patchedModule;
}

async function scenario(recovered, setup, action, patchInternalCalls) {
  const events = [];
  const hostResults = {};
  const hookCalls = {};
  let runtime, hooks;
  function decodeAsmArguments(signature, pointer) {
    const bytes = new Uint8Array(runtime.memory.buffer), view = new DataView(runtime.memory.buffer);
    const values = [];
    pointer >>= 2;
    for (let type; type = bytes[signature++]; pointer++) {
      const double = type < 105;
      if (double && pointer & 1) pointer++;
      values.push(double ? view.getFloat64((pointer++ >> 1) * 8, true) : view.getInt32(pointer * 4, true));
    }
    return values;
  }
  const imports = {};
  for (const entry of WebAssembly.Module.imports(originalModule)) {
    (imports[entry.module] ??= {})[entry.name] = (...args) => {
      if (entry.module === "a" && (entry.name === "a" || entry.name === "c")) {
        const decoded = decodeAsmArguments(args[1], args[2]);
        events.push([ entry.module, entry.name, ...args, decoded ]);
        if (args[0] === 150328) return decoded[0] % decoded[1];
      } else events.push([ entry.module, entry.name, ...args ]);
      return hostResults[args[0]] ?? 0;
    };
  }
  imports.a.La = (count, size) => {
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(count >>> 0, 0, true);
    view.setUint32(size >>> 0, 0, true);
    events.push([ "a", "La", count, size ]);
    return 0;
  };
  imports.a.Oa = (fd, vectors, count, written) => {
    const view = new DataView(runtime.memory.buffer);
    let total = 0;
    for (let i = 0; i < count; i++) total += view.getUint32(vectors + i * 8 + 4, true);
    view.setUint32(written >>> 0, total, true);
    events.push([ "a", "Oa", fd, vectors, count, written ]);
    return 0;
  };
  if (recovered && patchInternalCalls) {
    const ids = patchInternalCalls === "all" ? recoveredFunctionPlan("client").map((entry => entry.id)) : functionIds;
    imports.readable = Object.fromEntries(ids.map((id => [ `f${id}`, (...args) => {
      hookCalls[id] = (hookCalls[id] ?? 0) + 1;
      return hooks[id](...args);
    } ])));
    const instance = new WebAssembly.Instance(await getPatchedModule(patchInternalCalls === "all"), imports);
    runtime = {
      instance: instance,
      get memory() {
        return instance.exports.__readable_memory;
      },
      get table() {
        return instance.exports.__readable_table;
      },
      get stackPointer() {
        return instance.exports.__stack_pointer;
      },
      call(id, ...args) {
        return instance.exports[`__fn${id}`](...args);
      },
      host(module, field, ...args) {
        return imports[module][field](...args);
      }
    };
  } else runtime = await loadOriginal("client", {
    functionIds: [ ...functionIds, ...dependencies ],
    imports: imports,
    construct: false
  });
  const originalCall = runtime.call.bind(runtime);
  const running = {
    get memory() {
      return runtime.memory;
    },
    get table() {
      return runtime.table;
    },
    get stackPointer() {
      return runtime.stackPointer;
    },
    host: runtime.host.bind(runtime),
    indirect(signature, index, ...args) {
      return typedIndirectCall(runtime.table, signature, index, ...args);
    },
    call(id, ...args) {
      return recovered && !patchInternalCalls && hooks[id] ? hooks[id](...args) : originalCall(id, ...args);
    }
  };
  hooks = patchInternalCalls === "all" ? createRecoveredFunctions("client", running) : createRenderFrameHooks(running);
  runtime.instance.exports.Nf();
  const data = {
    runtime: runtime,
    running: running,
    imports: imports,
    hostResults: hostResults,
    events: events,
    hookCalls: hookCalls,
    state: 441408,
    get bytes() {
      return new Uint8Array(runtime.memory.buffer);
    },
    get view() {
      return new DataView(runtime.memory.buffer);
    },
    get(address) {
      return this.view.getUint32(address, true);
    },
    put(address, value) {
      this.view.setUint32(address, value, true);
    },
    malloc(size) {
      return originalCall(368, size) >>> 0;
    },
    createRenderer() {
      const renderer = this.malloc(128);
      this.bytes.fill(0, renderer, renderer + 128);
      this.view.setFloat32(renderer, 1, true);
      this.view.setFloat32(renderer + 12, 1, true);
      this.view.setFloat64(renderer + 56, 1, true);
      return renderer;
    },
    activateSceneUi() {
      // The outer application frame initializes this active-scene view before
      // calling the game renderer (native client frame, WAT 317k region).
      // A direct 763 call bypasses that outer frame, so reproduce its writes.
      if (!(this.bytes[7931360] & 1) && originalCall(369, 7931360)) {
        originalCall(426);
        originalCall(370, 7931360);
      }
      for (const address of [ 7931248, 7931256, 7931264, 7931272, 7931280, 7931320 ]) this.view.setBigUint64(address, 0n, true);
      for (const address of [ 7931240, 7926872, 7931316, 7931312, 7931292, 7931340, 7931336, 7931332 ]) this.put(address, this.state);
      this.put(7931308, 1065353216);
      this.view.setBigUint64(7931300, 4575657221408423936n, true);
      for (const address of [ 7931244, 7926880, 7931296, 7931344 ]) this.bytes[address] = 0;
      this.put(7931288, 0);
      this.view.setUint16(7931328, 0, true);
      this.bytes[7931352] = 1;
    },
    entity(index = 0) {
      return this.state + 2928 + index * 448;
    },
    reader(bytes, pending = 0, cursor = 0, declaredLength) {
      const pointer = this.malloc(bytes.length + pending + 16), reader = this.malloc(16);
      this.bytes.fill(165, pointer, pointer + bytes.length + pending + 16);
      this.bytes.set(bytes, pointer + pending);
      this.put(reader, pointer);
      this.put(reader + 4, declaredLength ?? bytes.length + pending);
      this.put(reader + 8, cursor);
      this.put(reader + 12, pending);
      return reader;
    }
  };
  data.bytes[441368] = 1;
  originalCall(1096);
  await setup(data);
  const stackBefore = runtime.stackPointer.value;
  let error;
  try {
    await action(data);
  } catch (caught) {
    error = {
      name: caught.constructor.name,
      message: caught.message
    };
    data.errorStack = caught.stack;
  }
  return {
    data: data,
    events: events,
    error: error,
    stack: runtime.stackPointer.value - stackBefore,
    digest: createHash("sha256").update(data.bytes).digest("hex")
  };
}

async function compare(setup, action, patchInternalCalls = false) {
  const original = await scenario(false, setup, action, patchInternalCalls);
  const recovered = await scenario(true, setup, action, patchInternalCalls);
  assert.deepEqual(recovered.events, original.events, "host calls");
  assert.deepEqual(recovered.error, original.error, "exception");
  assert.equal(recovered.stack, original.stack, "stack");
  if (recovered.digest !== original.digest) {
    const differing = [], left = original.data.bytes, right = recovered.data.bytes;
    for (let i = 0; i < left.length && differing.length < 24; i++) if (right[i] !== left[i]) differing.push([ i, left[i], right[i] ]);
    assert.equal(recovered.digest, original.digest, `complete memory; first differences ${JSON.stringify(differing)}`);
  }
  return {
    original: original,
    recovered: recovered
  };
}

test("render frame matches empty-state original frame with and without a renderer", (async () => {
  for (const renderer of [ false, true ]) {
    const result = await compare((data => {
      data.renderer = renderer ? data.malloc(128) : 0;
      if (renderer) {
        data.bytes.fill(0, data.renderer, data.renderer + 128);
        data.view.setFloat32(data.renderer, 1, true);
        data.view.setFloat32(data.renderer + 12, 1, true);
      }
    }), (data => data.running.call(763, data.state - 8, data.renderer, 16.6666666667, 1280, 800)));
    assert.equal(result.original.error, undefined);
  }
}));

test("captured entities traverse the complete native and recovered render frame after every packet", (async () => {
  for (const elapsed of [ 1, 16.6666666667, 1e3 ]) {
    const {original: original, recovered: recovered} = await compare((data => {
      data.activateSceneUi();
      data.renderer = data.createRenderer();
      data.checkpoints = [];
    }), (data => {
      for (const packet of packets) {
        const reader = data.reader(Uint8Array.from(packet.bytes.slice(1)));
        data.running.call(1015, data.state, reader);
        data.running.call(763, data.state - 8, data.renderer, elapsed, 1280, 800);
        data.checkpoints.push({
          digest: createHash("sha256").update(data.bytes).digest("hex"),
          cursor: data.get(reader + 8),
          events: data.events.length
        });
      }
    }), elapsed === 1e3);
    assert.equal(original.error, undefined, original.data.errorStack);
    assert.equal(original.data.checkpoints.length, 15);
    assert.deepEqual(recovered.data.checkpoints, original.data.checkpoints);
  }
}));

test("render frame preserves keyboard, mouse and touch input records plus decoded drawing arguments", (async () => {
  const keys = [ 163849, 163892, 164077, 163850, 164073, 163866, 163863, 163861, 164388, 164372, 163852, 163928, 163855, 163927, 163874, 163930, 163870, 163929 ];
  for (const mode of [ "mouse", "keyboard", "touch" ]) {
    const {original: original, recovered: recovered} = await compare((data => {
      data.hostResults[133733] = mode === "touch" ? 1 : 0;
      data.hostResults[141314] = 1e3;
      data.activateSceneUi();
      data.renderer = data.createRenderer();
      data.checkpoints = [];
    }), (data => {
      for (const packet of packets) data.running.call(1015, data.state, data.reader(Uint8Array.from(packet.bytes.slice(1))));
      assert.ok(data.get(data.state + 256), "captured local-player handle");
      assert.equal(data.bytes[data.state + 1], 1, "active scene");
      data.running.call(763, data.state - 8, data.renderer, 16, 1280, 800);
      // Settings are now initialized by the native path. Exercise both input
      // schemes and edge commands with a growing reliable-record vector.
            data.bytes[151516] = mode === "keyboard" ? 1 : 0;
      data.bytes[data.state + 2] = 1;
      for (let frame = 0; frame < 12; frame++) {
        for (let i = 0; i < keys.length; i++) data.bytes[keys[i]] = frame >> i % 4 & 1;
        data.bytes[164372] = frame % 3 === 0 ? 1 : 0;
        data.put(163824, 640 + frame * 13);
        data.put(163828, 400 - frame * 11);
        data.view.setFloat32(7931320, frame / 12, true);
        data.view.setFloat32(7931324, frame * .3, true);
        data.bytes[7931328] = frame & 1;
        data.bytes[7931329] = frame >> 1 & 1;
        data.hostResults[141314] = 1e3 + frame * 40;
        data.running.call(763, data.state - 8, data.renderer, 40, 960 + frame * 4, 540 + frame * 2);
        data.checkpoints.push({
          digest: createHash("sha256").update(data.bytes).digest("hex"),
          pending: data.get(data.state + 2336),
          events: data.events.length
        });
      }
    }), mode === "touch");
    assert.equal(original.error, undefined, original.data.errorStack);
    assert.equal(original.data.checkpoints.length, 12);
    assert.ok(original.data.checkpoints.at(-1).pending > 1, "input was queued");
    assert.deepEqual(recovered.data.checkpoints, original.data.checkpoints);
    assert.ok(original.events.some((event => event[0] === "a" && event[1] === "a" && event[2] === 136414 && event.at(-1).length === 7)), "canvas transform parameters were captured");
    if (mode === "touch") assert.ok(recovered.data.hookCalls[763] > 0, "internal WASM call enters the recovered body");
  }
}));

test("render frame keeps native memory traps and stack state for missing scene state and invalid pointers", (async () => {
  for (const invalid of [ "missing-scene-ui", "invalid-game", "invalid-renderer" ]) {
    const {original: original} = await compare((data => {
      data.renderer = data.createRenderer();
      if (invalid !== "missing-scene-ui") data.activateSceneUi();
    }), (data => {
      if (invalid === "missing-scene-ui") {
        for (const packet of packets) data.running.call(1015, data.state, data.reader(Uint8Array.from(packet.bytes.slice(1))));
      }
      data.running.call(763, invalid === "invalid-game" ? -8 : data.state - 8, invalid === "invalid-renderer" ? -8 : data.renderer, 16, 1280, 800);
    }), true);
    assert.deepEqual(original.error, {
      name: "RuntimeError",
      message: "memory access out of bounds"
    });
  }
}));

test("all active client replacements jointly decode scenes, queue inputs and render frames plus a changing label", (async () => {
  const {original: original, recovered: recovered} = await compare((data => {
    data.hostResults[141314] = 2e3;
    data.hostResults[139312] = 1;
    data.hostResults[138505] = 137.625;
    data.activateSceneUi();
    if (!(data.bytes[151560] & 1) && data.running.call(369, 151560)) {
      data.running.call(521);
      data.running.call(370, 151560);
    }
    // Enable the actual cursor-guide setting so the native frame executes its
    // path-line pass along with the rectangle and arena-band helpers.
    data.bytes[151504] = 1;
    data.bytes[151516] = 0;
    data.put(163824, 900);
    data.put(163828, 200);
    data.renderer = data.createRenderer();
    data.label = data.malloc(160);
    data.bytes.fill(0, data.label, data.label + 160);
    const color = data.malloc(4);
    data.put(color, 0xffffffff);
    data.running.call(818, data.label + 8, color);
    data.bytes[data.label] = 1;
    data.view.setFloat32(data.label + 144, .1, true);
    data.view.setFloat32(data.label + 148, 24, true);
    data.labelSource = data.malloc(12);
    data.bytes.fill(0, data.labelSource, data.labelSource + 12);
    data.bytes.set(new TextEncoder().encode('Label 00'), data.labelSource);
    data.bytes[data.labelSource + 11] = 8;
    data.checkpoints = [];
  }), (data => {
    let frame = 0;
    for (const packet of packets) {
      const reader = data.reader(Uint8Array.from(packet.bytes.slice(1)));
      data.running.call(1015, data.state, reader);
      data.hostResults[141314] += 40;
      data.bytes[163849] = frame & 1;
      data.bytes[164077] = frame >> 1 & 1;
      data.bytes[164372] = frame % 5 === 0 ? 1 : 0;
      data.running.call(763, data.state - 8, data.renderer, 40, 1280, 800);
      // The retained capture has no guaranteed name-label component. Render a
      // changing label through the same complete active registry explicitly.
      data.bytes[data.labelSource + 6] = 48 + Math.floor(frame / 10);
      data.bytes[data.labelSource + 7] = 48 + frame % 10;
      data.running.call(556, data.label, data.labelSource);
      data.running.call(444, data.label, data.renderer);
      data.running.call(392, data.label, data.renderer, 640, 40, 1);
      data.checkpoints.push({
        digest: createHash("sha256").update(data.bytes).digest("hex"),
        cursor: data.get(reader + 8),
        events: data.events.length
      });
      frame++;
    }
  }), "all");
  assert.equal(original.error, undefined, original.data.errorStack);
  assert.equal(original.data.checkpoints.length, 15);
  assert.deepEqual(recovered.data.checkpoints, original.data.checkpoints);
  for (const id of [ 1096, 763, 1015, 1008, 409, 672, 410, 562, 588, 392, 556, 444 ]) assert.ok(recovered.data.hookCalls[id], `recovered function ${id} executed`);
}));
