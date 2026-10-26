import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSimulationHooks,functionIds,mainSimulationStatus} from '../source/game/server/simulation.mjs';
const dependencies=[14,15,16,17,19,20,21,29,31,32,34,35,44,47,57,73,94,105,113,144,164,170,267,410,422,424,654,655,656,657];
async function oracle(){
 const calls=[];let runtime;
 function bridge(code,signature,pointer){calls.push([code,signature,pointer]);if(code===22903){const v=new DataView(runtime.memory.buffer);return v.getFloat64(pointer,true)%v.getFloat64(pointer+8,true);}return code===22855?123456:0;}
 runtime=await loadOriginal('sp_server',{functionIds:[...functionIds,...dependencies],imports:{a:{a:bridge,b:bridge}}});
 runtime.exports.u(0,0);
 const bytes=Buffer.from(runtime.memory.buffer),view=new DataView(runtime.memory.buffer),hooks=createSimulationHooks(runtime);
 const u32=p=>view.getUint32(p,true),uint=(p,v)=>view.setUint32(p,v,true),float=(p,v)=>view.setFloat32(p,v,true),double=(p,v)=>view.setFloat64(p,v,true);
 const allocate=size=>{const p=runtime.call(16,size);bytes.fill(0,p,p+size);return p;};
 const capture=()=>({memory:Buffer.from(bytes),stack:runtime.stackPointer.value});const restore=s=>{bytes.set(s.memory);runtime.stackPointer.value=s.stack;};
 function compare(id,args,label){
  const before=capture();calls.length=0;let expected,result,expectedError,actualError;
  try{expected=runtime.call(id,...args);}catch(e){expectedError=e.constructor.name;}
  const expectedMemory=Buffer.from(bytes),expectedStack=runtime.stackPointer.value,expectedCalls=structuredClone(calls);
  restore(before);calls.length=0;
  try{result=hooks[id](...args);}catch(e){actualError=e.constructor.name;if(!expectedError)throw e;}
  assert.equal(actualError,expectedError,`${label}: trap`);assert.equal(result,expected,`${label}: return`);assert.equal(runtime.stackPointer.value,expectedStack,`${label}: stack`);assert.deepEqual(calls,expectedCalls,`${label}: host calls`);
  if(!bytes.equals(expectedMemory)){const differences=[];for(let p=0;p<bytes.length&&differences.length<20;p++)if(bytes[p]!==expectedMemory[p])differences.push({address:p,original:expectedMemory[p],recovered:bytes[p]});assert.fail(`${label}: memory ${JSON.stringify(differences)}`);}
  return result;
 }
 return{runtime,bytes,view,u32,uint,float,double,allocate,capture,restore,compare};
}

test('main simulation654 stays explicitly residual and never masquerades as a recovered tick',()=>{assert.equal(mainSimulationStatus.complete,false);assert.equal(mainSimulationStatus.registered,false);assert.ok(!functionIds.includes(654));});

test('population replenishment preserves exact area scales, species order and original allocation',async()=>{
 const{uint,float,capture,restore,compare}=await oracle(),initial=capture();
 for(const dimensions of [[0,0],[1000,1000],[2000,1500],[6000,6000],[NaN,1000],[Infinity,0],[-1000,1000]])for(const populated of [false,true]){
  restore(initial);float(23804,dimensions[0]);float(23892,dimensions[1]);for(let i=0;i<8;i++)uint(24864+i*4,populated?0xffffffff:0);
  compare(400,[],`population dimensions=${dimensions},populated=${populated}`);
 }
});

test('linked-body constraints match cached geometry, recursive children and nonfinite coordinates',async()=>{
 const{runtime,bytes,u32,uint,float,double,allocate,capture,restore,compare}=await oracle();
 const entity=runtime.call(144,22928+1936,1,100,200,-1),previous=runtime.call(144,22928+1936,1,0,0,-1),child=runtime.call(144,22928+1936,1,300,400,-1);
 const links=allocate(100),childLinks=allocate(100),list=allocate(12);uint(entity+212,links);uint(links,entity);uint(links+4,previous);uint(links+16,1);uint(links+24,list);uint(list,child);uint(child+212,childLinks);uint(childLinks,child);uint(childLinks+4,entity);
 const initial=capture();
 for(const cached of [false,true])for(const radius of [0,5,500,NaN])for(const position of [[100,200],[0,0],[Infinity,0],[NaN,30]])for(const parented of [false,true]){
  restore(initial);const p=u32(entity+168),q=u32(previous+168);bytes[p+80]=cached?1:0;bytes[q+80]=1;double(p+88,position[0]);double(p+96,position[1]);double(q+88,0);double(q+96,0);float(u32(entity+188)+8,radius);
  if(parented){bytes[entity+93]|=64;uint(entity+224,previous);}
  compare(401,[entity],`constraint cached=${cached},radius=${radius},position=${position},parented=${parented}`);
 }
});

