import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSpatialAiHooks,functionIds} from '../source/game/server/spatial-ai.mjs';

async function oracle(){
  let time=1000,clockValid=1;const events=[];
  const host=(address,...args)=>{events.push([address,...args]);return address===22855?time:address===22791?clockValid:0;};
  const runtime=await loadOriginal('sp_server',{functionIds:[...functionIds,14,16,17,21,57,168],imports:{a:{a:host,b:host}}});
  const bytes=Buffer.from(runtime.memory.buffer),view=new DataView(runtime.memory.buffer),hooks=createSpatialAiHooks(runtime);
  const word=(a,v)=>view.setUint32(a,v,true),float=(a,v)=>view.setFloat32(a,v,true),double=(a,v)=>view.setFloat64(a,v,true),u32=a=>view.getUint32(a,true);
  const allocate=size=>{const p=runtime.call(16,size);bytes.fill(0,p,p+size);return p;};
  const world=allocate(530000);float(world+876,10000);
  function actor(x,y){
    const entity=allocate(512),position=allocate(120),health=allocate(56),ai=allocate(192),physics=allocate(56),loadout=allocate(800);
    word(entity,world);word(entity+4,entity);word(entity+8,entity+4);word(entity+12,entity+4);word(entity+104,ai);
    word(entity+164,health);word(entity+168,position);word(entity+188,physics);word(entity+200,loadout);
    word(ai,entity);word(ai+156,ai+152);word(ai+160,ai+152);float(ai+120,1000);float(ai+124,1);float(ai+140,10000);bytes[ai+108]=1;
    word(position,entity);bytes[position+80]=1;float(position+20,x);float(position+16,y);double(position+88,x);double(position+96,y);
    float(health+8,10);word(physics,entity);float(physics+20,x-10);float(physics+24,y-10);float(physics+28,20);float(physics+32,20);
    bytes[entity+92]=2;return{entity,position,health,ai,physics,loadout};
  }
  const source=actor(0,0),target=actor(20,10),other=actor(40,10),root=allocate(40),children=allocate(160),list=allocate(16),rect=allocate(16);
  float(root+8,-100);float(root+12,-100);float(root+16,200);float(root+20,200);word(root+24,1);word(root+32,list);word(list,target.physics);
  float(rect,-100);float(rect+4,-100);float(rect+8,200);float(rect+12,200);
  const context196=allocate(4),sourceReference=allocate(4);word(sourceReference,source.entity);word(context196,sourceReference);
  const context197=allocate(24),gate=allocate(4),sourcePosition=allocate(4),currentRef=allocate(4),currentHolder=allocate(4),selected=allocate(4),distance=allocate(8);
  float(gate,-5000);word(sourcePosition,source.position);word(currentRef,currentHolder);word(currentHolder,0);
  for(const [i,value]of[gate,sourcePosition,source.ai,currentRef,selected,distance].entries())word(context197+i*4,value);
  const context198=allocate(12);word(context198,sourcePosition);word(context198+4,selected);word(context198+8,distance);
  const capture=()=>({memory:Buffer.from(bytes),stack:runtime.stackPointer.value});const restore=s=>{bytes.set(s.memory);runtime.stackPointer.value=s.stack;};
  function compare(id,context,label){
    const before=capture();events.length=0;let expectedReturn,expectedError,actualReturn,actualError;
    try{expectedReturn=runtime.call(id,root,rect,context);}catch(e){expectedError=[e.constructor.name,e.message];}
    const expected=capture(),expectedEvents=structuredClone(events);restore(before);events.length=0;
    try{actualReturn=hooks[id](root,rect,context);}catch(e){actualError=[e.constructor.name,e.message];}
    assert.equal(actualReturn,expectedReturn,`${label}: return`);assert.deepEqual(actualError,expectedError,`${label}: error`);assert.deepEqual(events,expectedEvents,`${label}: host`);
    assert.equal(runtime.stackPointer.value,expected.stack,`${label}: stack`);
    if(!bytes.equals(expected.memory)){const dif=[];for(let i=0;i<bytes.length&&dif.length<20;i++)if(bytes[i]!==expected.memory[i])dif.push({at:i,original:expected.memory[i],recovered:bytes[i]});assert.fail(`${label}: memory ${JSON.stringify(dif)}`);}
  }
  return{runtime,bytes,view,word,float,double,u32,allocate,world,source,target,other,root,children,list,rect,context196,context197,context198,gate,currentHolder,selected,distance,compare,capture,restore,setClock:(valid,now)=>{clockValid=valid;time=now;}};
}

