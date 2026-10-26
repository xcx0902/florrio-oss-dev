import test from "node:test";

import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";

import { createHash } from "node:crypto";

import wabtFactory from "wabt";

import { typedIndirectCall } from "../source/runtime/indirect.mjs";

import { loadOriginal } from "./helpers/wasm-probe.mjs";

import { makeReadableWat } from "../tools/lib/readable-wasm.mjs";

import { createEyeRendererHooks } from "../source/game/client/eye-renderer.mjs";

import { createRecoveredFunctions, recoveredFunctionPlan } from "../source/runtime/registry.mjs";

const functionIds = [ 690 ];

const originalBytes = await readFile(new URL("../web/client.wasm", import.meta.url));

const originalModule = new WebAssembly.Module(originalBytes);

const inventory = JSON.parse(await readFile(new URL("../reports/wasm/client-functions.json", import.meta.url)));

const names = inventory.find((row => row.id === 690)).directCalls;

const dependencies = [ ...names.map((name => inventory.find((row => row.name === name)).id)), 1096, 1015, 368, 392, 444, 556, 561, 818, 763, 1008, 426, 369, 370, 760, 1100 ];

const packetTrace = JSON.parse(await readFile(new URL("../reports/runtime/client-packet-traces.json", import.meta.url)));

const packets = packetTrace.packets.filter((packet => packet.direction === "fromWorker" && packet.bytes[0] === 1));

const patchedModules = new Map;

async function getPatchedModule(combined) {
  if (patchedModules.has(combined)) return patchedModules.get(combined);
  const wabt = await wabtFactory();
  const wat = await readFile(new URL("../source/wasm/client.wat", import.meta.url), "utf8");
  const inventory = JSON.parse(await readFile(new URL("../reports/wasm/client-functions.json", import.meta.url)));
  const plan = combined ? [...recoveredFunctionPlan("client").filter(entry => !functionIds.includes(entry.id)), ...functionIds.map(id => ({id,source:"game/client/eye-renderer.mjs"}))] : functionIds.map((id => ({
    id: id,
    source: "game/client/eye-renderer.mjs"
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
  let runtime, hooks, liveData;
  function decodeAsmArguments(signature, pointer) {
    const bytes = new Uint8Array(runtime.memory.buffer), view = new DataView(runtime.memory.buffer);
    const values = [];
    const argumentStart=pointer>>>0;
    pointer >>= 2;
    for (let type; type = bytes[signature++]; pointer++) {
      const double = type < 105;
      if (double && pointer & 1) pointer++;
      values.push(double ? view.getFloat64((pointer++ >> 1) * 8, true) : view.getInt32(pointer * 4, true));
    }
    return {values, rawBytes:Buffer.from(bytes.slice(argumentStart,pointer*4)).toString("hex")};
  }
  const imports = {};
  for (const entry of WebAssembly.Module.imports(originalModule)) {
    (imports[entry.module] ??= {})[entry.name] = (...args) => {
      if (entry.module === "a" && (entry.name === "a" || entry.name === "c")) {
        const decoded = decodeAsmArguments(args[1], args[2]);
        events.push([ entry.module, entry.name, ...args, decoded.values, decoded.rawBytes ]);
        liveData?.hostTap?.(args[0], decoded.values);
        if (args[0] === 150328) return decoded.values[0] % decoded.values[1];
      } else events.push([ entry.module, entry.name, ...args ]);
      return Object.hasOwn(hostResults,args[0]) ? hostResults[args[0]] : 0;
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
  hooks = patchInternalCalls === "all" ? {...createRecoveredFunctions("client", running), ...createEyeRendererHooks(running)} : createEyeRendererHooks(running);
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
  liveData = data;
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

test('eye renderer matches original complete frames for every captured snapshot',async()=>{
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
    },true);
    assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,15);assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
  }
});

test('eye renderer composes with every other active client source body',async()=>{
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
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,15);assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);assert.ok(recovered.data.hookCalls[690]>0);
});


async function prepareAppearance(data) {
  data.renderer = data.createRenderer();
  data.appearanceState = data.malloc(32);
  data.parameters = data.malloc(20);
  data.bytes.fill(0, data.appearanceState, data.appearanceState + 32);
  data.bytes.fill(0, data.parameters, data.parameters + 20);
  data.bytes.set([255, 32, 0], data.parameters + 5);
  data.view.setFloat32(data.appearanceState + 16, -3, true);
  data.checkpoints = [];
}
function checkpoint(data, label) {
  data.checkpoints.push({label, digest:createHash('sha256').update(data.bytes).digest('hex'),events:data.events.length});
}
function drawAppearance(data, delta) {
  return data.running.call(1100, data.renderer, delta, data.appearanceState, data.parameters);
}

test('eye renderer matches both models, all expression flags and action combinations',async()=>{
  const {original,recovered}=await compare(prepareAppearance,data=>{
    for(let model=0;model<2;model++)for(let flags=0;flags<8;flags++)for(let actions=0;actions<16;actions++){
      data.put(data.parameters+16,model);data.bytes[data.parameters]=flags;
      for(let bit=0;bit<4;bit++)data.bytes[data.parameters+1+bit]=actions>>bit&1;
      data.bytes[data.renderer+69]=flags&1;
      data.view.setFloat32(data.parameters+8,(actions%5)*.25,true);
      data.view.setFloat32(data.parameters+12,(flags-4)*.7,true);
      for(const [i,value]of[1,.2,-.4,.8,10,-20].entries())data.view.setFloat32(data.renderer+i*4,value,true);
      for(const[offset,value]of[[16,-3],[20,.5],[24,.25],[28,.75]])data.view.setFloat32(data.appearanceState+offset,value,true);
      drawAppearance(data,actions&1?40:0);checkpoint(data,[model,flags,actions]);
    }
  },true);
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,256);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
  assert.ok(recovered.data.hookCalls[690]>0);
});