test('entity removal follows actual hierarchy, ownership, species, pools and quadtree removal',async()=>{
 const{runtime,u32,compare,capture,restore}=await oracle();
 const entity=runtime.call(144,22928+1936,1,100,200,0),child=runtime.call(144,22928+1936,1,300,400,1);
 runtime.call(73,child,entity);const initial=capture();
 compare(404,[entity],'remove original spawned entity and ownership child');
 restore(initial);compare(404,[child],'remove owned child');compare(404,[child],'remove already free child');
 compare(404,[0],'remove null');
 assert.ok(u32(25076)>0,'removal must populate the actual free-entity pool');
});

test('handle-vector growth relocates every intrusive reference and preserves empty handles',async()=>{
 const{allocate,uint,compare,capture,restore}=await oracle();
 const vector=allocate(12),list=allocate(48),external=allocate(48);uint(vector,4);uint(vector+4,4);uint(vector+8,list);
 for(let i=0;i<4;i++){const p=list+i*12;uint(p,i+1);uint(p+4,p);uint(p+8,p);if(i%2){const q=external+i*12;uint(p+4,q);uint(p+8,q);uint(q+4,p);uint(q+8,p);}}
 const initial=capture();for(const required of [5,8,9,1000]){restore(initial);compare(398,[vector,required],`handle growth ${required}`);}
});

test('clock-origin elapsed time and replicated accessors match warm/cold guards and cache clearing',async()=>{
 const{runtime,bytes,u32,uint,double,allocate,capture,restore,compare}=await oracle();
 const entity=runtime.call(144,22928+1936,1,0,0,-1),component=allocate(128),accessor=allocate(8),clock=allocate(16),source=allocate(4);uint(component,entity);uint(accessor,component+40);const initial=capture();
 for(const cold of [false,true])for(const valid of [false,true])for(const time of [0,123456,Infinity,NaN]){
  restore(initial);bytes[8548304]=cold?0:1;bytes[8548300]=cold?0:1;bytes[8573008]=valid?1:0;bytes[clock]=valid?1:0;double(clock+8,time);compare(408,[clock],`clock cold=${cold},valid=${valid},time=${time}`);
 }
 for(const index of [0,1,3]){restore(initial);uint(accessor+4,index);compare(407,[accessor],`string accessor slot=${index}`);}
 for(const id of [399,402])for(const value of [0,1,255,256,0xffffffff]){
  restore(initial);uint(source,value);compare(id,[component+(id===399?8:9),source],`replicated byte ${id},value=${value}`);
 }
 restore(initial);uint(23240,entity);compare(403,[],'global arena count');
});

test('pending-message erasure preserves movement, reference counts and destructor order',async()=>{
 const{runtime,allocate,uint,compare,capture,restore}=await oracle();
 const vector=allocate(12),list=allocate(80);uint(vector,5);uint(vector+4,5);uint(vector+8,list);
 for(let i=0;i<5;i++){const message=allocate(4124);uint(message,5184);uint(message+4,i%2);uint(list+i*16,i+100);uint(list+i*16+4,message+12);uint(list+i*16+8,message);uint(message+16,5);}
 const initial=capture();for(const[from,to]of[[0,0],[0,5],[0,1],[1,3],[3,5],[4,4]]){restore(initial);compare(406,[vector,list+from*16,list+to*16],`erase ${from}..${to}`);}
});

