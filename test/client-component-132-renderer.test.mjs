import test from "node:test";

import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";

import { createHash } from "node:crypto";

import wabtFactory from "wabt";

import { typedIndirectCall } from "../source/runtime/indirect.mjs";

import { loadOriginal } from "./helpers/wasm-probe.mjs";

import { makeReadableWat } from "../tools/lib/readable-wasm.mjs";

import { createComponent132RendererHooks } from "../source/game/client/component-132-renderer.mjs";

import { createRecoveredFunctions, recoveredFunctionPlan } from "../source/runtime/registry.mjs";

const functionIds = [ 1040 ];

const originalBytes = await readFile(new URL("../web/client.wasm", import.meta.url));

const originalModule = new WebAssembly.Module(originalBytes);

const inventory = JSON.parse(await readFile(new URL("../reports/wasm/client-functions.json", import.meta.url)));

const names = inventory.find((row => row.id === 1040)).directCalls;

const dependencies = [ ...names.map((name => inventory.find((row => row.name === name)).id)), 1096, 1015, 368, 392, 444, 556, 561, 818, 763, 1008, 426, 760, 369, 370 ];

const packetTrace = JSON.parse(await readFile(new URL("../reports/runtime/client-packet-traces.json", import.meta.url)));

const packets = packetTrace.packets.filter((packet => packet.direction === "fromWorker" && packet.bytes[0] === 1));

const patchedModules = new Map;

