import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import wabtFactory from 'wabt';
import { typedIndirectCall } from '../source/runtime/indirect.mjs';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { makeReadableWat } from '../tools/lib/readable-wasm.mjs';
import { createEntitySnapshotHooks, functionIds } from '../source/game/client/entity-snapshot.mjs';

const originalBytes = await readFile(new URL('../web/client.wasm', import.meta.url));
const originalModule = new WebAssembly.Module(originalBytes);
const inventory = JSON.parse(await readFile(new URL('../reports/wasm/client-functions.json', import.meta.url)));
const names = inventory.find(row => row.id === 1015).directCalls;
const dependencies = [...names.map(name => inventory.find(row => row.name === name).id), 1096, 1006, 478, 491, 477, 575, 705];
const packetTrace = JSON.parse(await readFile(new URL('../reports/runtime/client-packet-traces.json', import.meta.url)));
const packets = packetTrace.packets.filter(packet => packet.direction === 'fromWorker' && packet.bytes[0] === 1);
let patchedModule;

async function getPatchedModule() {
  if (patchedModule) return patchedModule;
  const wabt = await wabtFactory();
  const wat = await readFile(new URL('../source/wasm/client.wat', import.meta.url), 'utf8');
  const inventory = JSON.parse(await readFile(new URL('../reports/wasm/client-functions.json', import.meta.url)));
  const result = makeReadableWat(wat, inventory, functionIds.map(id => ({ id, source: 'game/client/entity-snapshot.mjs' })));
  const parsed = wabt.parseWat('entity-snapshot.wat', result.text);
  try { patchedModule = new WebAssembly.Module(parsed.toBinary({}).buffer); }
  finally { parsed.destroy(); }
  return patchedModule;
}

async function scenario(recovered, setup, action, patchInternalCalls) {
  const events = [];
  const hostResults = {};
  const hookCalls = {};
  let runtime, hooks;
  const imports = {};
  for (const entry of WebAssembly.Module.imports(originalModule)) {
    (imports[entry.module] ??= {})[entry.name] = (...args) => {
      events.push([entry.module, entry.name, ...args]);
      return hostResults[args[0]] ?? 0;
    };
  }
  imports.a.La = (count, size) => {
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(count >>> 0, 0, true);
    view.setUint32(size >>> 0, 0, true);
    events.push(['a', 'La', count, size]);
    return 0;
  };
  imports.a.Oa = (fd, vectors, count, written) => {
    const view = new DataView(runtime.memory.buffer);
    let total = 0;
    for (let i = 0; i < count; i++) total += view.getUint32(vectors + i * 8 + 4, true);
    view.setUint32(written >>> 0, total, true);
    events.push(['a', 'Oa', fd, vectors, count, written]);
    return 0;
  };
  if (recovered && patchInternalCalls) {
    imports.readable = Object.fromEntries(functionIds.map(id => [`f${id}`, (...args) => {
      hookCalls[id] = (hookCalls[id] ?? 0) + 1;
      return hooks[id](...args);
    }]));
    const instance = new WebAssembly.Instance(await getPatchedModule(), imports);
    runtime = {
      instance,
      get memory() { return instance.exports.__readable_memory; },
      get table() { return instance.exports.__readable_table; },
      get stackPointer() { return instance.exports.__stack_pointer; },
      call(id, ...args) { return instance.exports[`__fn${id}`](...args); },
      host(module, field, ...args) { return imports[module][field](...args); },
    };
  } else runtime = await loadOriginal('client', { functionIds: [...functionIds, ...dependencies], imports, construct: false });
  const originalCall = runtime.call.bind(runtime);
  const running = {
    get memory() { return runtime.memory; },
    get table() { return runtime.table; },
    get stackPointer() { return runtime.stackPointer; },
    host: runtime.host.bind(runtime),
    indirect(signature, index, ...args) { return typedIndirectCall(runtime.table, signature, index, ...args); },
    call(id, ...args) {
      return recovered && !patchInternalCalls && hooks[id] ? hooks[id](...args) : originalCall(id, ...args);
    },
  };
  hooks = createEntitySnapshotHooks(running);
  runtime.instance.exports.Nf();
  const data = {
    runtime, running, imports, hostResults, events, hookCalls, state: 441408,
    get bytes() { return new Uint8Array(runtime.memory.buffer); },
    get view() { return new DataView(runtime.memory.buffer); },
    get(address) { return this.view.getUint32(address, true); },
    put(address, value) { this.view.setUint32(address, value, true); },
    malloc(size) { return originalCall(368, size) >>> 0; },
    entity(index = 0) { return this.state + 2928 + index * 448; },
    reader(bytes, pending = 0, cursor = 0, declaredLength) {
      const pointer = this.malloc(bytes.length + pending + 16), reader = this.malloc(16);
      this.bytes.fill(0xA5, pointer, pointer + bytes.length + pending + 16);
      this.bytes.set(bytes, pointer + pending);
      this.put(reader, pointer);
      this.put(reader + 4, declaredLength ?? bytes.length + pending);
      this.put(reader + 8, cursor);
      this.put(reader + 12, pending);
      return reader;
    },
  };
  data.bytes[441368] = 1;
  originalCall(1096);
  await setup(data);
  const stackBefore = runtime.stackPointer.value;
  let error;
  try { await action(data); }
  catch (caught) { error = { name: caught.constructor.name, message: caught.message }; }
  return {
    data, events, error, stack: runtime.stackPointer.value - stackBefore,
    digest: createHash('sha256').update(data.bytes).digest('hex'),
  };
}

