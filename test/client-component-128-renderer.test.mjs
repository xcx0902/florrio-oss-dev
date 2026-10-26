import test, { after } from "node:test";

let oracleComparisons = 0, checkpointComparisons = 0;
after(() => console.log(`Component128 oracle pairs: ${oracleComparisons}; complete-memory checkpoints: ${checkpointComparisons}; combined registered client bodies: ${registeredClientBodyCount}`));

import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";

import { createHash } from "node:crypto";

import wabtFactory from "wabt";

import { typedIndirectCall } from "../source/runtime/indirect.mjs";

import { loadOriginal } from "./helpers/wasm-probe.mjs";

import { makeReadableWat } from "../tools/lib/readable-wasm.mjs";

import { createComponent128RendererHooks } from "../source/game/client/component-128-renderer.mjs";

import { createRecoveredFunctions, recoveredFunctionPlan } from "../source/runtime/registry.mjs";

const registeredClientBodyCount = recoveredFunctionPlan("client").length;

const functionIds = [ 481,1045 ];

const originalBytes = await readFile(new URL("../web/client.wasm", import.meta.url));

const originalModule = new WebAssembly.Module(originalBytes);

const inventory = JSON.parse(await readFile(new URL("../reports/wasm/client-functions.json", import.meta.url)));

const names = inventory.find((row => row.id === 1045)).directCalls;

const dependencies = [ ...names.map((name => inventory.find((row => row.name === name)).id)), 1096, 1015, 368, 392, 444, 556, 561, 818, 763, 760, 1008, 426, 369, 370 ];

const packetTrace = JSON.parse(await readFile(new URL("../reports/runtime/client-packet-traces.json", import.meta.url)));

const packets = packetTrace.packets.filter((packet => packet.direction === "fromWorker" && packet.bytes[0] === 1));

const patchedModules = new Map;

