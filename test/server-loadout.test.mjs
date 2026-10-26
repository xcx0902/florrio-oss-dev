import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServerWorld} from './helpers/server-world.mjs';
import {createLoadoutHooks} from '../source/game/server/loadout.mjs';
const capture=JSON.parse(await fs.readFile(new URL('../reports/runtime/client-packet-traces.json',import.meta.url),'utf8'));
const spawnPackets=capture.packets.filter(p=>p.direction==='toWorker'&&['startup','spawn'].includes(p.stage));

async function oracle(){
  const world=await createServerWorld(false,{functionIds:[17,34,43,44,47,73,74,85,96,97,125,128,145,217,218,397]});
  for(const packet of spawnPackets){world.send(Uint8Array.from(packet.bytes));world.advance();}
  const {runtime}=world,view=new DataView(runtime.memory.buffer),bytes=Buffer.from(runtime.memory.buffer),hooks=createLoadoutHooks(runtime);
  const u32=a=>view.getUint32(a,true),word=(a,v)=>view.setUint32(a,v,true),double=(a,v)=>view.setFloat64(a,v,true);
  const body=u32(u32(u32(24936)+120)+100),loadout=u32(body+200);assert.ok(body&&loadout,'real captured spawn must create player and loadout');
  function compare(id,args,label){
    const before=world.capture();let expectedReturn,expectedError,actualReturn,actualError;
    try{expectedReturn=runtime.call(id,...args);}catch(e){expectedError=[e.constructor.name,e.message];}
    const expected=world.capture();world.restore(before);
    try{actualReturn=hooks[id](...args);}catch(e){actualError=[e.constructor.name,e.message];}
    assert.equal(actualReturn,expectedReturn,`${label}: return`);assert.deepEqual(actualError,expectedError,`${label}: trap`);
    assert.equal(runtime.stackPointer.value,expected.stack,`${label}: stack`);assert.deepEqual(world.outgoing,expected.outgoing,`${label}: outputs`);
    if(!bytes.equals(expected.memory)){const diff=[];for(let i=0;i<bytes.length&&diff.length<20;i++)if(bytes[i]!==expected.memory[i])diff.push({at:i,original:expected.memory[i],recovered:bytes[i]});assert.fail(`${label}: memory ${JSON.stringify(diff)}`);}
  }
  return{world,runtime,bytes,view,u32,word,double,body,loadout,compare};
}

test('all38 petal types change real slots, retire prior children and construct every configured instance',async()=>{
  const o=await oracle(),{world,loadout,compare}=o,initial=world.capture();
  for(let type=1;type<=38;type++){
    world.restore(initial);compare(125,[loadout,0,type],`change type${type}`);
    for(let instance=0;instance<3;instance++)compare(397,[loadout,0,instance],`create type${type}/${instance}`);
    compare(125,[loadout,0,0],`remove type${type}`);
  }
});

test('loadout operations preserve level/slot limits, same type, wrapped byte values and reserve changes',async()=>{
  const o=await oracle(),{world,loadout,bytes,compare}=o,initial=world.capture();
  for(const level of[0,14,15,29,30,44,45,255])for(const slot of[0,4,5,6,7,8,12,15,16,-1]){
    world.restore(initial);bytes[loadout+148]=level;
    compare(125,[loadout,slot,257],`set level${level} slot${slot}`);
    compare(397,[loadout,slot,0],`create level${level} slot${slot}`);
  }
});

test('petal creation retains consumed capacity, existing handles, nonfinite position and bounds traps',async()=>{
  const o=await oracle(),{world,loadout,body,bytes,u32,word,double,compare}=o,initial=world.capture();
  for(const value of[Infinity,NaN,-0]){
    world.restore(initial);compare(125,[loadout,0,2],'switch to Fast');const position=u32(body+168);bytes[position+80]=1;double(position+88,value);
    compare(397,[loadout,0,0],`nonfinite position ${value}`);
  }
  world.restore(initial);compare(397,[loadout,0,0],'existing handle');
  for(const [id,args]of[[125,[bytes.length-20,0,1]],[397,[bytes.length-296,0,0]],[397,[-1,0,0]],[397,[loadout,0,3]]]){
    world.restore(initial);compare(id,args,`func${id}:invalid inputs`);
  }
  world.restore(initial);compare(125,[loadout,0,2],'switch before entity exhaustion');word(u32(body)+2152,0);
  compare(397,[loadout,0,0],'exhausted entity list');
});
