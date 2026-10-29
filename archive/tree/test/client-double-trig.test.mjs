import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createClientDoubleTrigHooks,functionIds} from '../source/game/client/double-trig.mjs';
let comparisons=0,memoryCheckpoints=0,groupMemoryChecks=0;
after(()=>console.log(`Double trigonometry oracle comparisons: ${comparisons}; stack checkpoints: ${memoryCheckpoints}; group memory checks: ${groupMemoryChecks}`));
const view=new DataView(new ArrayBuffer(8));
const bits=value=>{view.setFloat64(0,value,true);return view.getBigUint64(0,true);};
const fromBits=value=>{view.setBigUint64(0,BigInt.asUintN(64,value),true);return view.getFloat64(0,true);};
const fromWords=(high,low)=>fromBits((BigInt(high>>>0)<<32n)|BigInt(low>>>0));
const WINDOW=4096,OUT=1_000_000;

async function oracle(){
 const runtime=await loadOriginal('client',{functionIds:[...functionIds,930]}),hooks=createClientDoubleTrigHooks(runtime);
 const snapshot=(address,size)=>Buffer.from(new Uint8Array(runtime.memory.buffer,address,size));
 function compare(id,args,label){
  const saved=runtime.stackPointer.value,start=saved-WINDOW;
  assert.ok(start>0&&start+WINDOW<=runtime.memory.buffer.byteLength,`stack window ${start}`);
  const out=id===931,stackBefore=snapshot(start,WINDOW),outBefore=out?snapshot(OUT,8):null;
  const expected=runtime.call(id,...args),expectedStack=runtime.stackPointer.value;
  const stackAfter=snapshot(start,WINDOW),outAfter=out?snapshot(OUT,8):null;
  new Uint8Array(runtime.memory.buffer,start,WINDOW).set(stackBefore);
  if(out)new Uint8Array(runtime.memory.buffer,OUT,8).set(outBefore);
  runtime.stackPointer.value=saved;
  const actual=hooks[id](...args),actualStack=runtime.stackPointer.value;
  comparisons++;memoryCheckpoints++;
  if(id===931)assert.equal(actual,expected,`${label}: ${args} quadrant expected ${expected}, got ${actual}`);
  else assert.equal(bits(actual),bits(expected),`${label}: ${args} expected ${bits(expected).toString(16)}, got ${bits(actual).toString(16)}`);
  assert.equal(actualStack,expectedStack,`${label}: stack pointer ${expectedStack} vs ${actualStack}`);
  assert.ok(stackAfter.equals(snapshot(start,WINDOW)),`${label}: stack scratch differs for ${args}`);
  if(out)assert.ok(outAfter.equals(snapshot(OUT,8)),`${label}: reduction output differs for ${args}`);
 }
 function memoryBoundary(){return{before:Buffer.from(runtime.memory.buffer),stack:runtime.stackPointer.value};}
 function assertMemoryOutsideStack(saved,label){
  const after=Buffer.from(runtime.memory.buffer),start=saved.stack-WINDOW;
  assert.ok(after.subarray(0,start).equals(saved.before.subarray(0,start)),`${label}: memory below stack changed`);
  assert.ok(after.subarray(saved.stack).equals(saved.before.subarray(saved.stack)),`${label}: memory above stack changed`);
  assert.equal(runtime.stackPointer.value,saved.stack,`${label}: stack pointer`);
  groupMemoryChecks++;
 }
 return{runtime,hooks,compare,memoryBoundary,assertMemoryOutsideStack};
}

const specialBits=[0x0000000000000000n,0x8000000000000000n,0x0000000000000001n,0x8000000000000001n,
 0x000fffffffffffffn,0x800fffffffffffffn,0x0010000000000000n,0x8010000000000000n,
 0x3fe0000000000000n,0xbfe0000000000000n,0x3ff0000000000000n,0xbff0000000000000n,
 0x3ff921fb54442d18n,0xbff921fb54442d18n,0x4000000000000000n,0xc000000000000000n,
 0x400921fb54442d18n,0xc00921fb54442d18n,0x4012d97c7f3321d2n,0xc012d97c7f3321d2n,
 0x7fe0000000000000n,0xffe0000000000000n,0x7fefffffffffffffn,0xffefffffffffffffn,
 0x7ff0000000000000n,0xfff0000000000000n,0x7ff8000000000000n,0xfff8000000000000n];
const boundaryHigh=[1044816029,1044816030,1045430271,1045430272,1072243195,1072243196,
 1073928571,1073928572,1074752121,1074752122,1074977147,1074977148,1075183035,1075183036,
 1075388922,1075388923,1075594810,1075594811,1094263289,1094263290,1094263291,
 2146435071,2146435072,2146435073];

function randomBits(seed,count,{minHigh=0,maxHigh=0x7fefffffff}={}){
 const result=[];
 for(let index=0;index<count;index++) {
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  const high=Number(seed>>32n)>>>0;
  const mapped=minHigh+((high%(maxHigh-minHigh+1))>>>0);
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  result.push((BigInt(mapped)<<32n)|BigInt(Number(seed>>32n)>>>0));
 }
 return result;
}

