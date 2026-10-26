import test from "node:test";

import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";

import { createHash } from "node:crypto";

import wabtFactory from "wabt";

import { typedIndirectCall } from "../source/runtime/indirect.mjs";

import { loadOriginal } from "./helpers/wasm-probe.mjs";

import { makeReadableWat } from "../tools/lib/readable-wasm.mjs";

import { createComponents6480RendererHooks } from "../source/game/client/components-64-80-renderer.mjs";

import { createRecoveredFunctions, recoveredFunctionPlan } from "../source/runtime/registry.mjs";

const functionIds = [ 1038, 1039 ];

const originalBytes = await readFile(new URL("../web/client.wasm", import.meta.url));

const originalModule = new WebAssembly.Module(originalBytes);

const inventory = JSON.parse(await readFile(new URL("../reports/wasm/client-functions.json", import.meta.url)));

const names = [...new Set(functionIds.flatMap(id => inventory.find(row => row.id === id).directCalls))];

const dependencies = [ ...names.map((name => inventory.find((row => row.name === name)).id)), 1096, 1015, 368, 392, 444, 556, 561, 818, 763, 1008, 426, 760, 369, 370 ];

const packetTrace = JSON.parse(await readFile(new URL("../reports/runtime/client-packet-traces.json", import.meta.url)));

const packets = packetTrace.packets.filter((packet => packet.direction === "fromWorker" && packet.bytes[0] === 1));

const patchedModules = new Map;

async function getPatchedModule(combined) {
  if (patchedModules.has(combined)) return patchedModules.get(combined);
  const wabt = await wabtFactory();
  const wat = await readFile(new URL("../source/wasm/client.wat", import.meta.url), "utf8");
  const inventory = JSON.parse(await readFile(new URL("../reports/wasm/client-functions.json", import.meta.url)));
  const plan = combined ? [...recoveredFunctionPlan("client").filter(entry => !functionIds.includes(entry.id)), ...functionIds.map(id => ({id,source:"game/client/components-64-80-renderer.mjs"}))] : functionIds.map((id => ({
    id: id,
    source: "game/client/components-64-80-renderer.mjs"
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
  hooks = patchInternalCalls === "all" ? {...createRecoveredFunctions("client", running), ...createComponents6480RendererHooks(running)} : createComponents6480RendererHooks(running);
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

function drawDirect(data,slot,elapsed=40,component) {
  data.running.call(slot===64?1038:1039,component??data.componentPointers[slot],data.renderer,...(slot===64?[elapsed]:[]));
}
function drawViaEntity(data,elapsed=40) {
  data.running.call(760,data.state+2144,data.renderer,data.drawable,elapsed);
}

test('components64/80 preserve actual construction, native entity dispatch and all active source composition',async()=>{
  for(const slot of [64,80])for(const patch of [false,true,'all']){
    const {original,recovered}=await compare(prepareComponentScene,data=>{
      data.put(data.drawable+slot,data.componentPointers[slot]);
      for(const elapsed of [1,40,1000]){
        if(patch)drawViaEntity(data,elapsed);else drawDirect(data,slot,elapsed);
        checkpoint(data,[slot,elapsed]);
      }
    },patch);
    assert.equal(original.error,undefined,original.data.errorStack);
    assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
    assert.equal(original.data.checkpoints.length,3);
    if(patch)assert.ok(recovered.data.hookCalls[slot===64?1038:1039]>=3);
  }
});

test('component64 retains world-position sampling, first update and smoothed or exact speed',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    const component=data.componentPointers[64],transform=data.get(data.drawable+120);
    data.bytes[transform+144]=1;
    const cases=[
      [0,0,0,0,0,0,40],[1,0,0,0,0,0,40],[1,3,4,0,0,0,1],
      [1,3,4,0,0,5,1],[1,3,4,0,0,5.0000001,1],[1,-1000,1000,0,0,-3,1000],
      [1,0,0,30,-40,2,16.666667],[1,0,0,0,0,1,1e-30],
      [1,0,0,0,0,1,0],[1,0,0,0,0,1,-1],
      [1,Infinity,0,0,0,1,40],[1,NaN,0,0,0,1,40],
      [1,1,2,3,4,1,Infinity],[1,1,2,3,4,1,NaN]
    ];
    for(const [initialized,x,y,previousX,previousY,speed,elapsed] of cases){
      data.bytes[component+24]=initialized;
      data.view.setFloat64(transform+152,x,true);data.view.setFloat64(transform+160,y,true);
      data.view.setFloat32(component+16,previousX,true);data.view.setFloat32(component+20,previousY,true);
      data.view.setFloat32(component+28,speed,true);data.view.setFloat64(component+8,123.5,true);
      drawDirect(data,64,elapsed);checkpoint(data,[initialized,x,y,speed,elapsed]);
    }
    // Exercise native409 from an invalidated world cache.
    data.bytes[transform+144]=0;data.bytes[component+24]=0;
    drawDirect(data,64,40);checkpoint(data,'world-cache-refresh');
    data.put(component,0);drawDirect(data,64,40);checkpoint(data,'without-owner');
  },true);
  assert.equal(original.error,undefined,original.data.errorStack);
  assert.equal(original.data.checkpoints.length,16);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});

test('components64/80 retain hit-flash, grayscale and exact dark-outline color evaluation',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    const visual=data.get(data.drawable+136);
    for(const slot of [64,80])for(const timestamp of [-Infinity,0,1849.999,1850,1850.001,1984.999,1985,1985.001,2000,Infinity,NaN])for(const gray of [0,1])for(const active of [0,1]){
      data.bytes[visual+56]=active;data.view.setFloat64(visual+64,timestamp,true);
      data.bytes[data.renderer+69]=gray;data.bytes[data.renderer+49]=active;data.bytes[data.renderer+50]=gray;
      setMatrix(data,[1,.2,-.4,.8,10,-20]);
      drawDirect(data,slot,0);checkpoint(data,[slot,timestamp,gray,active]);
    }
    for(const slot of [64,80])for(const gray of [0,1]){
      data.put(data.componentPointers[slot],0);data.bytes[data.renderer+69]=gray;
      drawDirect(data,slot);checkpoint(data,[slot,'without-owner',gray]);
    }
  },'all');
  assert.equal(original.error,undefined,original.data.errorStack);
  assert.equal(original.data.checkpoints.length,92);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});

