import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createComponentHooks,functionIds,dependencyIds} from '../source/game/server/components.mjs';

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
  runtime=await loadOriginal('sp_server',{functionIds:[...dependencyIds,...functionIds,74,656,654,655,657],imports,construct:false});
  runtime.exports.p();
  runtime.call(656,0,0);
  const hooks=createComponentHooks(runtime),bytes=Buffer.from(runtime.memory.buffer);
  const uint=(p,v)=>view().setUint32(p,v,true),byte=(p,v)=>view().setUint8(p,v);
  const capture=()=>({memory:Buffer.from(bytes),stack:runtime.stackPointer.value,seed,clock,clockActionCount});
  const restore=s=>{bytes.set(s.memory);runtime.stackPointer.value=s.stack;seed=s.seed;clock=s.clock;clockActionCount=s.clockActionCount;};
  function compare(id,args,label) {
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


const pools=[[65,52,1024],[68,56,1024],[97,120,1024],[106,16,128],[128,24,128],[148,16,1024]];
const attachments=[[64,95,2,1472,456],[67,94,8,1208,408],[96,94,16,1252,416],[147,95,1,1428,448]];
function allocate(state,size,fill=0){const pointer=state.runtime.call(16,size);state.bytes.fill(fill,pointer,pointer+size);return pointer;}

test('all complete component functions are present without own-body fallback dependencies',()=>{assert.equal(functionIds.length,13);assert.ok(functionIds.every(id=>!dependencyIds.includes(id)));});

test('pooled records preserve dirty bytes, per-type chunk boundaries and vector growth order',async()=>{
  const state=await oracle(),pool=allocate(state,28),initial=state.capture();
  for(const[id,stride,block]of pools)for(const used of[0,1,block-1,block,block+1])for(const capacity of[0,1,8]){
    state.restore(initial);const chunk=allocate(state,stride*block,0xa5),chunks=allocate(state,capacity?capacity*4:4);state.uint(chunks,chunk);state.uint(pool,used);state.uint(pool+4,1);state.uint(pool+8,capacity);state.uint(pool+12,chunks);
    state.compare(id,[pool],`pool=${id}, used=${used}, capacity=${capacity}`);
  }
});

test('max-pointer free heaps preserve ties, unsigned pointer order and signed count exits',async()=>{
  const state=await oracle(),pool=allocate(state,28),heap=allocate(state,128),initial=state.capture();
  for(const[id]of pools)for(const values of[[19],[19,7],[19,13,7],[19,13,13,7],[19,18,17,16,15,14,13,12,11],[19,18,18,18,18,18,18,18],[0xffffffff,0x80000000,0x7fffffff,0,0x40000000],[1,1,1,1,1,1,1,1]]){
    state.restore(initial);state.uint(pool+16,values.length);state.uint(pool+24,heap);values.forEach((value,index)=>state.uint(heap+index*4,value));state.compare(id,[pool],`heap=${id}: ${values}`);
  }
  for(const[id]of pools)for(const count of[0x80000000,0xffffffff]){state.restore(initial);state.uint(pool+16,count);state.uint(pool+24,heap);state.uint(heap,0xffffffff);state.compare(id,[pool],`signed heap=${id}, count=${count}`);}
});

test('attachments set flags, release both caches and grow exact changed-component vectors',async()=>{
  const state=await oracle(),entity=state.runtime.call(74,22928),component=allocate(state,128),initial=state.capture();
  const view=new DataView(state.runtime.memory.buffer),index=view.getUint32(entity+16,true)&16383;
  for(const[id,flagOffset,flag,vectorOffset]of attachments)for(const count of[0,1,2,8])for(const cached of[false,true]){
    state.restore(initial);state.byte(entity+flagOffset,0x80);state.uint(22928+2140,0xfedcba98);const entries=allocate(state,Math.max(4,count*4));for(let i=0;i<count;i++)state.uint(entries+i*4,0xabcdef00+i);state.uint(22928+vectorOffset,count);state.uint(22928+vectorOffset+4,count);state.uint(22928+vectorOffset+8,entries);
    if(cached)for(const offset of[264876,264880]){const packet=allocate(state,32),body=allocate(state,32);state.uint(packet+12,body);state.uint(22928+(index<<3)+offset,packet);}
    state.compare(id,[entity,component],`attach=${id}, count=${count}, cached=${cached}`);assert.equal(state.bytes[entity+flagOffset],0x80|flag);
  }
});

test('behavior creation preserves complete defaults, unused bytes, lazy reuse and free-record initialization',async()=>{
  const state=await oracle(),entity=state.runtime.call(74,22928),initial=state.capture();
  for(const freeCount of[0,1,2,3,4,8]){
    state.restore(initial);const chunk=allocate(state,Math.max(1,freeCount)*192,0xa5),heap=allocate(state,Math.max(4,freeCount*4));for(let i=0;i<freeCount;i++)state.uint(heap+i*4,chunk+(freeCount-1-i)*192);state.uint(22928+64,freeCount);state.uint(22928+72,heap);
    state.compare(115,[entity],`create behavior free=${freeCount}`);state.compare(115,[entity],`existing behavior free=${freeCount}`);
  }
});

test('weighted population spawning preserves every band RNG and original allocation',async()=>{
  const state=await oracle(),initial=state.capture();
  for(const band of[0,1,2,3,4,5,6,7])for(const seed of[0,1,0x7fffffff,0xffffffff]){state.restore(initial);state.uint(8573024,seed);state.compare(113,[band],`spawn band=${band}, seed=${seed}`);}
});

test('behavior settings preserve timed/cached orientation, RNG and host scratch frames',async()=>{
  const state=await oracle(),entity=state.runtime.call(144,22928+1936,1,0,0,-1),component=state.runtime.call(115,entity),settings=allocate(state,92),view=new DataView(state.runtime.memory.buffer),initial=state.capture();
  for(const timer of[0,100,Infinity,NaN])for(const sameAngle of[0,1])for(const cached of[0,1]){
    state.restore(initial);view.setFloat32(settings+40,timer,true);state.byte(settings+4,sameAngle);const position=view.getUint32(entity+168,true);state.byte(position+80,cached);state.compare(114,[component,settings],`configure timer=${timer}, same=${sameAngle}, cached=${cached}`);
  }
});