test('eye renderer preserves easing, guarded color conversions and nonfinite affine products',async()=>{
  const values=[-Infinity,-1,-0,1e-8,.5,1,Infinity,NaN];
  const {original,recovered}=await compare(prepareAppearance,data=>{
    for(const[index,value]of values.entries())for(const delta of values){
      data.bytes[data.parameters]=index;data.put(data.parameters+16,index&1);
      data.bytes[data.parameters+1]=index>>1&1;data.bytes[data.parameters+2]=index>>2&1;data.bytes[data.parameters+3]=index&1;
      data.view.setFloat32(data.parameters+8,value,true);data.view.setFloat32(data.parameters+12,value,true);
      for(const offset of[16,20,24,28])data.view.setFloat32(data.appearanceState+offset,value,true);
      for(let i=0;i<6;i++)data.view.setFloat32(data.renderer+i*4,i&1?-0:value,true);
      drawAppearance(data,delta);checkpoint(data,[index,values.indexOf(delta)]);
    }
  },true);
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,64);
  assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});

test('eye renderer keeps the original scratch frame and memory writes when pointers trap',async()=>{
  for(const field of['renderer','appearanceState','parameters']){
    const {original}=await compare(prepareAppearance,data=>{
      data[field]=-8;drawAppearance(data,40);
    },true);
    assert.equal(original.error?.name,'RuntimeError',field);assert.equal(original.stack,-2624,field);
  }
});

test('eye renderer preserves host exceptions at each independent drawing phase',async()=>{
  for(const code of[138730,138111,137186,137456,136878,136414,137806,137880,136912,137995,136300,138811,136329,137843,136807,136732]){
    const {original}=await compare(prepareAppearance,data=>{
      data.bytes[data.parameters]=5;data.bytes[data.renderer+48]=1;data.bytes[data.renderer+50]=1;
      data.view.setFloat32(data.appearanceState+20,.5,true);
      data.hostTap=(address)=>{if(address===code)throw new TypeError('drawing host fault '+code);};
      drawAppearance(data,40);
    },true);
    // Circular bodies reach arc; their eye expression reaches clip and lineTo.
    assert.equal(original.error?.name,'TypeError',String(code));assert.ok(original.stack<=-2624,String(code));
  }
});

