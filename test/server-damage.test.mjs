import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { createDamageHooks, functionIds } from '../source/game/server/damage.mjs';
const dependencies = [14,15,16,17,18,20,21,26,31,32,34,35,44,47,57,64,65,74,77,78,84,96,97,130,144,147,148,214,215,217,218,219,268,269,280,424,425,426,654,655,703,712,715];
async function oracle() {
 const calls=[];
 const runtime=await loadOriginal('sp_server',{functionIds:[...functionIds,...dependencies],imports:{a:{a:(...args)=>{calls.push(['a',...args]);return 123456;},b:(...args)=>{calls.push(['b',...args]);return 0;}}}});
 const bytes=Buffer.from(runtime.memory.buffer), view=new DataView(runtime.memory.buffer), hooks=createDamageHooks(runtime);
 const u32=p=>view.getUint32(p,true), uint=(p,v)=>view.setUint32(p,v,true), float=(p,v)=>view.setFloat32(p,v,true), double=(p,v)=>view.setFloat64(p,v,true);
 const allocate=size=>{const p=runtime.call(16,size);bytes.fill(0,p,p+size);return p;};
 const capture=()=>({memory:Buffer.from(bytes),stack:runtime.stackPointer.value});
 const restore=s=>{bytes.set(s.memory);runtime.stackPointer.value=s.stack;};
 function compare(args,label) {
  const before=capture();calls.length=0;
  let expectedError,actualError,expectedReturn,result;
  try{expectedReturn=runtime.call(43,...args);}catch(e){expectedError=e.constructor.name;}
  const expected=Buffer.from(bytes),expectedStack=runtime.stackPointer.value,expectedCalls=structuredClone(calls);
  restore(before);calls.length=0;
  try{result=hooks[43](...args);}catch(e){actualError=e.constructor.name;if(!expectedError)throw e;}
  assert.equal(actualError,expectedError,`${label}: exception`);assert.equal(result,expectedReturn,`${label}: return`);assert.equal(runtime.stackPointer.value,expectedStack,`${label}: stack`);assert.deepEqual(calls,expectedCalls,`${label}: host callbacks`);
  if(Buffer.compare(bytes,expected)){
   const differences=[];for(let address=0;address<bytes.length&&differences.length<20;address++)if(bytes[address]!==expected[address])differences.push({address,original:expected[address],recovered:bytes[address]});
   assert.fail(`${label}: memory differences ${JSON.stringify(differences)}`);
  }
 }
 return{runtime,bytes,view,u32,uint,float,double,allocate,capture,restore,compare};
}
test('damage health loss and zero clamp match populated actors, flags, floating edges',async()=>{
 const o=await oracle(),{runtime,bytes,u32,uint,float,allocate,capture,restore,compare}=o;
 runtime.exports.u(0,0);
 const entity=runtime.call(144,22928+1936,1,0,0,-1),attacker=runtime.call(144,22928+1936,1,0,0,-1),options=allocate(2),health=u32(entity+164),initial=capture();
 for(const enabled of [false,true])for(const amount of [0,-0,1.125,-2,20,1e10,Infinity,-Infinity,NaN])for(const source of [0,attacker])for(const flags of [0,1,256,257]){
  restore(initial);bytes[22928+872]=enabled?1:0;uint(options,flags);compare([health,source,amount,options],`enabled=${enabled},damage=${amount},attacker=${source},flags=${flags}`);
 }
 for(const hp of [0,-0,-1,NaN,Infinity]){restore(initial);float(health+8,hp);compare([health,attacker,2,options],`initial health=${hp}`);}
});
test('death with no spatial/loot components, removal and ownership callbacks',async()=>{
 const{runtime,bytes,u32,uint,float,allocate,capture,restore,compare}=await oracle();runtime.exports.u(0,0);bytes[22928+872]|=1;
 const entity=runtime.call(144,22928+1936,1,0,0,-1),attacker=runtime.call(144,22928+1936,1,0,0,-1),options=allocate(2),health=u32(entity+164),initial=capture();
 for(const shape of [false,true])for(const spatial of [false,true]){restore(initial);if(!shape)uint(entity+184,0);if(!spatial)uint(entity+168,0);float(health+8,1);compare([health,attacker,5,options],`shape=${shape},position=${spatial}`);}
});

