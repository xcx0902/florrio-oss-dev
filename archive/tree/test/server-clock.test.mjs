import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createClockHooks,functionIds} from '../source/game/server/clock.mjs';

async function oracle(){
  let runtime,now=1234.56789,valid=1,throwAt=0;
  const events=[];
  function host(address,signature,pointer){
    events.push({address,signature,pointer,bytes:Buffer.from(new Uint8Array(runtime.memory.buffer,pointer,16)).toString('hex')});
    if(throwAt===events.length)throw new Error('clock failure');
    return address===22791?valid:now;
  }
  runtime=await loadOriginal('sp_server',{functionIds:[...functionIds,16],imports:{a:{a:host,b:host}}});
  const bytes=Buffer.from(runtime.memory.buffer),view=new DataView(runtime.memory.buffer),hooks=createClockHooks(runtime);
  const word=(a,v)=>view.setUint32(a,v,true),double=(a,v)=>view.setFloat64(a,v,true);
  const allocate=n=>runtime.call(16,n),capture=()=>({memory:Buffer.from(bytes),stack:runtime.stackPointer.value});
  const restore=s=>{bytes.set(s.memory);runtime.stackPointer.value=s.stack;};
  function compare(id,args,label){
    const before=capture();events.length=0;let expectedReturn,expectedError,actualReturn,actualError;
    try{expectedReturn=runtime.call(id,...args);}catch(e){expectedError=[e.constructor.name,e.message];}
    const expected=capture(),expectedEvents=structuredClone(events);restore(before);events.length=0;
    try{actualReturn=hooks[id](...args);}catch(e){actualError=[e.constructor.name,e.message];}
    assert.equal(actualReturn,expectedReturn,`${label}: result`);assert.deepEqual(actualError,expectedError,`${label}: error`);assert.deepEqual(events,expectedEvents,`${label}: host`);assert.equal(runtime.stackPointer.value,expected.stack,`${label}: stack`);
    if(!bytes.equals(expected.memory)){const diff=[];for(let i=0;i<bytes.length&&diff.length<20;i++)if(bytes[i]!==expected.memory[i])diff.push({at:i,original:expected.memory[i],recovered:bytes[i]});assert.fail(`${label}: memory ${JSON.stringify(diff)}`);}
  }
  return{runtime,bytes,view,word,double,allocate,capture,restore,compare,configure:(clockValid,clockNow,throws=0)=>{valid=clockValid;now=clockNow;throwAt=throws;}};
}

test('initializer guards preserve every state byte, recursive traps and complete scratch writes',async()=>{
  const o=await oracle(),{bytes,allocate,compare,capture,restore}=o,guard=allocate(8),initial=capture();
  for(const first of[0,1,2,255])for(let second=0;second<256;second++){
    restore(initial);bytes[guard]=first;bytes[guard+1]=second;compare(32,[guard],`acquire ${first}/${second}`);
  }
  for(const first of[0,1,2,255])for(const second of[0,1,2,3,4,255]){
    restore(initial);bytes[guard]=first;bytes[guard+1]=second;compare(31,[guard],`release ${first}/${second}`);
  }
});

test('clock cold/warm initialization, override, clock kind and nonfinite timestamps match',async()=>{
  const o=await oracle(),{bytes,word,double,allocate,compare,capture,restore,configure}=o,output=allocate(16),initial=capture();
  for(let initialized=0;initialized<8;initialized++)for(const override of[0,1])for(const valid of[0,1,undefined])for(const now of[0,1234.56789,Infinity,NaN]){
    restore(initial);
    [8548304,8548300,8569376].forEach((guard,i)=>{bytes[guard]=(initialized>>>i)&1;bytes[guard+1]=(initialized>>>i)&1;});
    bytes[8548296]=7;bytes[8569360]=override;word(8569364,0x12345678);double(8569368,-45.25);configure(valid,now);
    compare(21,[output],`read initialized=${initialized},override=${override},valid=${valid},now=${now}`);
  }
});

test('clock retains host failures, recursive static initialization and output access traps',async()=>{
  const o=await oracle(),{bytes,allocate,compare,capture,restore,configure}=o,output=allocate(16),initial=capture();
  for(const guard of[8548304,8548300,8569376]){
    restore(initial);bytes[guard]=0;bytes[guard+1]=2;compare(21,[output],`pending guard ${guard}`);
  }
  for(const throws of[1,2,3]){
    restore(initial);for(const guard of[8548304,8548300,8569376]){bytes[guard]=0;bytes[guard+1]=0;}configure(1,1000,throws);compare(21,[output],`host failure ${throws}`);
  }
  configure(1,1000);
  for(const [id,args]of[[21,[bytes.length-8]],[21,[-1]],[31,[bytes.length-1]],[32,[bytes.length]]]){
    restore(initial);compare(id,args,`func${id} invalid pointer`);
  }
});
