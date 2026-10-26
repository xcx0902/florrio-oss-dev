import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createInputHooks,functionIds,dependencyIds,inputStatus} from '../source/game/server/input.mjs';

async function oracle() {
  let runtime, seed=0x6f6c6446, clock=1000, schedulerAction, clockAction, clockActionCount=0;
  const events=[];
  const view=()=>new DataView(runtime.memory.buffer);
  function bridge(code,signature,pointer) {
    events.push(['bridge',code,signature,pointer]);
    switch(code) {
      case 22600: schedulerAction?.(); return 0;
      case 22639: return 0;
      case 22791: return 1;
      case 22855: clockAction?.(clockActionCount++); return clock;
      case 22903: return view().getFloat64(pointer,true)%view().getFloat64(pointer+8,true);
      default: throw new Error(`Unexpected bridge ${code}`);
    }
  }
  const imports={a:{a:bridge,b:bridge,
    c:(p,n)=>events.push(['final',p,n]),
    d:(p,n)=>events.push(['data',p,n,Buffer.from(new Uint8Array(runtime.memory.buffer,p,n)).toString('hex')]),
    e:()=>{throw new WebAssembly.RuntimeError('OOM');},f:()=>{throw new WebAssembly.RuntimeError('abort');},
    n:(p,n)=>{events.push(['entropy',p,n]);const bytes=new Uint8Array(runtime.memory.buffer);for(let i=0;i<n;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;bytes[p+i]=seed&255;}return 0;},
  }};
  runtime=await loadOriginal('sp_server',{functionIds:[...dependencyIds,388,655,656,654,657],imports,construct:false});
  runtime.exports.p();
  runtime.call(656,0,0);
  const hooks=createInputHooks(runtime),bytes=Buffer.from(runtime.memory.buffer);
  const uint=(p,v)=>view().setUint32(p,v,true),byte=(p,v)=>view().setUint8(p,v);
  const capture=()=>({memory:Buffer.from(bytes),stack:runtime.stackPointer.value,seed,clock,clockActionCount});
  const restore=s=>{bytes.set(s.memory);runtime.stackPointer.value=s.stack;seed=s.seed;clock=s.clock;clockActionCount=s.clockActionCount;};
  function compare(args,label,id=655) {
    const before=capture();events.length=0;let expectedError,actualError,expectedResult,actualResult;
    try{expectedResult=runtime.call(id,...args);}catch(error){expectedError=error.constructor.name;}
    const expected=capture(),expectedEvents=structuredClone(events);restore(before);events.length=0;
    try{actualResult=hooks[id](...args);}catch(error){actualError=error.constructor.name;if(!expectedError)throw error;}
    assert.equal(actualResult,expectedResult,`${label}: return`);assert.equal(actualError,expectedError,`${label}: trap`); assert.equal(runtime.stackPointer.value,expected.stack,`${label}: stack`);
    assert.deepEqual(events,expectedEvents,`${label}: host calls and output`);assert.equal(seed,expected.seed,`${label}: entropy consumption`);
    if(!bytes.equals(expected.memory)) {
      const differences=[];let total=0;for(let p=0;p<bytes.length;p++)if(bytes[p]!==expected.memory[p]){total++;if(differences.length<24)differences.push({address:p,original:expected.memory[p],recovered:bytes[p]});}
      assert.fail(`${label}: ${total} memory bytes differ ${JSON.stringify(differences)}`);
    }
  }
  return{runtime,hooks,events,bytes,uint,byte,capture,restore,compare,setScheduler(action){schedulerAction=action;},setClockAction(action){clockAction=action;clockActionCount=0;},advanceClock(){clock+=50;}};
}


function encode(runtime,decoded){const key=new Uint8Array(runtime.memory.buffer,4576,256);return Uint8Array.from(decoded,(value,index)=>value^key[index&255]);}
function allocatePacket(state,decoded){const encoded=encode(state.runtime,decoded),pointer=state.runtime.call(16,Math.max(1,encoded.length));state.bytes.set(encoded,pointer);return[pointer,encoded.length];}

test('complete input and unsigned-varint bodies are independently recovered',()=>{assert.deepEqual(functionIds,[388,655]);assert.equal(inputStatus.complete,true);assert.ok(!dependencyIds.includes(655));});

test('all retained input packets match original decoding and commands with full shared memory',async()=>{
  const state=await oracle();const packets=JSON.parse(await fs.readFile(new URL('../reports/runtime/client-packet-traces.json',import.meta.url),'utf8')).packets.filter(p=>p.direction==='toWorker');
  for(let step=0;step<packets.length;step++){
    const pointer=state.runtime.call(16,packets[step].bytes.length);state.bytes.set(packets[step].bytes,pointer);state.compare([pointer,packets[step].bytes.length],`captured packet ${step}`);state.runtime.call(14,pointer);
    state.advanceClock();state.runtime.call(654);state.runtime.call(657,0,0);
  }
});