test('eye renderer retains live memory loads across canvas callbacks',async()=>{
  const {original,recovered}=await compare(prepareAppearance,data=>{
    let callbacks=0;
    data.bytes[data.parameters]=5;data.view.setFloat32(data.appearanceState+20,.5,true);
    data.bytes[data.renderer+48]=1;data.bytes[data.renderer+50]=1;
    data.hostTap=(code)=>{
      callbacks++;
      if(code===137186){data.view.setFloat32(data.parameters+8,.7,true);data.bytes[data.parameters+5]=19;data.bytes[data.renderer+69]=1;}
      if(code===136300){data.put(data.renderer+96,17);data.view.setFloat32(data.renderer+8,-.35,true);data.bytes[data.parameters+4]=1;}
      if(code===136414)data.view.setFloat32(data.renderer+16,callbacks*.125,true);
    };
    drawAppearance(data,40);checkpoint(data,callbacks);data.hostTap=undefined;
  },'all');
  assert.equal(original.error,undefined,original.data.errorStack);assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});


test('eye renderer retains overlapping state, parameter and scratch memory behavior',async()=>{
  for(const alias of['state-parameters','parameters-state','state-renderer','parameters-scratch-colors','parameters-scratch-delta','parameters-scratch-renderer']){
    const {original,recovered}=await compare(prepareAppearance,data=>{
      const scratch=data.runtime.stackPointer.value-2624;
      if(alias==='state-parameters')data.appearanceState=data.parameters;
      if(alias==='parameters-state')data.parameters=data.appearanceState;
      if(alias==='state-renderer')data.appearanceState=data.renderer;
      if(alias==='parameters-scratch-colors')data.parameters=scratch+2608;
      if(alias==='parameters-scratch-delta')data.parameters=scratch+2616;
      if(alias==='parameters-scratch-renderer')data.parameters=scratch+2620;
      drawAppearance(data,40);checkpoint(data,alias);
    },true);
    assert.equal(original.error,undefined,original.data.errorStack);assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
  }
});

test('eye renderer retains shared stack and live state during a reentrant canvas callback',async()=>{
  const {original,recovered}=await compare(prepareAppearance,data=>{
    let entered=false;
    data.hostTap=(code)=>{
      if(code!==137186||entered)return;
      entered=true;data.bytes[data.parameters]=5;data.put(data.parameters+16,1);
      drawAppearance(data,13);
      data.bytes[data.parameters+2]=1;
    };
    drawAppearance(data,40);checkpoint(data,entered);data.hostTap=undefined;
  },true);
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.stack,0);assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
  assert.ok(recovered.data.hookCalls[690]>0);
});


async function prepareEye(data) {
  await prepareAppearance(data);
  data.rendererSlot=data.malloc(4);data.put(data.rendererSlot,data.renderer);
  data.eyeColor=data.malloc(3);data.bytes.set([34,51,85],data.eyeColor);
  data.deltaPointer=data.malloc(4);data.view.setFloat32(data.deltaPointer,40,true);
  data.eyeContext=data.malloc(24);
  for(const[offset,pointer]of[[0,data.rendererSlot],[4,data.parameters+1],[8,data.eyeColor],[12,data.appearanceState],[16,data.parameters],[20,data.deltaPointer]])data.put(data.eyeContext+offset,pointer);
}
function drawOneEye(data,index=0,x=-7,y=-5) {
  return data.running.call(690,data.eyeContext,x,y,index);
}