async function getPatchedModule(combined) {
  if (patchedModules.has(combined)) return patchedModules.get(combined);
  const wabt = await wabtFactory();
  const wat = await readFile(new URL("../source/wasm/client.wat", import.meta.url), "utf8");
  const inventory = JSON.parse(await readFile(new URL("../reports/wasm/client-functions.json", import.meta.url)));
  const plan = combined ? [...recoveredFunctionPlan("client").filter(entry => !functionIds.includes(entry.id)), ...functionIds.map(id => ({id,source:"game/client/component-132-renderer.mjs"}))] : functionIds.map((id => ({
    id: id,
    source: "game/client/component-132-renderer.mjs"
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
  let runtime, hooks, hostObserver;
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
        events.push([ entry.module, entry.name, ...args, decoded, Array.from(new Uint8Array(runtime.memory.buffer, args[2] >>> 0, Math.min(80, runtime.memory.buffer.byteLength - (args[2] >>> 0)))) ]);
        if (hostObserver) hostObserver({runtime, args, decoded, hostResults});
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
    const ids = patchInternalCalls === "all" ? [...new Set([...recoveredFunctionPlan("client").map(entry => entry.id),...functionIds])] : functionIds;
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
  hooks = patchInternalCalls === "all" ? {...createRecoveredFunctions("client", running), ...createComponent132RendererHooks(running)} : createComponent132RendererHooks(running);
  runtime.instance.exports.Nf();
  const data = {
    runtime: runtime,
    running: running,
    imports: imports,
    hostResults: hostResults,
    observeHost(callback) { hostObserver = callback; },
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

const renderSlots = [108,68,152,76,92,84,88,148,104,128,124,132,96,60,64,80];

async function prepareComponentScene(data) {
  data.hostResults[139312]=1;data.hostResults[138505]=137.625;data.hostResults[141314]=2000;
  data.activateSceneUi();data.renderer=data.createRenderer();
  for(const packet of packets)data.running.call(1015,data.state,data.reader(Uint8Array.from(packet.bytes.slice(1))));
  data.running.call(763,data.state-8,data.renderer,40,1280,800);
  // Allocate through the game's real constructors, including its pool defaults.
  // This unused entity lies in the initialized 16384-slot entity storage.
  data.drawable=data.entity(16000);data.put(data.drawable,data.state);data.put(data.drawable+16,16000);
  data.running.call(1008,data.drawable,data.reader(Uint8Array.of(255,255,255,255)),1);
  data.componentPointers=Object.fromEntries(renderSlots.map(offset=>[offset,data.get(data.drawable+offset)]));
  data.bytes[data.componentPointers[76]+8]=1;
  for(const offset of renderSlots)data.put(data.drawable+offset,0);
  data.checkpoints=[];
}

function checkpoint(data,label) {
  data.checkpoints.push({label,digest:createHash('sha256').update(data.bytes).digest('hex'),events:data.events.length});
}


function setMatrix(data, values) {
  values.forEach((value, index) => data.view.setFloat32(data.renderer + index * 4, value, true));
}
function drawDirect(data) {
  data.running.call(1040, data.componentPointers[132], data.renderer);
}
function drawViaEntity(data) {
  data.running.call(760, data.state + 2144, data.renderer, data.drawable, 40);
}

test('component132 complete body matches the real constructed component and all host arguments', async () => {
  for (const patch of [false, true, 'all']) {
    const {original,recovered} = await compare(prepareComponentScene, data => {
      data.put(data.drawable + 132, data.componentPointers[132]);
      for (let iteration = 0; iteration < 3; iteration++) {
        (patch ? drawViaEntity : drawDirect)(data);
        checkpoint(data, iteration);
      }
    }, patch);
    assert.equal(original.error, undefined, original.data.errorStack);
    assert.equal(original.data.checkpoints.length, 3);
    assert.deepEqual(recovered.data.checkpoints, original.data.checkpoints);
    if (patch) assert.ok(recovered.data.hookCalls[1040] >= 3);
  }
});

test('component132 preserves hit colors, the 150ms transition and grayscale across affine states', async () => {
  const {original,recovered} = await compare(prepareComponentScene, data => {
    const visual = data.get(data.drawable + 136);
    for (const timestamp of [-Infinity, 0, 1849.999, 1850, 1850.001, 1900, 1984.999, 1985, 1985.001, 2000, 2100, Infinity, NaN]) {
      for (const gray of [0,1]) for (const active of [0,1]) {
        data.bytes[visual + 56] = active;
        data.view.setFloat64(visual + 64, timestamp, true);
        data.bytes[data.renderer + 69] = gray;
        data.bytes[data.renderer + 49] = active;
        data.bytes[data.renderer + 50] = gray;
        setMatrix(data, [1,.2,-.4,.8,10,-20]);
        drawDirect(data); checkpoint(data, [timestamp,gray,active]);
      }
    }
    data.put(data.componentPointers[132], 0);
    for (const gray of [0,1]) {
      data.bytes[data.renderer + 69] = gray;
      drawDirect(data); checkpoint(data, ['no-owner',gray]);
    }
  }, true);
  assert.equal(original.error, undefined, original.data.errorStack);
  assert.equal(original.data.checkpoints.length, 54);
  assert.deepEqual(recovered.data.checkpoints, original.data.checkpoints);
});

test('component132 preserves signed-zero and non-finite affine multiplication', async () => {
  const {original,recovered} = await compare(prepareComponentScene, data => {
    for (const value of [0,-0,Math.fround(1/3),-1,Infinity,-Infinity,NaN,3.4028234663852886e38,1.401298464324817e-45]) {
      for (let lane = 0; lane < 6; lane++) {
        const matrix = [1,0,0,1,0,0]; matrix[lane] = value;
        setMatrix(data, matrix); drawDirect(data); checkpoint(data, [value,lane]);
      }
    }
  }, false);
  assert.equal(original.error, undefined, original.data.errorStack);
  assert.equal(original.data.checkpoints.length,54);
  assert.deepEqual(recovered.data.checkpoints, original.data.checkpoints);
});

test('component132 observes host mutations between colors, paths and cached transforms', async () => {
  const {original,recovered} = await compare(prepareComponentScene, data => {
    const visual = data.get(data.drawable + 136);
    data.bytes[visual + 56] = 1;
    data.view.setFloat64(visual + 64, 2000, true);
    let calls = 0;
    data.observeHost(({args}) => {
      calls++;
      data.bytes[data.renderer + 69] ^= 1;
      data.bytes[data.renderer + 48] = 1;
      data.view.setFloat32(data.renderer + 16, Math.fround(calls / 3), true);
      // Preserve clock caching but mutate the visual flag between palette reads.
      if (args[0] === 136414) data.bytes[visual + 56] ^= 1;
    });
    drawDirect(data); checkpoint(data,'host-mutations');
    assert.ok(calls > 30);
  }, true);
  assert.equal(original.error, undefined, original.data.errorStack);
  assert.deepEqual(recovered.data.checkpoints, original.data.checkpoints);
});

test('component132 retains pointer and host-exception failure state', async () => {
  for (const failure of ['component','renderer','owner','visual','line-width','ellipse','quadratic']) {
    const {original} = await compare(prepareComponentScene, data => {
      if (failure === 'owner') data.put(data.componentPointers[132], -8);
      if (failure === 'visual') data.put(data.drawable + 136, -8);
      const target = {'line-width':138111,ellipse:138047,quadratic:137880}[failure];
      if (target) data.observeHost(({args}) => { if (args[0] === target) throw new Error('injected canvas failure'); });
      data.running.call(1040, failure === 'component' ? -4 : data.componentPointers[132], failure === 'renderer' ? -8 : data.renderer);
    }, true);
    assert.ok(original.error, failure);
    assert.ok(original.stack < 0, `scratch remains allocated after ${failure}`);
  }
});

test('component132 re-reads hit flags and clock output between every palette sample', async () => {
  for (let clearAt = 1; clearAt <= 7; clearAt++) {
    const {original,recovered} = await compare(prepareComponentScene, data => {
      const visual = data.get(data.drawable + 136);
      data.bytes[visual + 56] = 1;
      data.view.setFloat64(visual + 64, 2000, true);
      data.bytes[7922312] = 0; // use host time for each original372 call
      let samples = 0;
      data.observeHost(({args}) => {
        if (args[0] !== 141314) return;
        samples++;
        data.bytes[visual + 56] = samples >= clearAt ? 0 : 1;
        data.hostResults[141314] = [2000,1985,2100,Infinity,NaN,-Infinity][(samples - 1) % 6];
      });
      drawDirect(data); checkpoint(data,clearAt);
      data.samples = samples;
    }, clearAt === 7 ? 'all' : true);
    assert.equal(original.error,undefined,original.data.errorStack);
    assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
    assert.equal(recovered.data.samples,original.data.samples);
    assert.ok(original.data.samples >= 1);
  }
});

test('component132 preserves scratch-alias writes and callback failures in clock reads', async () => {
  for (const overlap of [0,16,848,1648,1672,1676]) {
    const {original} = await compare(prepareComponentScene,data => {
      const scratch = data.runtime.stackPointer.value - 1744;
      data.put(scratch + overlap, data.drawable);
      data.running.call(1040,scratch + overlap,data.renderer);
    },true);
    assert.equal(original.error,undefined,original.data.errorStack);
  }
  const {original} = await compare(prepareComponentScene,data => {
    const visual = data.get(data.drawable + 136);
    data.bytes[visual + 56] = 1;
    data.bytes[7922312] = 0;
    data.observeHost(({args}) => { if(args[0] === 141314) throw new Error('clock callback failure'); });
    drawDirect(data);
  },true);
  assert.equal(original.error?.message,'clock callback failure');
  assert.equal(original.stack,-1808);
});