test('double cosine and sine kernels preserve coefficients, tails and operation order',async()=>{
 const{compare,memoryBoundary,assertMemoryOutsideStack}=await oracle();
 const saved=memoryBoundary();
 const values=[...specialBits.map(fromBits),0,-0,1,-1,.5,-.5,.1,-.1,.7853981633974483,1.5707963267948966,
  3.141592653589793,4.71238898038469,6.283185307179586,1e-8,-1e-8,1e8,-1e8,1e22,-1e22,1e300,-1e300];
 for(const x of values)for(const y of [0,-0,1e-10,-1e-10,.1,-.2,1e-300,-1e-300]){
  compare(593,[x,y],'kernel cos');
  compare(594,[x,y,0],'kernel sin even');compare(594,[x,y,1],'kernel sin odd');
 }
 const seeds=[0x243f6a8885a308d3n,0x13198a2e03707344n,0xa4093822299f31d0n];
 for(const seed of seeds)for(const raw of randomBits(seed,350)) {
  const x=fromBits(raw),y=fromBits(raw^0x8000000000000000n)/3;
  compare(593,[x,y],'random kernel cos');
  compare(594,[x,y,0],'random kernel sin even');compare(594,[x,y,1],'random kernel sin odd');
 }
 assertMemoryOutsideStack(saved,'double kernels');
});

test('rem_pio2 matches every reduction branch, sign and high-word boundary',async()=>{
 const{compare,memoryBoundary,assertMemoryOutsideStack}=await oracle();
 const saved=memoryBoundary();
 for(const high of boundaryHigh)for(const low of [0,1,0x000fffff,598523,0xffffffff]){
  for(const sign of [0,0x80000000])compare(931,[fromWords((high|sign)>>>0,low),OUT],'rem_pio2 boundary');
 }
 for(const raw of specialBits)compare(931,[fromBits(raw),OUT],'rem_pio2 special');
 let seed=0x9e3779b97f4a7c15n;
 for(let index=0;index<1800;index++) {
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  const sign=Number(seed&1n)?0x80000000:0;
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  const high=(Number(seed>>32n)&0x7fefffff)|sign;
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  compare(931,[fromWords(high,Number(seed>>32n)>>>0),OUT],'rem_pio2 random');
 }
 for(const raw of randomBits(0x082efa98ec4e6c89n,600,{minHigh:1094263291,maxHigh:2146435071})) {
  for(const sign of [0n,0x8000000000000000n])compare(931,[fromBits(raw|sign),OUT],'rem_pio2 huge');
 }
 assertMemoryOutsideStack(saved,'rem_pio2');
});

test('cos and sin match every quadrant through the recovered reduction',async()=>{
 const{compare,memoryBoundary,assertMemoryOutsideStack}=await oracle();
 const saved=memoryBoundary();
 const samples=[0,-0,1,-1,.1,1.5707963267948966,3.141592653589793,4.71238898038469,6.283185307179586,
  1e6,-1e6,1e10,-1e10,1e22,-1e22,1e300,-1e300,Number.MAX_VALUE,-Number.MAX_VALUE,Infinity,-Infinity,NaN];
 for(const x of samples){compare(403,[x],'cos');compare(407,[x],'sin');}
 for(const raw of randomBits(0xc0ac29b7c97c50ddn,900)) {
  const x=fromBits(raw);
  compare(403,[x],'random cos');compare(407,[x],'random sin');
 }
 assertMemoryOutsideStack(saved,'cos/sin');
});

test('double trig entries retain WASM coercion, pointer conversion and traps',async()=>{
 const{runtime,hooks}=await oracle();
 const factories=[()=>null,()=>undefined,()=>true,()=>false,()=>'',()=>'.8',()=>1n,()=>Symbol('numeric'),
  trace=>({valueOf(){trace.push('value');return .8;}}),trace=>({valueOf(){trace.push('bigint');return 1n;}}),
  trace=>({valueOf(){trace.push('throw');throw new RangeError('numeric callback');}})];
 for(const id of [403,407,593,594])for(const factory of factories) {
  function invoke(original) {
   const trace=[],args=id===594?[factory(trace),.25,1]:[factory(trace),.25];
   try{return{bits:bits(original?runtime.call(id,...args):hooks[id](...args)),trace};}
   catch(error){return{error:error.constructor.name,message:error.message,trace};}
  }
  assert.deepEqual(invoke(false),invoke(true),`function ${id}`);
 }
 for(const pointer of [-1,-8,0x7ffffff8,0xfffffff8])for(const input of [.5,1e8,-1e8,1e300]) {
  const saved=runtime.stackPointer.value;
  function invoke(original) {
   try{return{value:original?runtime.call(931,input,pointer):hooks[931](input,pointer),stack:runtime.stackPointer.value};}
   catch(error){return{error:error.constructor.name,stack:runtime.stackPointer.value};}
   finally{runtime.stackPointer.value=saved;}
  }
  assert.deepEqual(invoke(false),invoke(true),`out-of-bounds pointer ${pointer} input ${input}`);
 }
 const address=runtime.memory.buffer.byteLength-8,saved=runtime.stackPointer.value;
 const before=Buffer.from(new Uint8Array(runtime.memory.buffer,address-8,16));
 function partial(original) {
  let outcome;
  try{outcome={value:original?runtime.call(931,1e300,address):hooks[931](1e300,address),stack:runtime.stackPointer.value};}
  catch(error){outcome={error:error.constructor.name,stack:runtime.stackPointer.value};}
  const written=Buffer.from(new Uint8Array(runtime.memory.buffer,address-8,16));
  runtime.stackPointer.value=saved;
  new Uint8Array(runtime.memory.buffer,address-8,16).set(before);
  return{outcome,written};
 }
 const expected=partial(true),actual=partial(false);
 assert.deepEqual(actual,expected,'partially written output');
 new Uint8Array(runtime.memory.buffer,address-8,16).set(before);
});