test('empty and parser-only commands retain string construction, decryption and cursor effects',async()=>{
  const state=await oracle(),initial=state.capture();
  const string=value=>[...Buffer.from(value),0];
  for(const decoded of [[],[0],[0,1],[1,1],[2,2,1,...string('short'),...string('more')],[3,0,1,...string('a'),...string('b'),...string('c')],[4,5,...string('short')],[5,5,...string('a long string exceeding ten')],[6,0,0,...string('123456789012345'),...string('another long string'),...string('third string length')]]){
    state.restore(initial);state.compare(allocatePacket(state,decoded),`parse ${decoded.slice(0,5)}`);
  }
});

test('full player spawn preserves components, RNG, normalized names and initial equipment',async()=>{
  const state=await oracle(),initial=state.capture();
  for(const name of ['', 'Player','  Flower  ','abcdefghijklmnopqrst','玩家小花','\tA\nB\r','aaaaaaaaaaaaé','bad\u0001name']){
    state.restore(initial);state.compare(allocatePacket(state,[1,6,...Buffer.from(name),0]),`spawn ${JSON.stringify(name)}`);
  }
});

const varuint=value=>{const bytes=[];value>>>=0;do{const more=value>127;bytes.push((value&127)|(more?128:0));value>>>=7;}while(value);return bytes;};
const floatBytes=(angle,strength)=>{const data=Buffer.alloc(8);data.writeFloatLE(angle,0);data.writeFloatLE(strength,4);return[...data];};
const playerPointer=state=>new DataView(state.runtime.memory.buffer).getUint32(new DataView(state.runtime.memory.buffer).getUint32(24936,true)+120,true);

test('spawn level bands, arena sizes and remembered equipment retain exact level/RNG behavior',async()=>{
  const state=await oracle(),initial=state.capture();
  for(const level of [0,1,12,13,15,27,28,30,42,43,45,60])for(const compact of [false,true]){
    state.restore(initial);const player=playerPointer(state);state.byte(player+8,level);state.byte(23801,compact?1:0);state.byte(player+96,16);
    for(let slot=0;slot<16;slot++)state.byte(player+28+slot,1+(slot%7));
    state.compare(allocatePacket(state,[1,6,...Buffer.from('Level flower'),0]),`spawn level=${level}, compact=${compact}`);
  }
});

test('rare starter RNG selects exactly one special petal and honors existing rare populations',async()=>{
  const state=await oracle(),initial=state.capture();
  for(const blocker of ['none','avatar','petal']){
    state.restore(initial);state.uint(8573024,10794);
    if(blocker==='avatar'){
      const avatar=state.runtime.call(16,744),entries=state.runtime.call(16,4);state.bytes.fill(0,avatar,avatar+744);state.uint(avatar,24936);state.byte(avatar+148,1);for(let slot=0;slot<13;slot++)state.byte(avatar+20+slot,35);state.uint(entries,avatar);state.uint(22928+1764,1);state.uint(22928+1768,1);state.uint(22928+1772,entries);
    }
    if(blocker==='petal'){
      const petal=state.runtime.call(16,16),entries=state.runtime.call(16,4);state.bytes.fill(0,petal,petal+16);state.byte(petal+8,35);state.uint(entries,petal);state.uint(22928+36,1);state.uint(22928+40,1);state.uint(22928+44,entries);
    }
    state.compare(allocatePacket(state,[1,6,0]),`rare starter blocker=${blocker}`);
    const view=new DataView(state.runtime.memory.buffer),entity=view.getUint32(playerPointer(state)+100,true),avatar=view.getUint32(entity+200,true);
    assert.equal(state.bytes[avatar+20],blocker==='none'?35:1,`rare blocker ${blocker} must take its branch`);
  }
});

test('commands reject stale sequences while preserving payload parsing and nonfinite float normalization',async()=>{
  const state=await oracle();state.compare(allocatePacket(state,[1,6,0]),'prepare living player');state.byte(24837,1);const initial=state.capture();
  const commands=[[3,0],[4],[5,...Buffer.from('hello'),0],[6,...Buffer.from('ignored spawn'),0],[7,0],[8,0,1],[10,0,1,1,1],[13]];
  for(const stale of [false,true])for(let index=0;index<commands.length;index++){
    state.restore(initial);state.uint(88,stale?100:0);state.compare(allocatePacket(state,[50,...commands[index]]),`command=${commands[index][0]}, stale=${stale}`);
  }
  for(const angle of [0,-0,1,-1,Math.PI,Infinity,-Infinity,NaN,1e-40])for(const strength of [-1,0,123,NaN]){
    state.restore(initial);state.compare(allocatePacket(state,[2,12,...varuint(0x10000003),...floatBytes(angle,strength)]),`input angle=${angle}, strength=${strength}`);
  }
});

