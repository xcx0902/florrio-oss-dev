import test from "node:test";

import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";

import { createHash } from "node:crypto";

import wabtFactory from "wabt";

import { typedIndirectCall } from "../source/runtime/indirect.mjs";

import { loadOriginal } from "./helpers/wasm-probe.mjs";

import { makeReadableWat } from "../tools/lib/readable-wasm.mjs";

import { createEntityRendererHooks } from "../source/game/client/entity-renderer.mjs";

import { createRecoveredFunctions, recoveredFunctionPlan } from "../source/runtime/registry.mjs";

const functionIds = [ 760 ];

const originalBytes = await readFile(new URL("../web/client.wasm", import.meta.url));

const originalModule = new WebAssembly.Module(originalBytes);

const inventory = JSON.parse(await readFile(new URL("../reports/wasm/client-functions.json", import.meta.url)));

const names = inventory.find((row => row.id === 760)).directCalls;

const dependencies = [ ...names.map((name => inventory.find((row => row.name === name)).id)), 1096, 1015, 368, 392, 444, 556, 561, 818, 763, 1008, 426 ];

const packetTrace = JSON.parse(await readFile(new URL("../reports/runtime/client-packet-traces.json", import.meta.url)));

const packets = packetTrace.packets.filter((packet => packet.direction === "fromWorker" && packet.bytes[0] === 1));

const patchedModules = new Map;

async function getPatchedModule(combined) {
  if (patchedModules.has(combined)) return patchedModules.get(combined);
  const wabt = await wabtFactory();
  const wat = await readFile(new URL("../source/wasm/client.wat", import.meta.url), "utf8");
  const inventory = JSON.parse(await readFile(new URL("../reports/wasm/client-functions.json", import.meta.url)));
  const plan = combined ? [...recoveredFunctionPlan("client").filter(entry => !functionIds.includes(entry.id)), ...functionIds.map(id => ({id,source:"game/client/entity-renderer.mjs"}))] : functionIds.map((id => ({
    id: id,
    source: "game/client/entity-renderer.mjs"
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
  hooks = patchInternalCalls === "all" ? {...createRecoveredFunctions("client", running), ...createEntityRendererHooks(running)} : createEntityRendererHooks(running);
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

test('entity renderer matches original complete frames for every captured snapshot',async()=>{
  for(const delta of[1,16.6666666667,1000]){
    const{original,recovered}=await compare(data=>{
      data.activateSceneUi();data.renderer=data.createRenderer();data.checkpoints=[];
    },data=>{
      for(const packet of packets){
        const reader=data.reader(Uint8Array.from(packet.bytes.slice(1)));
        data.running.call(1015,data.state,reader);
        data.running.call(763,data.state-8,data.renderer,delta,1280,800);
        data.checkpoints.push({digest:createHash('sha256').update(data.bytes).digest('hex'),events:data.events.length});
      }
    },delta===1000);
    assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,15);assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
  }
});

test('entity renderer composes with every other active client source body',async()=>{
  const{original,recovered}=await compare(data=>{
    data.hostResults[139312]=1;data.hostResults[138505]=137.625;data.hostResults[141314]=2000;
    data.activateSceneUi();data.renderer=data.createRenderer();data.checkpoints=[];
  },data=>{
    for(const packet of packets){
      data.running.call(1015,data.state,data.reader(Uint8Array.from(packet.bytes.slice(1))));
      data.hostResults[141314]+=40;
      data.running.call(763,data.state-8,data.renderer,40,1280,800);
      data.checkpoints.push({digest:createHash('sha256').update(data.bytes).digest('hex'),events:data.events.length});
    }
  },'all');
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,15);assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);assert.ok(recovered.data.hookCalls[760]>0);
});

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

test('entity renderer matches every component dispatch branch and its priority',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    for(const offset of renderSlots){
      data.put(data.drawable+offset,data.componentPointers[offset]);
      const eventCount=data.events.length;
      data.running.call(760,data.state+2144,data.renderer,data.drawable,40);
      assert.ok(data.events.length>eventCount,`render component ${offset} executes`);
      checkpoint(data,offset);
      data.put(data.drawable+offset,0);
    }
    for(const offset of renderSlots)data.put(data.drawable+offset,data.componentPointers[offset]);
    data.running.call(760,data.state+2144,data.renderer,data.drawable,40);checkpoint(data,'priority');
  },true);
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,17);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});