async function compare(setup, action, patchInternalCalls = false) {
  const original = await scenario(false, setup, action, patchInternalCalls);
  const recovered = await scenario(true, setup, action, patchInternalCalls);
  assert.deepEqual(recovered.events, original.events, 'host calls');
  assert.deepEqual(recovered.error, original.error, 'exception');
  assert.equal(recovered.stack, original.stack, 'stack');
  if (recovered.digest !== original.digest) {
    const differing = [], left = original.data.bytes, right = recovered.data.bytes;
    for (let i = 0; i < left.length && differing.length < 24; i++)
      if (right[i] !== left[i]) differing.push([i, left[i], right[i]]);
    assert.equal(recovered.digest, original.digest, `complete memory; first differences ${JSON.stringify(differing)}`);
  }
  return { original, recovered };
}

test('captured startup, spawn, attack, defend and wheel snapshots match every original memory byte', async () => {
  assert.equal(createHash('sha256').update(originalBytes).digest('hex'), 'c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1');
  assert.deepEqual(functionIds, [1015]);
  assert.equal(packets.length, 15);
  for (const patch of [false, true]) {
    const { original, recovered } = await compare(
      data => { data.readers = packets.map(packet => data.reader(packet.bytes.slice(1))); },
      data => {
        data.cursors = [];
        data.checkpoints = [];
        for (const reader of data.readers) {
          data.running.call(1015, data.state, reader);
          data.cursors.push([data.get(reader + 8), data.get(reader + 4)]);
          data.checkpoints.push(createHash('sha256').update(data.bytes).digest('hex'));
        }
      }, patch,
    );
    assert.equal(original.error, undefined);
    assert.deepEqual(recovered.data.cursors, original.data.cursors);
    assert.deepEqual(recovered.data.checkpoints, original.data.checkpoints);
    if (patch) assert.equal(recovered.data.hookCalls[1015], 15);
  }
});

function varint(value) {
  const bytes = [];
  do { const group = value & 127; value >>>= 7; bytes.push(group | (value ? 128 : 0)); } while (value);
  return bytes;
}
function integer(value, width = 4) {
  return Array.from({ length: width }, (_, index) => value >>> (index * 8) & 255);
}
function wireHandle(index, generation = 1) {
  const packed = generation << 14 | index;
  return integer((packed << 18 | packed >>> 14) >>> 0);
}
function floating(value, width = 4) {
  const buffer = new ArrayBuffer(width), view = new DataView(buffer);
  view[width === 4 ? 'setFloat32' : 'setFloat64'](0, value, true);
  return [...new Uint8Array(buffer)];
}
function snapshot(data, { sequence = 1, acknowledgement = 0, pending = 0, entities = [], removals = [], events = [], tail = [0, 0] } = {}) {
  const block = [...varint(removals.length), 71, 72, ...removals.flat(), 73, 74, ...entities.flat(), 0, 0, 0, 0];
  const body = [...varint(acknowledgement), ...varint(block.length), ...block, 75, ...events, 0, ...tail];
  return data.reader([...varint(sequence), ...body.map((value, index) => value ^ data.bytes[32272 + (index & 255)])],pending);
}
const byteFields = [1, 2, 9, 11, 12, 14, 17, 20, 22, 26, 31, 34, 36, 38, 43, 46, 47, 50, 54, 62, 63];
const floatFields = [5, 7, 13, 19, 21, 24, 27, 28, 32, 42, 45, 49, 53, 55, 59];
const arrayKinds = { 3: ['handle',10], 4: ['string',1], 10: ['string',10], 16: ['byte',10], 25: ['string',1], 33: ['bit',1], 35: ['double',1], 39: ['varint',10], 60: ['byte',16], 61: ['short',8] };
function fieldValue(field, { dense = false, stringLength = 4, value = 73 } = {}) {
  function element(kind) {
    if (kind === 'handle') return wireHandle(3);
    if (kind === 'string') return [...Array.from({length:stringLength},(_,i)=>65+i%26),0];
    if (kind === 'byte' || kind === 'bit') return [value];
    if (kind === 'double') return floating(-17.125,8);
    return varint(65538);
  }
  if (arrayKinds[field]) {
    const [kind,count] = arrayKinds[field];
    return dense ? Array.from({length:count},()=>element(kind)).flat() : [0,...element(kind),1];
  }
  if (byteFields.includes(field) || field > 63) return [value];
  if (floatFields.includes(field)) return floating(-3.25);
  if ([6,48].includes(field)) return element('string');
  if ([23,56,57].includes(field)) return wireHandle(3);
  if ([29,37,40].includes(field)) return [1];
  if ([18].includes(field)) return floating(3.25,8);
  if (field === 8) return integer(32100,2);
  return varint(65538);
}
function sparseFields(fields, options) {
  let previous = 0;
  return [...fields.flatMap(field => {
    const delta = (field - previous) >>> 0; previous = field;
    return [...varint(delta ^ 1), ...fieldValue(field,options)];
  }),1];
}