test('nearby aggro preserves target gates and intrusive entity handles',async()=>{
  const o=await oracle(),{target,other,source,word,bytes,root,children,list,context196,capture,restore,compare,u32}=o,initial=capture();
  let assignments=0;
  for(const quadrant of[-1,0,1,2,3])for(const aggression of[0,1,2])for(const existing of[false,true]){
    restore(initial);bytes[target.ai+108]=aggression===1?1:0;bytes[target.ai+109]=aggression===2?1:0;
    if(existing)word(target.ai+152,other.entity);
    if(quadrant>=0){word(root+24,0);word(root+36,children);word(children+quadrant*40+24,1);word(children+quadrant*40+32,list);}
    compare(196,context196,`aggro quadrant=${quadrant},mode=${aggression},existing=${existing}`);assignments+=u32(target.ai+152)===source.entity?1:0;
  }
  assert.ok(assignments>0,'fixtures must actually assign targets');
});

test('target selection preserves health, parent, arena gate, shield time and category priority',async()=>{
  const o=await oracle(),{target,source,other,bytes,word,float,double,gate,currentHolder,selected,distance,context197,compare,capture,restore,setClock}=o,initial=capture();
  for(const health of[0,1,NaN])for(const player of[false,true])for(const owned of[false,true])for(const gateX of[-100,100]){
    restore(initial);float(target.health+8,health);bytes[target.entity+95]=player?32:0;bytes[target.entity+93]=owned?64:0;word(target.entity+224,owned?source.entity:0);float(gate,gateX);
    compare(197,context197,`target hp=${health},player=${player},owned=${owned},gate=${gateX}`);
  }
  for(const valid of[0,1])for(const expiry of[999,1000,1001,NaN]){
    restore(initial);bytes[target.loadout+728]=1;double(target.loadout+736,expiry);setClock(valid,1000);compare(197,context197,`shield valid=${valid},expiry=${expiry}`);
  }
  for(const candidateFlags of[0,2,32,34])for(const currentFlags of[0,2,32,34])for(const currentAggressive of[0,1]){
    restore(initial);bytes[target.entity+92]=candidateFlags&2;bytes[target.entity+95]=candidateFlags&32;bytes[other.entity+92]=currentFlags&2;bytes[other.entity+95]=currentFlags&32;bytes[other.ai+108]=currentAggressive;
    word(currentHolder,other.entity);word(selected,other.entity);double(distance,1);
    compare(197,context197,`priority ${candidateFlags}/${currentFlags}/${currentAggressive}`);
  }
});

test('quadtree target queries retain quadrant ordering, f32 boundaries and recursive stack scratch',async()=>{
  const o=await oracle(),{root,children,list,target,other,word,float,bytes,rect,selected,context196,context197,context198,compare,capture,restore}=o;
  bytes[target.entity+94]=24;bytes[target.entity+95]=32;bytes[other.entity+94]=24;bytes[other.entity+95]=32;
  word(root+24,0);word(root+36,children);
  for(let i=0;i<4;i++){word(children+i*40+24,1);word(children+i*40+32,list+i*4);word(list+i*4,i%2?other.physics:target.physics);}
  const initial=capture();
  for(const x of[-100,-1e-45,0,1e-45,100,NaN])for(const width of[0,1,200,Infinity,NaN])for(const [id,context]of[[196,context196],[197,context197],[198,context198]]){
    restore(initial);float(rect,x);float(rect+4,x);float(rect+8,width);float(rect+12,width);word(selected,0);compare(id,context,`func${id}:rect ${x}/${width}`);
  }
});

test('pickup recipient retains level capacity, health NaN and strict distance threshold',async()=>{
  const o=await oracle(),{target,bytes,float,double,context198,compare,capture,restore}=o;
  bytes[target.entity+94]=24;bytes[target.entity+95]=32;const initial=capture();
  for(const level of[0,14,15,29,30,44,45,255])for(const open of[-1,0,12,13,14,15])for(const health of[0,1,NaN]){
    restore(initial);bytes[target.loadout+148]=level;bytes.fill(1,target.loadout+20,target.loadout+36);if(open>=0)bytes[target.loadout+20+open]=0;float(target.health+8,health);
    compare(198,context198,`pickup level=${level},open=${open},hp=${health}`);
  }
  for(const x of[69.999999,70,70.000001,NaN]){restore(initial);double(target.position+88,x);double(target.position+96,0);compare(198,context198,`pickup distance=${x}`);}
});

test('spatial query faults preserve lowered stack and writes preceding invalid reads',async()=>{
  const o=await oracle(),{target,root,list,word,bytes,context196,context197,context198,compare,capture,restore}=o,initial=capture();
  for(const [id,context]of[[196,context196],[197,context197],[198,context198]]){
    restore(initial);word(list,bytes.length-20);compare(id,context,`func${id} body bounds`);
    restore(initial);word(target.entity+168,bytes.length-80);compare(id,context,`func${id} position bounds`);
  }
});