async function getPatchedModule(combined) {
  if (patchedModules.has(combined)) return patchedModules.get(combined);
  const wabt = await wabtFactory();
  const wat = await readFile(new URL("../source/wasm/client.wat", import.meta.url), "utf8");
  const inventory = JSON.parse(await readFile(new URL("../reports/wasm/client-functions.json", import.meta.url)));
  const plan = combined ? [...recoveredFunctionPlan("client").filter(entry => !functionIds.includes(entry.id)), ...functionIds.map(id => ({id,source:"game/client/component-128-renderer.mjs"}))] : functionIds.map((id => ({
    id: id,
    source: "game/client/component-128-renderer.mjs"
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
  const hostEffects = {current: undefined};
  const hookCalls = {};
  let runtime, hooks;
  function decodeAsmArguments(signature, pointer) {
    const bytes = new Uint8Array(runtime.memory.buffer), view = new DataView(runtime.memory.buffer);
    const values = [];
    const pointerStart = pointer;
    pointer >>= 2;
    for (let type; type = bytes[signature++]; pointer++) {
      const double = type < 105;
      if (double && pointer & 1) pointer++;
      values.push(double ? view.getFloat64((pointer++ >> 1) * 8, true) : view.getInt32(pointer * 4, true));
    }
    return {values, bytes: Buffer.from(bytes.slice((pointerStart >>> 0), pointer * 4)).toString("hex")};
  }
  const imports = {};
  for (const entry of WebAssembly.Module.imports(originalModule)) {
    (imports[entry.module] ??= {})[entry.name] = (...args) => {
      if (entry.module === "a" && (entry.name === "a" || entry.name === "c")) {
        const decoded = decodeAsmArguments(args[1], args[2]);
        events.push([ entry.module, entry.name, ...args, decoded.values, decoded.bytes ]);
        hostEffects.current?.(args[0], decoded.values, runtime);
        if (args[0] === 150328) return decoded.values[0] % decoded.values[1];
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
  hooks = patchInternalCalls === "all" ? {...createRecoveredFunctions("client", running), ...createComponent128RendererHooks(running)} : createComponent128RendererHooks(running);
  runtime.instance.exports.Nf();
  const data = {
    runtime: runtime,
    running: running,
    imports: imports,
    hostResults: hostResults,
    hostEffects,
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
  oracleComparisons++;
  checkpointComparisons += original.data.checkpoints?.length ?? 0;
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

test('component128 follows its real scene dispatch and reuses both cached paths',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    data.put(data.drawable+128,data.componentPointers[128]);
    let nextPath=100;data.hostEffects.current=(code)=>{if(code===141620)data.hostResults[141620]=nextPath++;};
    for(const delta of [1,40,1000]){data.running.call(760,data.state+2144,data.renderer,data.drawable,delta);checkpoint(data,delta);}
    assert.equal(nextPath,102);assert.equal(data.get(data.componentPointers[128]+8),100);assert.equal(data.get(data.componentPointers[128]+16),101);
  },true);
  assert.equal(original.error,undefined,original.data.errorStack);assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
  assert.ok(recovered.data.hookCalls[1045]>0);
});

const timestamps=[-Infinity,-100,0,1849.999,1850,1850.001,1900,1984.9999,1985,1985.0001,1999.999,2000,2000.001,2150,Infinity,NaN];
const matrices=[[1,0,0,1,0,0],[.75,.2,-.4,1.25,10,-20],[-0,0,-0,-1,-0,0],[1e-20,1e20,-1e20,1e-20,-100,100],[Infinity,-Infinity,NaN,1,NaN,-0]];
function markPathsReady(data,component,outer=71,inset=72){data.bytes[component+12]=1;data.bytes[component+20]=1;data.put(component+8,outer);data.put(component+16,inset);}

test('component128 builds exact radial paths for zero, one, two and many-point branches, then caches them',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    const component=data.componentPointers[128],bounds=data.get(data.drawable+140);let nextPath=200;
    data.hostEffects.current=(code)=>{if(code===141620)data.hostResults[141620]=nextPath++;};
    const radii=[-Infinity,-21,-20.999,-14,-7,-0,0,1,6.9999,7,14,50,250,700,Infinity,NaN,1e20];
    for(const [owner,radius] of [[0,50],...radii.map(radius=>[data.drawable,radius])]){
      data.put(component,owner);data.view.setFloat32(bounds+8,radius,true);data.bytes[component+12]=0;data.bytes[component+20]=0;
      const before=nextPath;data.running.call(1045,component,data.renderer);checkpoint(data,[owner,radius,'build']);
      const raw=Number(Math.fround(radius))*0.14285714285714285+3;
      const count=owner&&!(raw>=0&&raw<4294967296)?0:Math.trunc(owner?raw:50*0.14285714285714285+3);
      assert.equal(nextPath-before,count===0?1:2,`creation count at radius ${radius}`);
      data.view.setFloat32(bounds+8,11,true);const cached=nextPath;
      data.running.call(1045,component,data.renderer);checkpoint(data,[owner,radius,'cached']);assert.equal(nextPath,cached);
    }
  },true);
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,36);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});

test('component128 preserves partial cache initialization and missing-path return handles',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    const component=data.componentPointers[128];
    for(const outerReady of [0,1])for(const insetReady of [0,1])for(const handle of [-1,0,93]){
      data.bytes[component+12]=outerReady;data.bytes[component+20]=insetReady;data.put(component+8,handle);data.put(component+16,handle);
      data.hostResults[141620]=handle;data.running.call(1045,component,data.renderer);checkpoint(data,[outerReady,insetReady,handle]);
    }
  },'all');
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,12);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});

test('component128 retains flash, grayscale, nonfinite matrix and cached transform state',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    const component=data.componentPointers[128],visual=data.get(data.drawable+136);markPathsReady(data,component);
    for(const owner of [0,data.drawable])for(const valid of [0,1])for(const timestamp of timestamps)for(const grayscale of [0,1]){
      data.put(component,owner);data.bytes[visual+56]=valid;data.view.setFloat64(visual+64,timestamp,true);
      data.bytes[data.renderer+69]=grayscale;data.bytes[data.renderer+50]=data.checkpoints.length%3;
      data.bytes[data.renderer+48]=data.checkpoints.length%3!==0;
      matrices[data.checkpoints.length%matrices.length].forEach((value,index)=>data.view.setFloat32(data.renderer+index*4,value,true));
      if(data.checkpoints.length%3===1)data.bytes.copyWithin(data.renderer+24,data.renderer,data.renderer+24);
      data.running.call(1045,component,data.renderer);checkpoint(data,[owner,valid,timestamp,grayscale]);
    }
  },'all');
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,128);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
  for(const id of [1045,366,372,373,455])assert.ok(recovered.data.hookCalls[id]>0,`recovered body ${id} executes`);
});