test('inventory cycling, swaps and FIFO discard preserve all level thresholds and exact item validation',async()=>{
  const state=await oracle();state.compare(allocatePacket(state,[1,6,0]),'prepare inventory player');state.byte(24837,1);const initial=state.capture();
  for(const level of [1,14,15,29,30,44,45])for(const command of [[13],[10,0,1,1,1],[10,0,2,1,1],[8,0,1],[8,2,5]]){
    state.restore(initial);const view=new DataView(state.runtime.memory.buffer),entity=view.getUint32(playerPointer(state)+100,true),avatar=view.getUint32(entity+200,true);state.byte(avatar+148,level);state.byte(avatar+22,5);
    state.byte(avatar+704,16);for(let index=0;index<16;index++)state.byte(avatar+705+index,index+1);
    state.compare(allocatePacket(state,[2,...command]),`inventory level=${level}, command=${command}`);
  }
});

test('unsigned reader preserves pending alignment, truncated encodings and all five LEB128 groups',async()=>{
  const state=await oracle(),reader=state.runtime.call(16,16),data=state.runtime.call(16,16),initial=state.capture();
  for(const encoded of [[],[0],[1],[127],[128],[255],[128,1],[255,255,255,255,15],[255,255,255,255,255],[128,128,128,128,0],[129,128,128,128,128,127]])for(const pending of [0,1])for(const cursor of [0,1,encoded.length]){
    state.restore(initial);state.bytes.set(encoded,data);state.uint(reader,data);state.uint(reader+4,encoded.length);state.uint(reader+8,cursor);state.uint(reader+12,pending);state.compare([reader],`reader ${encoded}, pending=${pending}, cursor=${cursor}`,388);
  }
});

test('partial command payloads and multi-byte sequence numbers preserve read progress',async()=>{
  const state=await oracle();state.compare(allocatePacket(state,[1,6,0]),'prepare truncation player');state.byte(24837,1);const initial=state.capture();
  for(const payload of [[12,...varuint(0xffffffff),...floatBytes(2.5,100)],[10,0,1,1,1],[8,0,1],[0,1,65,0,66,0,67,0],[2,1,65,0,66,0]])for(let length=0;length<=payload.length;length++){
    state.restore(initial);state.compare(allocatePacket(state,[...varuint(0xffffffff),...payload.slice(0,length)]),`truncated opcode=${payload[0]}, length=${length}`);
  }
});

test('network ready/closing flags, size limits and lifecycle commands preserve close reasons',async()=>{
  const state=await oracle(),initial=state.capture();
  for(const ready of [0,1,255])for(const network of [false,true])for(const size of [0,65536,65537,0xffffffff]){
    state.restore(initial);state.byte(8545776,ready);state.byte(418936,network?0:1);const pointer=state.runtime.call(16,65536);state.bytes.fill(0,pointer,pointer+65536);
    if(size===65536)state.bytes.set(encode(state.runtime,new Uint8Array(65536).fill(1)),pointer);
    state.compare([pointer,size],`ready=${ready}, network=${network}, size=${size}`);
  }
  for(const closing of [false,true])for(const command of [[4],[7,0],[7,1],[3,0]]){
    state.restore(initial);state.byte(418936,0);state.byte(418937,closing?1:0);state.byte(23801,1);state.byte(24839,1);state.byte(24837,1);
    state.compare(allocatePacket(state,[1,...command]),`network closing=${closing}, command=${command}`);
  }
});

test('avatar component free heaps and chunk reuse preserve all inlined pool paths',async()=>{
  const state=await oracle(),initial=state.capture();
  for(const count of [1,2,3,4,7,8]){
    state.restore(initial);const chunk=state.runtime.call(16,count*744),heap=state.runtime.call(16,count*4);state.bytes.fill(0x5a,chunk,chunk+count*744);for(let index=0;index<count;index++)state.uint(heap+(index<<2),chunk+(count-index-1)*744);
    state.uint(22928+1748,count);state.uint(22928+1756,heap);state.compare(allocatePacket(state,[1,6,0]),`avatar free heap ${count}`);
  }
  for(const used of [0,1,127]){
    state.restore(initial);const chunk=state.runtime.call(16,95232),entries=state.runtime.call(16,4);state.bytes.fill(0x5a,chunk,chunk+95232);state.uint(entries,chunk);state.uint(22928+1732,used);state.uint(22928+1736,1);state.uint(22928+1740,1);state.uint(22928+1744,entries);
    state.compare(allocatePacket(state,[1,6,0]),`avatar chunk used=${used}`);
  }
});