test('all complete phase helpers preserve a captured-input world through forty actual ticks',async()=>{
 const[{default:wabtFactory},{makeReadableWat},{createRuntimeContext}]=await Promise.all([import('wabt'),import('../tools/lib/readable-wasm.mjs'),import('../source/runtime/context.mjs')]);
 const wabt=await wabtFactory(),wat=await fs.readFile(new URL('../source/wasm/sp_server.wat',import.meta.url),'utf8'),inventory=JSON.parse(await fs.readFile(new URL('../reports/wasm/sp_server-functions.json',import.meta.url),'utf8'));
 const parsed=wabt.parseWat('phase-helpers.wat',makeReadableWat(wat,inventory,functionIds.map(id=>({id}))).text);parsed.resolveNames();parsed.validate();const compiled=new WebAssembly.Module(parsed.toBinary({}).buffer);parsed.destroy();
 async function world(recovered){
  let runtime,clock=1000,seed=0x6f6c6446;const outgoing=[],hookCalls={};const memory=()=>new DataView(runtime.memory.buffer);
  function bridge(code,signature,pointer){const v=memory();switch(code){case 22600:case 22639:return 0;case 22791:return 1;case 22855:return clock;case 22903:return v.getFloat64(pointer,true)%v.getFloat64(pointer+8,true);default:throw new Error(`Unexpected bridge ${code}`);}}
  const imports={a:{a:bridge,b:bridge,c:(p,n)=>outgoing.push(['final',p,n]),d:(p,n)=>outgoing.push(['data',Buffer.from(new Uint8Array(runtime.memory.buffer,p,n)).toString('hex')]),e:()=>{throw new WebAssembly.RuntimeError('OOM');},f:()=>{throw new WebAssembly.RuntimeError('abort');},i:(count,size)=>{memory().setUint32(count,0,true);memory().setUint32(size,0,true);return 0;},j:(fd,vectors,count,written)=>{let size=0;for(let i=0;i<count;i++)size+=memory().getUint32(vectors+i*8+4,true);memory().setUint32(written,size,true);return 0;},n:(p,n)=>{const bytes=new Uint8Array(runtime.memory.buffer);for(let i=0;i<n;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;bytes[p+i]=seed&255;}return 0;}}};
  if(recovered){
   for(const entry of WebAssembly.Module.imports(compiled))(imports[entry.module]??={})[entry.name]??=()=>0;
   runtime=createRuntimeContext(imports);let hooks;
   imports.readable=Object.fromEntries(functionIds.map(id=>[`f${id}`,(...args)=>{hookCalls[id]=(hookCalls[id]??0)+1;return hooks[id](...args);}]));
   const instance=new WebAssembly.Instance(compiled,imports);runtime.attach(instance);hooks=createSimulationHooks(runtime);
  }else runtime=await loadOriginal('sp_server',{functionIds:[14,16,43,144,654,655,656,657],imports,construct:false});
  runtime.exports.p();runtime.call(656,0,0);
  return{runtime,outgoing,hookCalls,send(packet){const p=runtime.call(16,packet.length);new Uint8Array(runtime.memory.buffer).set(packet,p);runtime.call(655,p,packet.length);runtime.call(14,p);},advance(){clock+=50;runtime.call(654);runtime.call(657,0,0);}};
 }
 const original=await world(false),recovered=await world(true);
 const packets=JSON.parse(await fs.readFile(new URL('../reports/runtime/client-packet-traces.json',import.meta.url),'utf8')).packets.filter(p=>p.direction==='toWorker');
 function compare(label){const a=Buffer.from(original.runtime.memory.buffer),b=Buffer.from(recovered.runtime.memory.buffer);if(!a.equals(b)){const differences=[];for(let p=0;p<a.length&&differences.length<20;p++)if(a[p]!==b[p])differences.push({address:p,original:a[p],recovered:b[p]});assert.fail(`${label}: full memory ${JSON.stringify(differences)}`);}assert.equal(recovered.runtime.stackPointer.value,original.runtime.stackPointer.value,`${label}: stack`);assert.deepEqual(recovered.outgoing,original.outgoing,`${label}: packets`);}
 compare('initial world');
 for(let step=0;step<40;step++){if(step<packets.length){const packet=Uint8Array.from(packets[step].bytes);original.send(packet);recovered.send(packet);}original.advance();recovered.advance();compare(`tick ${step}`);}
 assert.ok(Object.keys(recovered.hookCalls).length>=4,'actual ticks must execute multiple recovered phase helpers');assert.ok(recovered.hookCalls[400]>0,'population phase must run');
});
