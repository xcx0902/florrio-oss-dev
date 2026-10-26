import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { createInitializationHooks, functionIds, dependencyIds, initializationStatus } from '../source/game/server/initialization.mjs';

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
  runtime=await loadOriginal('sp_server',{functionIds:[...dependencyIds,656,654,655,657],imports,construct:false});
  runtime.exports.p();
  const hooks=createInitializationHooks(runtime),bytes=Buffer.from(runtime.memory.buffer);
  const uint=(p,v)=>view().setUint32(p,v,true),byte=(p,v)=>view().setUint8(p,v);
  const capture=()=>({memory:Buffer.from(bytes),stack:runtime.stackPointer.value,seed,clock,clockActionCount});
  const restore=s=>{bytes.set(s.memory);runtime.stackPointer.value=s.stack;seed=s.seed;clock=s.clock;clockActionCount=s.clockActionCount;};
  function compare(args,label) {
    const before=capture();events.length=0;let expectedError,actualError;
    try{runtime.call(656,...args);}catch(error){expectedError=error.constructor.name;}
    const expected=capture(),expectedEvents=structuredClone(events);restore(before);events.length=0;
    try{hooks[656](...args);}catch(error){actualError=error.constructor.name;if(!expectedError)throw error;}
    assert.equal(actualError,expectedError,`${label}: trap`); assert.equal(runtime.stackPointer.value,expected.stack,`${label}: stack`);
    assert.deepEqual(events,expectedEvents,`${label}: host calls and output`);assert.equal(seed,expected.seed,`${label}: entropy consumption`);
    if(!bytes.equals(expected.memory)) {
      const differences=[];let total=0;for(let p=0;p<bytes.length;p++)if(bytes[p]!==expected.memory[p]){total++;if(differences.length<24)differences.push({address:p,original:expected.memory[p],recovered:bytes[p]});}
      assert.fail(`${label}: ${total} memory bytes differ ${JSON.stringify(differences)}`);
    }
  }
  return{runtime,hooks,events,bytes,uint,byte,capture,restore,compare,setScheduler(action){schedulerAction=action;},setClockAction(action){clockAction=action;clockActionCount=0;},advanceClock(){clock+=50;}};
}

test('the complete initializer is registered without a call back to its own original body',()=>{
  assert.deepEqual(functionIds,[656]);assert.equal(initializationStatus.complete,true);assert.ok(!dependencyIds.includes(656));
});

test('cold initialization matches every memory byte, stack, host call and output',async()=>{
  const{compare}=await oracle();compare([0,0],'cold default');
});

test('invalid literal UUID takes the full seeded generator and handshake branch',async()=>{
  const{byte,compare}=await oracle();byte(3633,120);compare([0xffffffff,0x7fffffff],'cold generated UUID');
});

test('cold catalog flags, incoming argument boundaries and dirty scratch preserve exact initialization',async()=>{
  const{runtime,bytes,byte,capture,restore,compare}=await oracle(),initial=capture();
  for(const[flag,args]of[[0,[0,0]],[1,[-1,-1]],[128,[0x7fffffff,0x80000000]],[255,[0x80000000,0x7fffffff]]]) {
    restore(initial);byte(8548272,flag);bytes.fill(0xa5,runtime.stackPointer.value-8192,runtime.stackPointer.value);
    compare(args,`catalog=${flag}, args=${args}, dirty stack`);
  }
});

test('UUID guard initialization and already seeded generators preserve the cold-session path',async()=>{
  const{byte,uint,compare,capture,restore}=await oracle(),initial=capture();
  for(const warm of [false,true]) {
    restore(initial);byte(3633,120);
    if(warm) {
      for(const guard of [8559280,8559284,8561792,8564304,8566816,8569328]) byte(guard,1);
      for(const index of [8561784,8564296,8566808,8569320]) uint(index,0);
    }
    compare([0,0],`generated UUID guards warm=${warm}`);
  }
});

