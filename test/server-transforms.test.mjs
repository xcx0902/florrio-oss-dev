import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { createTransformHooks, functionIds } from '../source/game/server/transforms.mjs';

async function oracle() {
  const events = [];
  let runtime;
  runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, 14, 15, 16, 149, 169],
    imports: {a: {a: (address, signature, pointer) => {
      events.push([address, signature, pointer]);
      if (address !== 22903) return 0;
      const v = new DataView(runtime.memory.buffer);
      return v.getFloat64(pointer,true) % v.getFloat64(pointer+8,true);
    }}},
  });
  const bytes = Buffer.from(runtime.memory.buffer), view = new DataView(runtime.memory.buffer);
  const hooks = createTransformHooks(runtime);
  const word = (a,v) => view.setUint32(a,v,true), float = (a,v) => view.setFloat32(a,v,true);
  const double = (a,v) => view.setFloat64(a,v,true);
  const allocate = size => { const p=runtime.call(16,size); bytes.fill(0,p,p+size); return p; };
  const world=allocate(530000);
  word(world+2140,1234567);
  function entity() {
    const e=allocate(512), t=allocate(120);
    word(e,world); word(e+16,(e>>>4)&16383); word(e+168,t); word(t,e);
    return {entity:e, transform:t};
  }
  const capture=()=>({memory:Buffer.from(bytes),stack:runtime.stackPointer.value});
  const restore=s=>{ bytes.set(s.memory); runtime.stackPointer.value=s.stack; };
  function compare(id,args,label) {
    const before=capture(); let expectedResult,expectedError,actualResult,actualError;
    events.length=0;
    try { expectedResult=runtime.call(id,...args); } catch(e) {expectedError=[e.constructor.name,e.message];}
    const expected=capture(), expectedEvents=structuredClone(events); restore(before);events.length=0;
    try { actualResult=hooks[id](...args); } catch(e) {actualError=[e.constructor.name,e.message];}
    assert.deepEqual(actualError,expectedError,`${label}: exception`);
    assert.equal(actualResult,expectedResult,`${label}: result`);
    assert.deepEqual(events,expectedEvents,`${label}: host calls`);
    assert.equal(runtime.stackPointer.value,expected.stack,`${label}: stack`);
    if (!bytes.equals(expected.memory)) {
      const differences=[];
      for(let i=0;i<bytes.length&&differences.length<20;i++)if(bytes[i]!==expected.memory[i])differences.push({address:i,original:expected.memory[i],recovered:bytes[i]});
      assert.fail(`${label}: memory ${JSON.stringify(differences)}`);
    }
  }
  return {runtime,bytes,view,word,float,double,allocate,world,entity,capture,restore,compare};
}

test('world transforms retain recursive parent composition, epsilon and absolute-angle flags',async()=>{
  const o=await oracle(), {word,float,double,bytes,entity,compare,capture,restore}=o;
  const root=entity(), parent=entity(), child=entity();
  bytes[parent.entity+93]=64; word(parent.entity+224,root.entity);
  bytes[child.entity+93]=64; word(child.entity+224,parent.entity);
  const initial=capture();
  for(const angle of [0,-0,2**-53,-(2**-52),2**-52,Math.PI/2,Math.PI,1e20,Infinity,NaN]) {
    for(const cached of [false,true]) for(const absolute of [0,1]) {
      restore(initial);
      for(const [index,node] of [root,parent,child].entries()) {
        float(node.transform+16,(index+1)*-3.14159);float(node.transform+20,(index+1)*9.87654);
        double(node.transform+8,index?angle/3:angle);
      }
      bytes[parent.transform+80]=cached?1:0;
      double(parent.transform+88,23.123456789);double(parent.transform+96,-49.123456789);double(parent.transform+104,angle);
      word(child.transform+112,absolute);
      compare(17,[child.transform],`angle=${angle},cached=${cached},absolute=${absolute}`);
    }
  }
  for(const hasOwnership of [false,true]) for(const missingParent of [false,true]) {
    restore(initial);bytes[child.entity+93]=hasOwnership?64:0;word(child.entity+224,missingParent?0:parent.entity);
    double(child.transform+8,1.234567890123);float(child.transform+16,-0);float(child.transform+20,1e30);
    compare(17,[child.transform],`ownership=${hasOwnership},missing=${missingParent}`);
  }
});