test('player death retains shuffled petals and records dropped inventory through real pickup pools',async()=>{
 const{runtime,bytes,u32,uint,float,allocate,capture,restore,compare}=await oracle();runtime.exports.u(0,0);
 const entity=runtime.call(144,22928+1936,1,100,50,-1),health=u32(entity+164),options=allocate(4),loadout=allocate(744),player=allocate(292);
 uint(entity+200,loadout);uint(loadout,entity);uint(entity+120,player);uint(player,entity);uint(player+100,entity);uint(player+160,player+156);uint(player+164,player+156);
 bytes[entity+92]|=32;bytes[entity+95]|=32;float(loadout+16,1234.5);
 const initial=capture();
 for(const cold of [false,true])for(const level of [0,14,15,29,30,44,45,255])for(const seed of [1,47,123456789,2147483646]){
  restore(initial);float(health+8,1);bytes[loadout+148]=level;
  const petals=[1,2,6,7,8,9,10,12,15,18,19,22,25,29,34,36];
  for(let i=0;i<16;i++)bytes[loadout+20+i]=petals[i];
  uint(8573024,seed);uint(8573028,seed);bytes[8569380]=cold?0:1;
  compare([health,0,100,options],`player death cold=${cold},level=${level},seed=${seed}`);
 }
});


test('captured browser spawn creates a real player whose complete death and petal cleanup match',async()=>{
 const{runtime,bytes,u32,uint,float,allocate,capture,restore,compare}=await oracle();runtime.exports.u(0,0);
 const captureData=JSON.parse(await fs.readFile(new URL('../reports/runtime/client-packet-traces.json',import.meta.url),'utf8'));
 for(const packet of captureData.packets.filter(p=>p.direction==='toWorker').slice(0,4)){
  const p=allocate(packet.bytes.length);bytes.set(packet.bytes,p);runtime.call(655,p,packet.bytes.length);runtime.call(14,p);runtime.call(654);
 }
 const player=u32(u32(22928+264)),entity=u32(player+100),health=u32(entity+164),loadout=u32(entity+200),options=allocate(4);
 assert.ok(entity&&health&&loadout,'captured spawn must produce an active real player');
 const attacker=runtime.call(144,22928+1936,1,60,80,-1);bytes[22928+872]|=1;const initial=capture();
 for(const source of [0,attacker])for(const level of [0,15,30,45])for(const seed of [1,47,2147483646]){
  restore(initial);float(health+8,1);bytes[loadout+148]=level;uint(8573024,seed);uint(8573028,seed);
  compare([health,source,100,options],`real player attacker=${source},level=${level},seed=${seed}`);
 }
});

test('loot spawning reproduces pickup free heaps, chunk growth, geometry and legendary uniqueness',async()=>{
 const{runtime,bytes,u32,uint,float,double,allocate,capture,restore,compare}=await oracle();runtime.exports.u(0,0);
 const world=22928,entity=runtime.call(144,world+1936,1,100,50,-1),health=u32(entity+164),loot=u32(entity+204),position=u32(entity+168),options=allocate(4),heap=allocate(48);
 const free=Array.from({length:10},()=>allocate(72)).reverse();for(let i=0;i<free.length;i++)uint(heap+i*4,free[i]);
 const initial=capture();
 for(const freeCount of [0,1,2,3,4,7,8,10])for(const coordinates of [[100,50],[Infinity,50],[100,NaN]]){
  restore(initial);float(health+8,1);float(loot+4,0);bytes[loot+8]=3;bytes.set([2,6,12],loot+9);
  bytes[position+80]=1;double(position+88,coordinates[0]);double(position+96,coordinates[1]);uint(world+20,freeCount);uint(world+28,heap);
  if(!freeCount){uint(world+4,128);uint(world+8,0);uint(world+12,0);uint(world+16,0);uint(world+36,0);uint(world+40,0);uint(world+44,0);}
  compare([health,0,100,options],`pickup free=${freeCount},position=${coordinates}`);
 }
 const legendary=Array.from({length:38},(_,i)=>i+1).find(id=>u32(8545792+id*52+24)===5);
 assert.ok(legendary,'catalog must contain a legendary petal');
 for(const duplicate of [false,true]){
  restore(initial);float(health+8,1);float(loot+4,0);bytes[loot+8]=2;bytes[loot+9]=legendary;bytes[loot+10]=legendary;
  if(duplicate){const pickup=allocate(72),list=allocate(4);bytes[pickup+8]=legendary;uint(list,pickup);uint(world+36,1);uint(world+44,list);uint(world+40,1);}
  compare([health,0,100,options],`legendary duplicate=${duplicate}`);
 }
});