test('components64/80 preserve nonfinite phases and all six affine inputs',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    for(const slot of [64,80])for(const value of [0,-0,Math.fround(1/3),-1,Infinity,-Infinity,NaN,3.4028234663852886e38,1.401298464324817e-45])for(let lane=0;lane<6;lane++){
      const matrix=[1,0,0,1,0,0];matrix[lane]=value;setMatrix(data,matrix);
      data.bytes[data.renderer+48]=1;drawDirect(data,slot,0);checkpoint(data,[slot,value,lane]);
    }
    for(const phase of [0,-0,1e-100,-1e100,1e300,Infinity,-Infinity,NaN]){
      data.view.setFloat64(data.componentPointers[64]+8,phase,true);
      setMatrix(data,[1,0,0,1,0,0]);drawDirect(data,64,0);checkpoint(data,['phase',phase]);
    }
  },true);
  assert.equal(original.error,undefined,original.data.errorStack);
  assert.equal(original.data.checkpoints.length,116);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});

test('components64/80 observe mutable Canvas state and per-sample clock flags',async()=>{
  for(const slot of [64,80])for(const mode of ['canvas','clock-first','clock-second','clock-kept']){
    const {original,recovered}=await compare(prepareComponentScene,data=>{
      const visual=data.get(data.drawable+136);
      data.bytes[visual+56]=1;data.view.setFloat64(visual+64,2000,true);data.bytes[7922312]=0;
      let calls=0,clocks=0;
      data.observeHost(({args})=>{
        calls++;
        if(mode==='canvas'){
          data.bytes[data.renderer+69]^=1;data.bytes[data.renderer+48]=1;
          data.view.setFloat32(data.renderer+16,Math.fround(calls/3),true);
        }
        if(args[0]===141314){
          clocks++;data.hostResults[141314]=clocks===1?1985:Infinity;
          if(mode==='clock-first' || mode==='clock-second'&&clocks===2)data.bytes[visual+56]=0;
        }
      });
      drawDirect(data,slot,0);checkpoint(data,[slot,mode]);data.clocks=clocks;
    },true);
    assert.equal(original.error,undefined,original.data.errorStack);
    assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
    assert.equal(recovered.data.clocks,original.data.clocks);
  }
});

test('components64/80 retain invalid-pointer and Canvas/clock exception partial state',async()=>{
  for(const slot of [64,80])for(const failure of ['component','renderer','owner','visual','line-width','path','clock']){
    const {original}=await compare(prepareComponentScene,data=>{
      const component=data.componentPointers[slot],visual=data.get(data.drawable+136);
      if(failure==='owner')data.put(component,-8);
      if(failure==='visual')data.put(data.drawable+136,-8);
      if(failure==='clock'){data.bytes[visual+56]=1;data.bytes[7922312]=0;}
      const code={'line-width':138111,path:136878,clock:141314}[failure];
      if(code)data.observeHost(({args})=>{if(args[0]===code)throw new Error('injected component renderer failure');});
      data.running.call(slot===64?1038:1039,failure==='component'?-8:component,failure==='renderer'?-8:data.renderer,...(slot===64?[0]:[]));
    },true);
    assert.ok(original.error,`${slot}/${failure}`);
    assert.ok(original.stack<0,`${slot}/${failure} keeps scratch`);
  }
});

test('components64/80 retain original scratch aliases',async()=>{
  for(const slot of [64,80])for(const offset of slot===64?[0,16,176,480,528,544]:[0,16,112,144,176,192]){
    const {original}=await compare(prepareComponentScene,data=>{
      const scratch=data.runtime.stackPointer.value-(slot===64?560:208),component=data.componentPointers[slot];
      const state=data.bytes.slice(component,component+(slot===64?32:4));
      data.bytes.set(state,scratch+offset);
      drawDirect(data,slot,0,scratch+offset);checkpoint(data,[slot,offset]);
    },true);
    assert.equal(original.error,undefined,original.data.errorStack);
    assert.equal(original.data.checkpoints.length,1);
  }
});