test('all63 sparse fields, unknown-field default, string storage and aligned reader paths match all64MiB', async () => {
  for (const field of [...Array.from({length:63},(_,i)=>i+1),64]) for (const stringLength of [4, 19]) {
    const {original} = await compare(
      data => { data.packetReader = snapshot(data,{entities:[[...wireHandle(0), 2 ^ 54, ...sparseFields([field],{stringLength})]]}); },
      data => data.running.call(1015,data.state,data.packetReader),
    );
    assert.equal(original.error,undefined,`field ${field}, stringLength ${stringLength}`);
  }
});
const denseGroups = [
  [1,[22,54]], [2,[36]], [5,[9]], [6,[1,5,6,16,20,21,24,32,34,47,56]],
  [7,[50]], [8,[13,37]], [10,[17]], [14,[43]], [15,[23,57]],
  [16,[3,10,11,12,19,30,39,42,45,46,52]], [19,[48]], [20,[53,55]],
  [21,[8,28,49]], [22,[29,40]], [25,[38]], [26,[7]],
  [27,[4,15,18,25,27,33,35,41,44,51]], [28,[14]], [30,[2,26,31,58,59,60,61,62,63]],
];
test('every dense component group and extended component30 fields match complete original writes', async () => {
  for (const [component,fields] of denseGroups) for (const extended of [false,true]) {
    const selected = component === 30 && !extended ? fields.slice(0,3) : fields;
    const flags = 1|8|(extended?64:0);
    const {original} = await compare(
      data => {data.packetReader=snapshot(data,{entities:[[...wireHandle(0),flags^54,...integer(1<<(component-1)),...(component === 22 ? [3] : selected.flatMap(field=>fieldValue(field,{dense:true})))]]});},
      data => data.running.call(1015,data.state,data.packetReader),
    );
    assert.equal(original.error,undefined,`component ${component}, extended ${extended}`);
  }
});

test('reference groups relocate, bind newly active generations, retire and grow beyond32 inline records', async () => {
  for (const count of [2,3,33,40]) {
    const {original} = await compare(
      data => {
        const references = Array.from({length:count},(_,i)=>[...wireHandle(i),2^54,...varint(23^1),...wireHandle(100+i),1]);
        data.readers = [
          snapshot(data,{entities:references}),
          snapshot(data,{sequence:2,entities:[[...wireHandle(100),2^54,1]]}),
          snapshot(data,{sequence:3,removals:[wireHandle(100)]}),
          snapshot(data,{sequence:4,entities:[[...wireHandle(100),130^54,1],[...wireHandle(100+count-1),2^54,1]]}),
          snapshot(data,{sequence:5,removals:Array.from({length:count},(_,i)=>wireHandle(i))}),
        ];
      },
      data => { for(const reader of data.readers) data.running.call(1015,data.state,reader); },
    );
    assert.equal(original.error,undefined,`reference group count ${count}`);
  }
});