test('Cactus reflection follows active-slot, arena, owner and recursion-option gates',async()=>{
 const{runtime,bytes,u32,uint,float,double,allocate,capture,restore,compare}=await oracle();runtime.exports.u(0,0);
 const world=22928,entity=runtime.call(144,world+1936,1,0,0,-1),attacker=runtime.call(144,world+1936,1,0,0,-1),health=u32(entity+164),targetHealth=u32(attacker+164),position=u32(entity+168),options=allocate(4),loadout=allocate(744);
 uint(entity+200,loadout);uint(loadout,entity);bytes[loadout+20]=36;bytes[attacker+95]|=32;bytes[position+80]=1;
 const initialTargetHealth=new DataView(runtime.memory.buffer).getFloat32(targetHealth+8,true);
 bytes[world+872]|=1;const initial=capture();let reflected=0;
 for(const mode of [0,1])for(const inside of [false,true])for(const cooldown of [0,4999,5000,44999,45000])for(const inactive of [false,true])for(const flags of [0,1,256,257]){
  restore(initial);bytes[world+873]=mode;double(position+88,inside?-100000:100000);float(loadout+288,cooldown);bytes[loadout+584]=inactive?1:0;uint(options,flags);
  compare([health,attacker,1.25,options],`reflection mode=${mode},inside=${inside},elapsed=${cooldown},inactive=${inactive},flags=${flags}`);
  if(new DataView(runtime.memory.buffer).getFloat32(targetHealth+8,true)<initialTargetHealth)reflected++;
 }
 assert.ok(reflected>0,'reflection fixtures must really damage the source');
});

test('death walks all owned child handles and invokes real petal death virtuals',async()=>{
 const{runtime,bytes,u32,uint,float,allocate,capture,restore,compare}=await oracle();runtime.exports.u(0,0);
 const world=22928,entity=runtime.call(144,world+1936,1,0,0,-1),health=u32(entity+164),loadout=allocate(744),options=allocate(4);
 uint(entity+200,loadout);uint(loadout,entity);
 const children=[];
 for(let i=0;i<24;i++){
  const child=runtime.call(144,world+1936,1,0,0,-1);children.push(child);uint(loadout+296+i*12,child);
  if(i%3===0)uint(child+164,0);
  else if(i%3===1){const petal=allocate(24);uint(child+124,petal);uint(petal,child);runtime.call(217,petal,-1,-1,1);}
 }
 const initial=capture();
 for(const removed of [false,true]){
  restore(initial);float(health+8,1);if(removed)for(let i=0;i<children.length;i+=3)uint(children[i]+32,world+2172);
  compare([health,0,100,options],`owned children already queued=${removed}`);
 }
});

test('death attribution copies short and heap names, records strings and relinks prior attacker handles',async()=>{
 const{runtime,bytes,u32,uint,float,allocate,capture,restore,compare}=await oracle();runtime.exports.u(0,0);bytes[22928+872]|=1;
 const entity=runtime.call(144,22928+1936,1,0,0,-1),health=u32(entity+164),loadout=allocate(744),player=allocate(292),attacker=allocate(512),name=allocate(24),options=allocate(4),text=allocate(5001);
 bytes.fill(97,text,text+5000);bytes[text+5000]=0;
 uint(entity+200,loadout);uint(loadout,entity);uint(entity+120,player);uint(player,entity);uint(player+100,entity);uint(player+160,player+156);uint(player+164,player+156);
 bytes[entity+92]|=32;bytes[entity+95]|=32;uint(attacker,22928);uint(attacker+4,attacker);uint(attacker+8,attacker+4);uint(attacker+12,attacker+4);uint(attacker+160,name);uint(name,attacker);
 const initial=capture();
 for(const length of [0,1,10,11,64,5000])for(const same of [false,true])for(const prior of [false,true]){
  restore(initial);float(health+8,1);runtime.call(269,name+8,text,length);if(same)runtime.call(269,player+16,text,length);
  if(prior){uint(player+156,attacker);uint(player+160,attacker+4);uint(player+164,attacker+4);uint(attacker+8,player+156);uint(attacker+12,player+156);}
  compare([health,attacker,100,options],`name length=${length},same=${same},prior=${prior}`);
 }
});

