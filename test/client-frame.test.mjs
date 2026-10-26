import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import wabtFactory from 'wabt';
import { typedIndirectCall } from '../source/runtime/indirect.mjs';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { makeReadableWat } from '../tools/lib/readable-wasm.mjs';
import { createClientFrameHooks } from '../source/game/client/frame.mjs';
const functionIds=[762];

const originalBytes = await readFile(new URL('../web/client.wasm', import.meta.url));
const originalModule = new WebAssembly.Module(originalBytes);
const inventory = JSON.parse(await readFile(new URL('../reports/wasm/client-functions.json', import.meta.url)));
const names = inventory.find(row => row.id === 762).directCalls;
const dependencies = [...names.map(name => inventory.find(row => row.name === name).id), 1096, 763];
const packetTrace = JSON.parse(await readFile(new URL('../reports/runtime/client-packet-traces.json', import.meta.url)));
const packets = packetTrace.packets.filter(packet => packet.direction === 'fromWorker' && packet.bytes[0] === 1);
let patchedModule;

async function getPatchedModule() {
  if (patchedModule) return patchedModule;
  const wabt = await wabtFactory();
  const wat = await readFile(new URL('../source/wasm/client.wat', import.meta.url), 'utf8');
  const inventory = JSON.parse(await readFile(new URL('../reports/wasm/client-functions.json', import.meta.url)));
  const result = makeReadableWat(wat, inventory, functionIds.map(id => ({ id, source: 'game/client/frame.mjs' })));
  const parsed = wabt.parseWat('client-frame.wat', result.text);
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
  hooks = createClientFrameHooks(running);
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


function packet(data,length,heap=false) {
  const object=data.malloc(4112);data.bytes.fill(0xA5,object,object+4112);data.put(object,19);data.put(object+4,length);data.put(object+8,0);data.put(object+12,0);
  if(heap){const storage=data.malloc(8192);data.bytes.fill(0x5A,storage,storage+8192);data.put(object+8,8192);data.put(object+12,storage);}
  return object;
}
function queue(data,{flags=[],acknowledgement=0,shared=0,payloadLength=5}={}) {
  const entries=data.malloc(Math.max(flags.length,1)*16);data.bytes.fill(0xA5,entries,entries+Math.max(flags.length,1)*16);
  for(let i=0;i<flags.length;i++){
    const source=packet(data,payloadLength,payloadLength>4096),owner=data.malloc(16),entry=entries+i*16;
    data.bytes.fill(0,owner,owner+16);data.put(owner,33124);data.put(owner+4,shared);data.put(owner+12,source);
    data.put(entry,(i+1)*128);data.put(entry+4,source);data.put(entry+8,owner);data.bytes[entry+12]=flags[i];
  }
  data.put(data.state+2336,flags.length);data.put(data.state+2340,flags.length);data.put(data.state+2344,entries);data.put(data.state+2356,acknowledgement);
}
test('reliable input serialization covers ack search, stable partition, ownership, XOR and byte-buffer growth',async()=>{
  for(const flags of [[],[0],[1],[0,0],[0,1],[1,0],[1,1],[0,1,0,1,0,1],[1,0,1,0,1,0],[0,1,0,1,1,0,1,0]])for(const acknowledgement of[0,128,256,0xFFFFFFFF]){
    const {original}=await compare(
      data=>{queue(data,{flags,acknowledgement});data.packet=packet(data,4094);},
      data=>data.running.call(762,data.state,data.packet),
    );assert.equal(original.error,undefined);
  }
  for(const shared of[0,1,2])for(const heap of[false,true]){
    const {original}=await compare(
      data=>{queue(data,{flags:[0,1,0,1],shared,payloadLength:5000});data.packet=packet(data,4095,heap);},
      data=>data.running.call(762,data.state,data.packet),
      true,
    );assert.equal(original.error,undefined);
  }
});