test('warm calls flush inlined and allocated response buffers for every nonzero ready flag',async()=>{
  const{runtime,bytes,byte,uint,compare,capture,restore}=await oracle();runtime.call(656,0,0);const initial=capture();
  for(const flag of [1,128,255])for(const count of [0,1,3]) {
    restore(initial);byte(8545776,flag);byte(8545512,count);
    for(let index=0;index<count;index++) {
      const packet=runtime.call(16,32),heap=index%2?runtime.call(16,8):0;bytes.fill(0,packet,packet+32);
      uint(packet+4,5);uint(packet+12,heap);uint(8545516+(index<<2),packet);
      bytes.set([index,1,127,128,255],heap||packet+16);
    }
    compare([0xffffffff,0x7fffffff],`warm flag=${flag}, queued=${count}`);
  }
});

test('scheduler callback can stop initialization flushing or add the initial reply',async()=>{
  const{runtime,bytes,byte,uint,setScheduler,compare,capture,restore}=await oracle(),initial=capture();
  for(const stop of [false,true]) {
    restore(initial);setScheduler(()=>{
      if(stop) {byte(8545776,0);return;}
      const packet=runtime.call(16,32);bytes.fill(0,packet,packet+32);uint(packet+4,3);bytes.set([5,6,7],packet+16);
      uint(8545516,packet);byte(8545512,1);
    });compare([0,0],`scheduler stop=${stop}`);
  }
});

test('session player component acquires every free-heap shape from the shared ABI',async()=>{
  const{runtime,bytes,uint,setClockAction,compare,capture,restore}=await oracle(),initial=capture();
  for(const count of [1,2,3,4,5,8,9]) {
    restore(initial);setClockAction(number=>{
      if(number) return;
      const chunk=runtime.call(16,count*292),heap=runtime.call(16,count*4);bytes.fill(0,chunk,chunk+count*292);
      for(let index=0;index<count;index++) uint(heap+(index<<2),chunk+(count-1-index)*292);
      uint(22928+240,count);uint(22928+248,heap);
    });compare([0,0],`player free heap count=${count}`);
  }
});

test('session player lookup reuses a disconnected match and rejects each occupied variant',async()=>{
  const{runtime,bytes,byte,uint,setClockAction,compare,capture,restore}=await oracle(),initial=capture();
  for(const rejection of ['none','index-zero','token','name','owned','unavailable']) {
    restore(initial);setClockAction(number=>{
      if(number) return;
      const entity=runtime.call(74,22928),player=runtime.call(16,292),entries=runtime.call(16,4);bytes.fill(0,player,player+292);
      uint(player,entity);uint(player+172,rejection==='index-zero'?0:0xffffffff);
      if(rejection==='token') byte(player+176,65);
      if(rejection==='name') byte(player+216,65);
      if(rejection==='owned') uint(entity+32,1);
      if(rejection==='unavailable') byte(player+80,1);
      uint(entries,player);uint(23184,1);uint(23188,1);uint(23192,entries);
    });compare([0,0],`reconnect ${rejection}`);
  }
});

test('a partially used player chunk and a full pointer vector retain pool allocation order',async()=>{
  const{runtime,bytes,uint,setClockAction,compare,capture,restore}=await oracle(),initial=capture();
  for(const used of [0,1,127,128])for(const fullVector of [false,true]) {
    restore(initial);setClockAction(number=>{
      if(number) return;
      const chunk=runtime.call(16,37376),chunks=runtime.call(16,4);bytes.fill(0,chunk,chunk+37376);uint(chunks,chunk);
      uint(22928+224,used);uint(22928+228,1);uint(22928+232,fullVector?1:1024);uint(22928+236,chunks);
    });compare([0,0],`player chunk used=${used}, full=${fullVector}`);
  }
});

test('the recovered initializer preserves a captured-input world for forty actual ticks',async()=>{
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
      imports.readable={f656:(...args)=>{hookCalls++;return hooks[656](...args);}};
      const instance=new WebAssembly.Instance(compiled,imports);runtime.attach(instance);hooks=createInitializationHooks(runtime);
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
  compare('initial world');assert.equal(recovered.hookCalls,1,'world must call the recovered initializer');
  for(let step=0;step<40;step++){if(step<packets.length){const packet=Uint8Array.from(packets[step].bytes);original.send(packet);recovered.send(packet);}original.advance();recovered.advance();compare(`tick ${step}`);}
});