test('component128 re-reads live paths and style after host callbacks mutate their state',async()=>{
  for(const mode of ['creation','move','curve']){
    const {original,recovered}=await compare(prepareComponentScene,data=>{
      const component=data.componentPointers[128],bounds=data.get(data.drawable+140);let nextPath=300,mutations=0;
      data.hostEffects.current=(code)=>{
        if(code===141620){data.hostResults[141620]=nextPath++;if(mode==='creation'){data.put(component+8,1000);data.put(component+16,2000);data.view.setFloat32(bounds+8,7,true);data.put(component,0);mutations++;}}
        if(code===141801&&mode==='move'){data.put(component+8,999);data.bytes[component+20]=1;data.put(component+16,88);mutations++;}
        if(code===141918&&mode==='curve'){data.put(component+8,500+mutations++);data.bytes[data.renderer+48]=1;data.view.setFloat32(data.renderer+8,mutations*.125,true);}
        if(code===137186||code===137456)data.bytes[data.renderer+69]^=1;
      };
      data.running.call(1045,component,data.renderer);data.mutations=mutations;checkpoint(data,mode);
    },true);
    assert.equal(original.error,undefined,original.data.errorStack);assert.ok(original.data.mutations>0);assert.equal(recovered.data.mutations,original.data.mutations);
  }
});

test('component128 retains clock validity changes between its four conditional samples',async()=>{
  for(const invalidateAt of [0,1,2,3,4]){
    const {original,recovered}=await compare(prepareComponentScene,data=>{
      const component=data.componentPointers[128],visual=data.get(data.drawable+136);markPathsReady(data,component);
      data.bytes[7922312]=0;data.bytes[visual+56]=1;data.view.setFloat64(visual+64,1990,true);let samples=0;
      data.hostEffects.current=(code)=>{if(code===141314){samples++;data.hostResults[141314]+=17;if(samples===invalidateAt)data.bytes[visual+56]=0;}};
      data.running.call(1045,component,data.renderer);data.samples=samples;checkpoint(data,invalidateAt);
    },'all');
    assert.equal(original.error,undefined,original.data.errorStack);assert.ok(original.data.samples>0);assert.equal(recovered.data.samples,original.data.samples);
  }
});

test('component128 retains Canvas/path failures, pointer traps and scratch aliases',async()=>{
  for(const [code,occurrence] of [[141620,1],[141801,1],[141918,2],[142027,1],[141835,1],[138111,1],[138852,1],[138893,1],[137456,1],[136763,1],[136690,1],[136763,2]]){
    const {original}=await compare(prepareComponentScene,data=>{
      let count=0;data.hostResults[141620]=7;data.bytes[data.renderer+50]=0;
      data.hostEffects.current=(address)=>{if(address===code&&++count===occurrence)throw new Error('component128 host failure');};
      data.running.call(1045,data.componentPointers[128],data.renderer);
    },true);
    assert.equal(original.error?.message,'component128 host failure',`${code} occurrence ${occurrence}`);
  }
  for(const mode of ['component','renderer','entity','bounds','visual','scratch-head','scratch-middle','scratch-tail']){
    const {original}=await compare(prepareComponentScene,data=>{
      let component=data.componentPointers[128],renderer=data.renderer;
      if(mode==='component')component=-1;if(mode==='renderer')renderer=-8;
      if(mode==='entity')data.put(component,-4);if(mode==='bounds')data.put(data.drawable+140,-1);if(mode==='visual')data.put(data.drawable+136,-1);
      if(mode.startsWith('scratch-')){const offset=mode==='scratch-head'?0:mode==='scratch-middle'?192:320;renderer=data.runtime.stackPointer.value-400+offset;data.bytes.copyWithin(renderer,data.renderer,data.renderer+104);data.bytes[renderer+48]=1;}
      data.running.call(1045,component,renderer);
    },true);
    if(!mode.startsWith('scratch-'))assert.equal(original.error?.name,'RuntimeError',mode);
  }
});