test('retirement preserves generation checks, inactive entities, repeated removals and spatial vector swaps', async () => {
  for (const spatialIndex of [0,1,2,-1]) {
    const {original} = await compare(
      data => {
        const first = snapshot(data,{entities:[[...wireHandle(7),1^54,...integer(1<<25),1]]});
        data.running.call(1015,data.state,first);
        const component = data.get(data.entity(7)+140), tree=data.malloc(40), entries=data.malloc(12);
        data.bytes.fill(0,tree,tree+40);
        data.put(tree+24,3);data.put(tree+32,entries);
        for(let i=0;i<3;i++) data.put(entries+i*4,i===spatialIndex?component:0);
        data.put(component+56,tree);
        data.packetReader=snapshot(data,{sequence:2,removals:[wireHandle(7,2),wireHandle(8),wireHandle(7),wireHandle(7)]});
      },
      data=>data.running.call(1015,data.state,data.packetReader),
    );
    assert.equal(original.error,undefined);
  }
});
function reliableQueue(data, {count=4,capacity=count,shared=0}={}) {
  // The state constructor supplies one valid packet/shared owner. Move that
  // entry into a deliberately small vector, then create matching owned entries.
  const previous=data.get(data.state+2344), entries=data.malloc(capacity*16);
  data.bytes.fill(0xA5,entries,entries+capacity*16);
  for(let i=0;i<count;i++) {
    const packet=data.malloc(4112), owner=data.malloc(16), entry=entries+i*16;
    data.bytes.fill(0,packet,packet+16); data.bytes.fill(0,owner,owner+16);
    data.put(owner,33124);data.put(owner+4,shared);data.put(owner+12,packet);
    data.put(entry,(i+1)*10);data.put(entry+4,packet);data.put(entry+8,owner);data.bytes[entry+12]=i&1;
  }
  data.put(data.state+2336,count);data.put(data.state+2340,capacity);data.put(data.state+2344,entries);
  data.previousReliable=previous;
}
test('reliable acknowledgements cover binary search, owner bias and overlapping queue compaction', async () => {
  for(const acknowledgement of [0,10,20,30,40,0xFFFFFFFF]) for(const shared of [0,1,2]) {
    const {original}=await compare(
      data=>{reliableQueue(data,{shared});data.packetReader=snapshot(data,{acknowledgement});},
      data=>data.running.call(1015,data.state,data.packetReader),
    );
    assert.equal(original.error,undefined);
  }
});

test('login event tail emits inline/heap strings, grows packet storage and moves reliable ownership', async()=>{
  for(const stringLength of [0,4,10,11,4094,4095,4096,8193]) for(const occupied of [false,true]) {
    const {original}=await compare(
      data=>{
        if(occupied) reliableQueue(data,{count:1,capacity:1});
        const text=data.malloc(stringLength+1);data.bytes.fill(65,text,text+stringLength);data.bytes[text+stringLength]=0;
        data.hostResults[135069]=text;
        data.packetReader=snapshot(data);
      },
      data=>data.running.call(1015,data.state,data.packetReader),
    );
    assert.equal(original.error,undefined,`login string ${stringLength}, occupied ${occupied}`);
    assert.equal(original.data.bytes[original.data.state+1933],1);
  }
});

test('repeated sparse and dense interpolation preserves f32 rounding, timestamps and angle history', async()=>{
  const groups = [
    [6,478,[[5,16,20,24],[24,112,116,120]]],
    [8,0,[[13,8,12,16]]], [21,609,[[28,40,44,48],[49,64,68,72]]],
    [26,467,[[7,8,12,16]]], [30,491,[[59,16,20,24]]],
  ];
  for(const [component,constructor,fields] of groups) for(const oldTime of [-30,-60,-120,30]) {
    const {original}=await compare(
      data=>{
        const first=snapshot(data,{entities:[[...wireHandle(0),1^54,...integer(1<<(component-1)),1]]});
        data.running.call(1015,data.state,first);
        const target=constructor?data.running.call(constructor,data.entity()):data.state+312;
        for(const [,current,previous,timestamp] of fields) {
          data.view.setFloat32(target+current,1.0000001192092896,true);
          data.view.setFloat32(target+previous,-3.1415927410125732,true);
          data.bytes[target+timestamp]=1;data.view.setFloat64(target+timestamp+8,oldTime,true);
        }
        data.packetReader=snapshot(data,{sequence:2,entities:[[...wireHandle(0),2^54,...sparseFields(fields.map(f=>f[0]))]]});
      },
      data=>data.running.call(1015,data.state,data.packetReader),
    );
    assert.equal(original.error,undefined);
  }
  await compare(
    data=>{
      const entities=[[...wireHandle(0),1^54,...integer(1<<20),...sparseFields([8])]];
      data.readers=[snapshot(data,{entities}),snapshot(data,{sequence:2,entities})];
    },
    data=>{for(const reader of data.readers) data.running.call(1015,data.state,reader);},
  );
});