test('health and death-score float payloads preserve original signed zero and NaN bits',async()=>{
 const{runtime,bytes,u32,uint,float,allocate,capture,restore,compare}=await oracle();runtime.exports.u(0,0);bytes[22928+872]|=1;
 const entity=runtime.call(144,22928+1936,1,0,0,-1),health=u32(entity+164),loadout=allocate(744),player=allocate(292),options=allocate(4);
 uint(entity+200,loadout);uint(loadout,entity);uint(entity+120,player);uint(player,entity);uint(player+100,entity);uint(player+160,player+156);uint(player+164,player+156);
 bytes[entity+92]|=32;bytes[entity+95]|=32;
 const initial=capture();
 for(const bits of [0x00000000,0x80000000,0x7fc12345,0x7f812345,0xffc12345,0xff812345]){
  restore(initial);uint(health+8,bits);compare([health,0,1,options],`health bits=${bits.toString(16)}`);
  restore(initial);float(health+8,1);uint(loadout+16,bits);compare([health,0,100,options],`death score bits=${bits.toString(16)}`);
 }
});

test('hit notifications retain unsigned entity ordering, id rotation, queue growth and epoch coalescing',async()=>{
 const{runtime,bytes,u32,uint,allocate,capture,restore,compare}=await oracle();runtime.exports.u(0,0);
 const world=22928,entity=runtime.call(144,world+1936,1,0,0,-1),health=u32(entity+164),options=allocate(4),acknowledged=allocate(24),queued=allocate(64);
 const originalId=u32(entity+16),initial=capture();
 for(const generation of [0,1,0x3ffff])for(const acknowledgedOffset of [-1,0,1])for(const queueCount of [0,1,3])for(const force of [false,true])for(const duplicateEpoch of [false,true]){
  restore(initial);const id=((generation<<14)|(originalId&16383))>>>0;uint(entity+16,id);
  uint(world+395960,1);uint(world+395968,acknowledged);uint(acknowledged,id+acknowledgedOffset);
  uint(world+395984,queueCount);uint(world+395988,queueCount===3?4:queueCount);uint(world+395992,queued);bytes[world+396008]=force?1:0;
  if(duplicateEpoch)uint(health+28,u32(world+2140));
  compare([health,0,1,options],`hit generation=${generation},ack=${acknowledgedOffset},queue=${queueCount},force=${force},same epoch=${duplicateEpoch}`);
 }
});

test('invalid health/options addresses trap with the same partially updated stack and memory',async()=>{
 const{runtime,u32,allocate,capture,restore,compare}=await oracle();runtime.exports.u(0,0);
 const entity=runtime.call(144,22928+1936,1,0,0,-1),health=u32(entity+164),options=allocate(4),initial=capture();
 for(const args of [[67108864,0,1,options],[67108856,0,1,options],[health,0,1,67108863],[health,0,1,67108864]]){
  restore(initial);compare(args,`invalid address ${args}`);
 }
});

test('full rarity groups and backpack tails follow the original bounded shuffle and retention RNG',async()=>{
 const{runtime,bytes,u32,uint,float,allocate,capture,restore,compare}=await oracle();runtime.exports.u(0,0);
 const entity=runtime.call(144,22928+1936,1,0,0,-1),health=u32(entity+164),loadout=allocate(744),options=allocate(4);
 uint(entity+200,loadout);uint(loadout,entity);bytes[loadout+148]=45;
 const groups=Array.from({length:6},(_,tier)=>Array.from({length:38},(_,i)=>i+1).filter(id=>id!==1&&u32(8545792+id*52+24)===tier)).filter(ids=>ids.length);
 const initial=capture();
 for(const group of groups)for(const bagSize of [0,16,32])for(const seed of [1,2,47,209,320,516,123456789,2147483646]){
  restore(initial);float(health+8,1);uint(8573024,seed);uint(8573028,seed);bytes[8569380]=1;
  for(let i=0;i<16;i++)bytes[loadout+20+i]=bagSize?0:group[i%group.length];
  bytes[loadout+704]=bagSize;for(let i=0;i<bagSize;i++)bytes[loadout+705+i]=group[i%group.length];
  compare([health,0,100,options],`rarity=${u32(8545792+group[0]*52+24)},bag=${bagSize},seed=${seed}`);
 }
});