test('eye renderer directly matches dead and clipped-pupil branches, grayscale and affine state',async()=>{
  const matrices=[[1,0,0,1,0,0],[0,-0,-0,0,-0,0],[.125,-.25,1.234567,3.456789,-55.125,9.75],[1e30,1e-30,-1e15,-1e-15,1e10,-1e10],[Infinity,0,0,1,3,5],[1,NaN,0,1,0,-0]];
  const{original,recovered}=await compare(prepareEye,data=>{
    for(let dead=0;dead<2;dead++)for(let gray=0;gray<2;gray++)for(let eye=0;eye<2;eye++)for(const[index,values]of matrices.entries()){
      data.bytes[data.parameters+1]=dead;data.bytes[data.renderer+69]=gray;
      for(const[i,value]of values.entries())data.view.setFloat32(data.renderer+i*4,value,true);
      data.view.setFloat32(data.parameters+12,index%2?Math.PI/2:-Math.PI/4,true);
      data.view.setFloat32(data.appearanceState+eye*8,.25,true);data.view.setFloat32(data.appearanceState+eye*8+4,-.75,true);
      drawOneEye(data,eye,eye?7:-7,-5);checkpoint(data,[dead,gray,eye,index]);
    }
  },true);
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,48);assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);assert.equal(recovered.data.hookCalls[690],48);
});

test('eye renderer retains gaze epsilon branches, nonfinite deltas and persistent per-eye directions',async()=>{
  const{original,recovered}=await compare(prepareEye,data=>{
    const angles=[0,Math.PI/2,NaN,Infinity];
    for(const[angleIndex,angle]of angles.entries())for(const delta of[-Infinity,-1,-0,40,1000,Infinity,NaN])for(const deviation of[0,1e-8,2e-7,NaN,Infinity]){
      const targetX=data.runtime.call(427,Math.fround(angle)),targetY=data.runtime.call(431,Math.fround(angle));
      data.view.setFloat32(data.parameters+12,angle,true);data.view.setFloat32(data.deltaPointer,delta,true);
      for(let eye=0;eye<2;eye++){
        data.view.setFloat32(data.appearanceState+eye*8,targetX+deviation,true);data.view.setFloat32(data.appearanceState+eye*8+4,targetY-deviation,true);
        drawOneEye(data,eye,eye?7:-7,-5);
      }
      checkpoint(data,[angleIndex,delta,deviation]);
    }
  },'all');
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.data.checkpoints.length,140);assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});

test('eye renderer rereads context pointers and state after host mutations',async()=>{
  const{original,recovered}=await compare(prepareEye,data=>{
    const alternateRenderer=data.createRenderer(),alternateState=data.malloc(32),alternateColor=data.malloc(3),alternateParameters=data.malloc(20),alternateDelta=data.malloc(4);
    data.bytes.fill(0,alternateState,alternateState+32);data.bytes.fill(0,alternateParameters,alternateParameters+20);data.bytes.set([19,131,247],alternateColor);data.view.setFloat32(alternateParameters+12,-1.234,true);data.view.setFloat32(alternateDelta,3,true);
    let replaced=false;
    data.hostTap=(code)=>{
      if(code===136878&&!replaced){replaced=true;data.put(data.rendererSlot,alternateRenderer);data.bytes[alternateRenderer+69]=1;}
      if(code===137995)data.put(data.eyeContext+8,alternateColor);
      if(code===136807){data.put(data.eyeContext+12,alternateState);data.put(data.eyeContext+16,alternateParameters);data.put(data.eyeContext+20,alternateDelta);}
      if(code===136414)data.view.setFloat32(data.renderer+16,37.125,true);
    };
    drawOneEye(data,1);checkpoint(data,replaced);data.hostTap=undefined;
  },true);
  assert.equal(original.error,undefined,original.data.errorStack);assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);
});

