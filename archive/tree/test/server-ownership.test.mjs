import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { createOwnershipHooks, functionIds } from '../source/game/server/ownership.mjs';

async function oracle() {
  const runtime=await loadOriginal('sp_server',{functionIds:[...functionIds,14,15,16,144]});
  runtime.exports.u(0,0);
  const bytes=Buffer.from(runtime.memory.buffer), view=new DataView(runtime.memory.buffer), hooks=createOwnershipHooks(runtime);
  const word=(a,v)=>view.setUint32(a,v,true), u32=a=>view.getUint32(a,true);
  const allocate=size=>{const p=runtime.call(16,size);bytes.fill(0,p,p+size);return p;};
  const actors=Array.from({length:4},(_,i)=>runtime.call(144,22928+1936,1,100+i,200+i,-1));
  const capture=()=>({memory:Buffer.from(bytes),stack:runtime.stackPointer.value});
  const restore=s=>{bytes.set(s.memory);runtime.stackPointer.value=s.stack;};
  function compare(id,args,label) {
    const before=capture();let expectedReturn,actualReturn,expectedError,actualError;
    try{expectedReturn=runtime.call(id,...args);}catch(e){expectedError=[e.constructor.name,e.message];}
    const expected=capture();restore(before);
    try{actualReturn=hooks[id](...args);}catch(e){actualError=[e.constructor.name,e.message];}
    assert.equal(actualReturn,expectedReturn,`${label}: return`);assert.deepEqual(actualError,expectedError,`${label}: trap`);
    assert.equal(runtime.stackPointer.value,expected.stack,`${label}: stack`);
    if(!bytes.equals(expected.memory)) {
      const diff=[];for(let i=0;i<bytes.length&&diff.length<20;i++)if(bytes[i]!==expected.memory[i])diff.push({at:i,original:expected.memory[i],recovered:bytes[i]});
      assert.fail(`${label}: memory ${JSON.stringify(diff)}`);
    }
  }
  function packetCache(entity) {
    const index=u32(entity+16)&16383, world=u32(entity);
    for(const offset of [264876,264880]) {const p=allocate(32);word(p+12,allocate(24));word(world+index*8+offset,p);}
  }
  return {runtime,bytes,view,word,u32,allocate,actors,capture,restore,compare,packetCache};
}

test('owner assignment matches first attachment, same-owner relink, replacement and removal',async()=>{
  const o=await oracle(),{actors,compare,bytes,u32}=o;
  const [child,ownerA,ownerB,otherChild]=actors;
  for(const owner of [0,ownerA,ownerA,ownerB,0,ownerB]) {
    compare(73,[child,owner],`owner=${owner}`);
    assert.equal(u32(child+236),owner);
  }
  compare(73,[otherChild,ownerB],'second child');
  compare(73,[child,0],'remove first child with next');
  compare(73,[child,ownerB],'append after second child');
  compare(73,[child,ownerA],'remove tail with previous');
  assert.ok(bytes[child+93]&64,'ownership component actually attached');
});

test('replicated owner handles preserve intrusive neighbors, equal wire identities and packet caches',async()=>{
  const o=await oracle(),{runtime,actors,word,u32,allocate,packetCache,capture,restore,compare}=o;
  const [child,ownerA,ownerB,otherChild]=actors, source=allocate(4);
  runtime.call(73,child,ownerA);runtime.call(73,otherChild,ownerA);packetCache(child);
  const initial=capture();
  for(const incoming of [0,ownerA,ownerB])for(const sameId of [false,true]) {
    restore(initial);word(source,incoming);
    if(sameId)word(ownerB+16,u32(ownerA+16));
    compare(170,[child+236,source],`incoming=${incoming},same identity=${sameId}`);
  }
  restore(initial);word(child+216,0);word(source,ownerB);compare(170,[child+236,source],'unattached owner component');
});

test('reference serialization matches inline boundary and heap growth with every identity bit',async()=>{
  const o=await oracle(),{actors,word,allocate,bytes,capture,restore,compare}=o;
  const handle=allocate(12), packet=allocate(4120), actor=actors[0];
  const initial=capture();
  for(const identity of [0,1,0x3fff,0x4000,0x3ffff,0xffffffff])for(const entity of [0,actor]) {
    for(const [count,capacity]of [[0,0],[4092,0],[4093,0],[4096,0],[4,8],[8,8]]) {
      restore(initial);word(actor+16,identity);word(handle,entity);word(packet,7);word(packet+4,count);
      if(capacity){const data=allocate(capacity);bytes.fill(0xa7,data,data+capacity);word(packet+8,capacity);word(packet+12,data);}
      else bytes.fill(0x5b,packet+16,packet+16+4096);
      compare(105,[handle,packet],`id=${identity},entity=${entity},count=${count},capacity=${capacity}`);
    }
  }
});

test('ownership component registration matches vector capacity changes and three revision arrays',async()=>{
  const o=await oracle(),{actors,word,allocate,u32,capture,restore,compare,packetCache}=o;
  const entity=actors[0], world=u32(entity), component=entity+216;
  packetCache(entity);word(component,entity);const initial=capture();
  for(const [count,capacity]of [[0,0],[0,4],[1,4],[4,4],[8,8],[1024,1024]]) {
    restore(initial);const items=capacity?allocate(capacity*4):0;
    for(let i=0;i<count;i++)word(items+i*4,0xabc000+i);
    word(world+612,count);word(world+616,capacity);word(world+620,items);
    compare(428,[entity,component],`ownership vector ${count}/${capacity}`);
  }
});

test('ownership services retain memory faults, partial mutations and lowered stack',async()=>{
  const o=await oracle(),{actors,word,allocate,bytes,capture,restore,compare}=o;
  const source=allocate(4), packet=allocate(4120);word(source,actors[1]);const initial=capture();
  for(const [id,args]of [[73,[bytes.length-40,0]],[73,[actors[0],bytes.length-4]],[105,[-1,packet]],[105,[source,bytes.length-4]],[170,[bytes.length-4,source]],[428,[bytes.length-93,0]]]) {
    restore(initial);compare(id,args,`func${id}:invalid ${args}`);
  }
});