test('entity renderer retains viewport margins and the exact culling boundary',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    data.put(data.drawable+108,data.componentPointers[108]);
    const camera=data.state+2144,bounds=data.get(data.drawable+140);
    const left=Math.fround(data.view.getFloat32(camera+28,true)-100),top=Math.fround(data.view.getFloat32(camera+32,true)-100);
    const right=Math.fround(left+Math.fround(data.view.getFloat32(camera+36,true)+200));
    const bottom=Math.fround(top+Math.fround(data.view.getFloat32(camera+40,true)+200));
    const middleX=(left+right)/2,middleY=(top+bottom)/2;
    const cases=[[left-1,middleY,true],[left,middleY,false],[right,middleY,false],[right+1,middleY,true],[middleX,top-1,true],[middleX,top,false],[middleX,bottom,false],[middleX,bottom+1,true]];
    data.bytes[bounds+36]=1;
    for(const [x,y,culled] of cases){
      for(const [offset,value] of [[40,x],[44,y],[48,0],[52,0]])data.view.setFloat32(bounds+offset,value,true);
      const eventCount=data.events.length;
      data.running.call(760,camera,data.renderer,data.drawable,16);
      assert.equal(data.events.length===eventCount,culled,`culling at ${x},${y}`);checkpoint(data,[x,y]);
    }
  },true);
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,8);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});

test('entity renderer retains fade, hit-flash, grayscale, and affine drawing state',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    const visual=data.get(data.drawable+136),bounds=data.get(data.drawable+140);
    data.bytes[bounds+36]=1;
    for(const [offset,value] of [[40,0],[44,0],[48,0],[52,0]])data.view.setFloat32(bounds+offset,value,true);
    for(const offset of [108,68,152,76,92]){
      data.put(data.drawable+offset,data.componentPointers[offset]);
      for(const timestamp of [-Infinity,0,2000,Infinity,NaN])for(const mode of [0,1,2]){
        data.bytes[visual+56]=1;data.view.setFloat64(visual+64,timestamp,true);
        data.bytes[visual+8]=mode?1:0;data.bytes[visual+16]=mode===2?1:0;data.bytes[visual+40]=0;
        data.bytes[data.renderer+69]=mode&1;
        for(const [index,value] of [1,.2,-.4,.8,10,-20].entries())data.view.setFloat32(data.renderer+index*4,value,true);
        data.running.call(760,data.state+2144,data.renderer,data.drawable,40);checkpoint(data,[offset,timestamp,mode]);
      }
      data.put(data.drawable+offset,0);
    }
  },'all');
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,75);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});

test('entity renderer preserves memory and stack when pointers or petal factories trap',async()=>{
  for(const failure of ['camera','renderer','entity','petal-type-zero','petal-type-39']){
    const {original}=await compare(prepareComponentScene,data=>{
      data.put(data.drawable+76,data.componentPointers[76]);
      if(failure.startsWith('petal-type'))data.bytes[data.componentPointers[76]+8]=failure.endsWith('39')?39:0;
      data.running.call(760,failure==='camera'?-1:data.state+2144,failure==='renderer'?-8:data.renderer,failure==='entity'?-8:data.drawable,40);
    },true);
    assert.equal(original.error?.name,'RuntimeError',failure);
  }
});

test('entity renderer constructs, binds, and reuses each of the 38 catalog petal renderers',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    const component=data.componentPointers[76];data.put(data.drawable+76,component);
    for(let type=1;type<=38;type++){
      data.bytes[component+8]=type;data.put(component+20,0);
      for(const delta of [1,40,1000]){
        data.running.call(760,data.state+2144,data.renderer,data.drawable,delta);
        assert.ok(data.get(component+20),`petal ${type} has a renderer`);checkpoint(data,[type,delta]);
      }
    }
  },'all');
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,114);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});