test('eye renderer directly preserves each canvas exception and nested scratch stack',async()=>{
  for(const dead of[0,1])for(const code of dead?[138111,137456,136878,136414,137806,137843,136732]:[136878,136414,137995,137186,136661,136300,136807,136329,137456,138111,136732]){
    const{original}=await compare(prepareEye,data=>{
      data.bytes[data.parameters+1]=dead;
      data.hostTap=address=>{if(address===code)throw new TypeError('eye host fault '+code);};
      drawOneEye(data,1);
    },true);
    assert.equal(original.error?.name,'TypeError',`${dead}/${code}`);assert.equal(original.stack,-1360,`${dead}/${code}`);
  }
});

test('eye renderer directly retains pointer traps and partial writes',async()=>{
  for(const target of['context','renderer-slot','renderer','death','color','directions','parameters','delta']){
    const{original}=await compare(prepareEye,data=>{
      if(target==='context')data.eyeContext=-4;
      if(target==='renderer-slot')data.put(data.eyeContext,-4);
      if(target==='renderer')data.put(data.rendererSlot,-8);
      for(const[name,offset]of[['death',4],['color',8],['directions',12],['parameters',16],['delta',20]])if(target===name)data.put(data.eyeContext+offset,-4);
      drawOneEye(data,0);
    },true);
    assert.equal(original.error?.name,'RuntimeError',target);assert.equal(original.stack,-1360,target);
  }
});


test('eye renderer retains wrapped gaze indexing and scratch/context memory aliases',async()=>{
  for(const alias of['wrapped-gaze','slot-scratch-matrix','death-scratch-matrix','gaze-context','renderer-scratch-matrix']){
    const{original}=await compare(prepareEye,data=>{
      const scratch=data.runtime.stackPointer.value-1360;
      if(alias==='wrapped-gaze')data.put(data.eyeContext+12,-4);
      if(alias==='slot-scratch-matrix'){data.put(scratch+1336,data.renderer);data.put(data.eyeContext,scratch+1336);}
      if(alias==='death-scratch-matrix'){data.view.setUint32(data.renderer,0x3f800001,true);data.put(data.eyeContext+4,scratch+1336);}
      if(alias==='gaze-context')data.put(data.eyeContext+12,data.eyeContext);
      if(alias==='renderer-scratch-matrix'){data.bytes.copyWithin(scratch+1344,data.renderer,data.renderer+128);data.put(data.rendererSlot,scratch+1344);}
      drawOneEye(data,alias==='wrapped-gaze'?1:0);
    },true);
    if(alias==='wrapped-gaze')assert.equal(original.error,undefined,original.data.errorStack);
  }
});

test('eye renderer preserves its shared stack when a canvas callback reenters the eye body',async()=>{
  const{original,recovered}=await compare(prepareEye,data=>{
    let entered=false;
    data.hostTap=code=>{
      if(code!==137186||entered)return;
      entered=true;data.view.setFloat32(data.parameters+12,.75,true);drawOneEye(data,1,7,-5);
      data.view.setFloat32(data.parameters+12,-.25,true);
    };
    drawOneEye(data,0);checkpoint(data,entered);data.hostTap=undefined;
  },true);
  assert.equal(original.error,undefined,original.data.errorStack);assert.equal(original.stack,0);assert.deepEqual(recovered.data.checkpoints,original.data.checkpoints);assert.equal(recovered.data.hookCalls[690],2);
});


test('eye renderer retains native i32 host-result conversion, callback effects and conversion traps',async()=>{
  for(const value of[undefined,NaN,Infinity,-0,4294967297,-2147483649,1n,Symbol('canvas result'),'object-number','object-bigint']){
    const{original}=await compare(prepareEye,data=>{
      data.hostResults[138111]=typeof value==='string'?{valueOf(){data.view.setFloat32(data.renderer+8,3.125,true);return value==='object-bigint'?1n:1;}}:value;
      drawOneEye(data,0);
    },true);
    if(typeof value==='bigint'||typeof value==='symbol'||value==='object-bigint')assert.equal(original.error?.name,'TypeError',String(value));
    else assert.equal(original.error,undefined,original.data.errorStack);
  }
});