test('descendant invalidation follows original child records and cached-state gates',async()=>{
  const o=await oracle(), {word,bytes,entity,allocate,compare,capture,restore}=o;
  const nodes=Array.from({length:4},()=>entity()), links=nodes.map(n=>{const p=allocate(136);word(p+112,n.transform);return p;});
  word(nodes[0].entity+84,links[1]);word(links[1]+8,links[2]);word(nodes[1].entity+84,links[3]);
  const initial=capture();
  for(let mask=0;mask<16;mask++) {
    restore(initial);nodes.forEach((n,i)=>{bytes[n.transform+80]=(mask>>>i)&1;});
    compare(34,[links[0]],`cached mask=${mask}`);
  }
  restore(initial);word(links[0]+112,0);compare(34,[links[0]],'absent transform');
});

test('local coordinate tracking matches float bits, packet caches and component revisions',async()=>{
  const o=await oracle(), {word,float,double,view,entity,allocate,world,compare,capture,restore}=o;
  const node=entity(), source=allocate(8), index=view.getUint32(node.entity+16,true)&16383;
  for(const offset of [264876,264880]) {
    const packet=allocate(32), payload=allocate(48);word(packet+12,payload);word(world+index*8+offset,packet);
  }
  for(const base of [8551040,8555152]) {word(base+12,allocate(20));word(base+8,20);word(base,7);word(base+4,12);}
  const initial=capture();
  const values=[0,-0,0.1,1.234567890123,1e-50,-1e-50,1e30,Infinity,-Infinity,NaN];
  for(const id of [44,47]) for(const old of values) for(const next of values) {
    restore(initial);const destination=node.transform+(id===44?20:16);float(destination,old);double(source,next);
    compare(id,[destination,source],`func${id},${old}->${next}`);
  }
  for(const id of [44,47]) {
    restore(initial);word(node.transform,0);double(source,47.25);
    compare(id,[node.transform+(id===44?20:16),source],`func${id},unattached component`);
  }
});

test('transform services preserve memory traps and writes before the fault',async()=>{
  const o=await oracle(), {bytes,entity,allocate,word,double,compare,capture,restore}=o;
  const node=entity(), source=allocate(8);double(source,1.25);
  const initial=capture();
  for(const [id,args] of [[17,[bytes.length-80]],[17,[-1]],[34,[bytes.length-112]],[44,[node.transform+20,bytes.length-4]],[47,[-1,source]]]) {
    restore(initial);compare(id,args,`func${id} invalid pointers ${args}`);
  }
  restore(initial);word(node.transform,bytes.length-92);compare(17,[node.transform],'entity flag access fault after valid cache write');
});

test('local angle uses exact quantization, host remainder calls and dirty thresholds',async()=>{
  const o=await oracle(), {word,double,entity,allocate,world,view,compare,capture,restore}=o;
  const node=entity(), source=allocate(8), index=view.getUint32(node.entity+16,true)&16383;
  for(const offset of [264876,264880]) {const packet=allocate(32);word(packet+12,allocate(24));word(world+index*8+offset,packet);}
  const initial=capture(), values=[0,-0,1e-15,-1e-15,2*Math.PI,-2*Math.PI,Math.PI/2,Math.PI/2+1e-8,1e20,Infinity,-Infinity,NaN];
  for(const old of values) for(const next of values) {
    restore(initial);double(node.transform+8,old);double(source,next);
    compare(94,[node.transform+8,source],`angle ${old}->${next}`);
  }
  restore(initial);word(node.transform,0);double(source,1);compare(94,[node.transform+8,source],'unattached angle');
  restore(initial);compare(94,[node.transform+8,o.bytes.length-4],'angle source trap retains lowered stack');
});