test('stored-path fill481 retains its missing sentinel, cache branches and callback path reload',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    const path=data.malloc(4);
    for(const handle of [-1,0,81])for(const dirty of [0,1])for(const equal of [0,1]){
      data.put(path,handle);data.bytes[data.renderer+48]=dirty;
      matrices[1].forEach((value,index)=>data.view.setFloat32(data.renderer+index*4,value,true));
      data.bytes.copyWithin(data.renderer+24,data.renderer,data.renderer+24);
      if(!equal)data.view.setFloat32(data.renderer+24,.5,true);
      data.hostEffects.current=(code)=>{if(code===136414)data.put(path,1234);};
      data.running.call(481,data.renderer,path);checkpoint(data,[handle,dirty,equal]);
    }
    data.put(path,-1);data.running.call(481,-8,path);checkpoint(data,'missing-with-invalid-renderer');
  },'all');
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,13);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);assert.ok(recovered.data.hookCalls[481]>0);
});

test('stored-path fill481 preserves exceptions and aliases in its own 80-byte frame',async()=>{
  for(const mode of ['path','renderer','transform-host','fill-host','alias-path','alias-renderer']){
    const {original}=await compare(prepareComponentScene,data=>{
      let path=data.malloc(4),renderer=data.renderer;data.put(path,93);data.bytes[renderer+48]=1;data.view.setFloat32(renderer+8,.5,true);
      if(mode==='path')path=-1;if(mode==='renderer')renderer=-8;
      if(mode==='alias-path'){path=data.runtime.stackPointer.value-80+24;data.put(path,93);}
      if(mode==='alias-renderer'){renderer=data.runtime.stackPointer.value-80;data.bytes.copyWithin(renderer,data.renderer,data.renderer+104);}
      data.hostEffects.current=(code)=>{if(code===(mode==='transform-host'?136414:mode==='fill-host'?136690:0))throw new Error('fill-path host failure');};
      data.running.call(481,renderer,path);
    },true);
    if(mode.endsWith('host')){assert.equal(original.error?.message,'fill-path host failure');assert.equal(original.stack,-80);}
    else if(mode==='path'||mode==='renderer')assert.equal(original.error?.name,'RuntimeError');
  }
});

test('component128 retains lazy path flags when a path callback reenters its renderer',async()=>{
  const {original,recovered}=await compare(prepareComponentScene,data=>{
    const component=data.componentPointers[128],otherRenderer=data.createRenderer();let reentered=0,nextPath=400;
    data.hostEffects.current=(code)=>{
      if(code===141620)data.hostResults[141620]=nextPath++;
      if(code===141801&&!reentered){reentered++;data.running.call(1045,component,otherRenderer);}
    };
    data.running.call(1045,component,data.renderer);data.reentered=reentered;checkpoint(data,'reentrant-path');
    assert.equal(nextPath,402);assert.equal(data.bytes[component+12],1);assert.equal(data.bytes[component+20],1);
  },'all');
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.reentered,1);assert.equal(recovered.data.reentered,1);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});

test('component128 retains its nested clock frame when the timestamp host throws',async()=>{
  const {original}=await compare(prepareComponentScene,data=>{
    const component=data.componentPointers[128],visual=data.get(data.drawable+136);markPathsReady(data,component);
    data.bytes[7922312]=0;data.bytes[visual+56]=1;
    data.hostEffects.current=(code)=>{if(code===141314)throw new Error('component128 clock failure');};
    data.running.call(1045,component,data.renderer);
  },'all');
  assert.equal(original.error?.message,'component128 clock failure');assert.equal(original.stack,-464);
});