test('sequence boundaries, pending bits, stale block skip, duplicate events and ignored varint tail match',async()=>{
  for(const pending of [0,1,7]) for(const sequence of [0,1,127,128,0xFFFFFFFF]) {
    const {original}=await compare(
      data=>{data.packetReader=snapshot(data,{sequence,pending,events:[1,9,65,0,2,9,66,0],tail:[99,128,128,128,128,255,0xA7,0xA8]});},
      data=>data.running.call(1015,data.state,data.packetReader),
    );
    assert.equal(original.error,undefined);
  }
  await compare(
    data=>{data.put(data.state+2276,100);data.packetReader=snapshot(data,{sequence:50,entities:[[...wireHandle(7),2^54,0xA5,0xB7]],events:[1,9,65,0,101,9,66,0,102,9,67,0]});},
    data=>data.running.call(1015,data.state,data.packetReader),
  );
});

test('truncated framing and retained event traps preserve input mutation, stack and complete memory',async()=>{
  for(const pending of [0,1]) for(const length of [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]) {
    await compare(
      data=>{data.packetReader=snapshot(data,{pending});data.put(data.packetReader+4,length);},
      data=>data.running.call(1015,data.state,data.packetReader),
    );
  }
  for(const opcode of [2,8,10,12,13]) {
    const {original}=await compare(
      data=>{data.packetReader=snapshot(data,{events:[1,opcode]});},
      data=>data.running.call(1015,data.state,data.packetReader),
    );
    assert.deepEqual(original.error,{name:'RuntimeError',message:'unreachable'});
  }
});

test('complete dense declarations preserve group ordering, packed adjacent bits and component vectors',async()=>{
  for(const extended of [false,true]) {
    const flags=1|8|128|(extended?64:0);
    const values=denseGroups.flatMap(([component,fields])=>component===22?[3]:(component===30&&!extended?fields.slice(0,3):fields).flatMap(field=>fieldValue(field,{dense:true,stringLength:11})));
    const {original}=await compare(
      data=>{data.readers=[snapshot(data,{entities:[[...wireHandle(0),flags^54,...integer(0x3FFFFFFF),...values]]}),snapshot(data,{sequence:2,entities:[[...wireHandle(0),(flags|2)^54,...values]]})];},
      data=>{for(const reader of data.readers)data.running.call(1015,data.state,reader);},
    );
    assert.equal(original.error,undefined);
  }
});

test('nonfinite and subnormal wire floats retain original bit filtering and f32-to-f64 promotion',async()=>{
  for(const bits of [0,0x80000000,1,0x007FFFFF,0x00800000,0x7F7FFFFF,0x7F800000,0x7F800001,0x7FFFFFFF,0xFF800000]) {
    await compare(
      data=>{data.packetReader=snapshot(data,{entities:[[...wireHandle(0),2^54,...varint(19^1),...integer(bits),...varint((45-19)^1),...integer(bits),1]]});},
      data=>data.running.call(1015,data.state,data.packetReader),
    );
  }
  for(const bits of [0n,0x8000000000000000n,1n,0xFFFFFFFFFFFFFn,0x10000000000000n,0x7FEFFFFFFFFFFFFFn,0x7FF0000000000000n,0x7FF0000000000001n,0x7FFFFFFFFFFFFFFFn]) {
    const value=Array.from({length:8},(_,i)=>Number(bits>>BigInt(i*8)&255n));
    await compare(
      data=>{data.packetReader=snapshot(data,{entities:[[...wireHandle(0),2^54,...varint(18^1),...value,1]]});},
      data=>data.running.call(1015,data.state,data.packetReader),
    );
  }
});

test('sparse array deltas and repeated string replacement preserve element indexing and ownership',async()=>{
  const fieldArrays=Object.keys(arrayKinds).map(Number);
  for(const field of fieldArrays) {
    const values=fieldValue(field), element=values.slice(1,-1), update=[0,...element,...varint(2^1),...element,1];
    const {original}=await compare(
      data=>{data.readers=[snapshot(data,{entities:[[...wireHandle(0),2^54,...varint(field^1),...update,1]]}),snapshot(data,{sequence:2,entities:[[...wireHandle(0),2^54,...sparseFields([field],{stringLength:19})]]}),snapshot(data,{sequence:3,entities:[[...wireHandle(0),2^54,...sparseFields([field],{stringLength:0})]]})];},
      data=>{for(const reader of data.readers)data.running.call(1015,data.state,reader);},
    );
    assert.equal(original.error,undefined);
  }
});