test('the recovered input and unsigned reader preserve forty captured-input world ticks',async()=>{
  const[{default:wabtFactory},{makeReadableWat},{createRuntimeContext}]=await Promise.all([import('wabt'),import('../tools/lib/readable-wasm.mjs'),import('../source/runtime/context.mjs')]);
  const wabt=await wabtFactory(),wat=await fs.readFile(new URL('../source/wasm/sp_server.wat',import.meta.url),'utf8'),inventory=JSON.parse(await fs.readFile(new URL('../reports/wasm/sp_server-functions.json',import.meta.url),'utf8'));
  const transformed=makeReadableWat(wat,inventory,functionIds.map(id=>({id}))).text;
  const parsed=wabt.parseWat('initializer.wat',transformed);parsed.resolveNames();parsed.validate();const compiled=new WebAssembly.Module(parsed.toBinary({}).buffer);parsed.destroy();
  async function world(recovered) {
    let runtime,clock=1000,seed=0x6f6c6446,hookCalls=0;const outgoing=[],hosts=[];const view=()=>new DataView(runtime.memory.buffer);
    function bridge(code,signature,pointer){hosts.push([code,signature,pointer]);switch(code){case 22600:case 22639:return 0;case 22791:return 1;case 22855:return clock;case 22903:return view().getFloat64(pointer,true)%view().getFloat64(pointer+8,true);default:throw new Error(`Unexpected bridge ${code}`);}}
    const imports={a:{a:bridge,b:bridge,c:(p,n)=>outgoing.push(['final',p,n]),d:(p,n)=>outgoing.push(['data',p,n,Buffer.from(new Uint8Array(runtime.memory.buffer,p,n)).toString('hex')]),e:()=>{throw new WebAssembly.RuntimeError('OOM');},f:()=>{throw new WebAssembly.RuntimeError('abort');},i:(count,size)=>{view().setUint32(count,0,true);view().setUint32(size,0,true);return 0;},j:(fd,vectors,count,written)=>{let size=0;for(let i=0;i<count;i++)size+=view().getUint32(vectors+i*8+4,true);view().setUint32(written,size,true);return 0;},n:(p,n)=>{hosts.push(['entropy',p,n]);const bytes=new Uint8Array(runtime.memory.buffer);for(let i=0;i<n;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;bytes[p+i]=seed&255;}return 0;}}};
    if(recovered){
      for(const entry of WebAssembly.Module.imports(compiled))(imports[entry.module]??={})[entry.name]??=()=>0;
      runtime=createRuntimeContext(imports);let hooks;
      imports.readable={f388:(...args)=>hooks[388](...args),f655:(...args)=>{hookCalls++;return hooks[655](...args);}};
      const instance=new WebAssembly.Instance(compiled,imports);runtime.attach(instance);hooks=createInputHooks(runtime);
    }else runtime=await loadOriginal('sp_server',{functionIds:[14,16,654,655,656,657],imports,construct:false});
    runtime.exports.p();runtime.call(656,0,0);
    return{runtime,outgoing,hosts,get hookCalls(){return hookCalls;},send(packet){const p=runtime.call(16,packet.length);new Uint8Array(runtime.memory.buffer).set(packet,p);runtime.call(655,p,packet.length);runtime.call(14,p);},advance(){clock+=50;runtime.call(654);runtime.call(657,0,0);}};
  }
  const original=await world(false),recovered=await world(true);
  const packets=JSON.parse(await fs.readFile(new URL('../reports/runtime/client-packet-traces.json',import.meta.url),'utf8')).packets.filter(p=>p.direction==='toWorker');
  function compare(label){
    const expected=Buffer.from(original.runtime.memory.buffer),actual=Buffer.from(recovered.runtime.memory.buffer);
    if(!actual.equals(expected)){const differences=[];for(let p=0;p<actual.length&&differences.length<20;p++)if(actual[p]!==expected[p])differences.push({address:p,original:expected[p],recovered:actual[p]});assert.fail(`${label}: full memory ${JSON.stringify(differences)}`);}
    assert.equal(recovered.runtime.stackPointer.value,original.runtime.stackPointer.value,`${label}: stack`);assert.deepEqual(recovered.hosts,original.hosts,`${label}: hosts`);assert.deepEqual(recovered.outgoing,original.outgoing,`${label}: packets`);
  }
  compare('initial world');assert.equal(recovered.hookCalls,0,'world initialization does not call input');
  for(let step=0;step<40;step++){if(step<packets.length){const packet=Uint8Array.from(packets[step].bytes);original.send(packet);recovered.send(packet);}original.advance();recovered.advance();compare(`tick ${step}`);}
  assert.equal(recovered.hookCalls,Math.min(packets.length,40),'every captured packet must call the recovered input');
});
