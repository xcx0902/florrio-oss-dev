import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createClientTrigHooks,functionIds} from '../source/game/client/trig.mjs';
let comparisons=0,memoryCheckpoints=0,groupMemoryChecks=0;
after(()=>console.log(`Trigonometry oracle comparisons: ${comparisons}; stack checkpoints: ${memoryCheckpoints}; group memory checks: ${groupMemoryChecks}`));
const f32View=new DataView(new ArrayBuffer(4));
const f64View=new DataView(new ArrayBuffer(8));
const f32=value=>Math.fround(value);
const f32Bits=value=>{f32View.setFloat32(0,value,true);return f32View.getUint32(0,true);};
const f32FromBits=value=>{f32View.setUint32(0,value,true);return f32View.getFloat32(0,true);};
const f64Bits=value=>{f64View.setFloat64(0,value,true);return f64View.getBigUint64(0,true);};
const f64FromBits=value=>{f64View.setBigUint64(0,BigInt.asUintN(64,value),true);return f64View.getFloat64(0,true);};
const WINDOW=4096,OUT=1_000_000;
async function oracle(){
 const runtime=await loadOriginal('client',{functionIds:[...functionIds,930]}),hooks=createClientTrigHooks(runtime);
 const view=()=>new DataView(runtime.memory.buffer);
 function snapshot(address,size){return Buffer.from(new Uint8Array(runtime.memory.buffer,address,size));}
 function compare(id,args,label){
  const saved=runtime.stackPointer.value,start=saved-WINDOW;
  assert.ok(start>0&&start+WINDOW<=runtime.memory.buffer.byteLength,`stack window ${start}`);
  const out=id===929,stackBefore=snapshot(start,WINDOW),outBefore=out?snapshot(OUT,8):null;
  const expected=runtime.call(id,...args),expectedStack=runtime.stackPointer.value;
  const stackAfter=snapshot(start,WINDOW),outAfter=out?snapshot(OUT,8):null;
  new Uint8Array(runtime.memory.buffer,start,WINDOW).set(stackBefore);
  if(out)new Uint8Array(runtime.memory.buffer,OUT,8).set(outBefore);
  runtime.stackPointer.value=saved;
  const actual=hooks[id](...args),actualStack=runtime.stackPointer.value;
  comparisons++;memoryCheckpoints++;
  if(id===929)assert.equal(actual,expected,`${label}: ${args} quotient expected ${expected}, got ${actual}`);
  else if(id>=427)assert.equal(f32Bits(actual),f32Bits(expected),`${label}: ${args} expected ${f32Bits(expected).toString(16)}, got ${f32Bits(actual).toString(16)}`);
  else assert.equal(f64Bits(actual),f64Bits(expected),`${label}: ${args} expected ${f64Bits(expected).toString(16)}, got ${f64Bits(actual).toString(16)}`);
  assert.equal(actualStack,expectedStack,`${label}: stack pointer ${expectedStack} vs ${actualStack}`);
  assert.ok(stackAfter.equals(snapshot(start,WINDOW)),`${label}: stack scratch differs for ${args}`);
  if(out)assert.ok(outAfter.equals(snapshot(OUT,8)),`${label}: reduction output differs for ${args}`);
 }
 function memoryBoundary(){
  return {before:Buffer.from(runtime.memory.buffer),stack:runtime.stackPointer.value};
 }
 function assertMemoryOutsideStack(saved,label){
  const after=Buffer.from(runtime.memory.buffer),start=saved.stack-WINDOW;
  assert.ok(after.subarray(0,start).equals(saved.before.subarray(0,start)),`${label}: memory below stack changed`);
  assert.ok(after.subarray(saved.stack).equals(saved.before.subarray(saved.stack)),`${label}: memory above stack changed`);
  assert.equal(runtime.stackPointer.value,saved.stack,`${label}: stack pointer`);
  groupMemoryChecks++;
 }
 return{runtime,hooks,compare,memoryBoundary,assertMemoryOutsideStack};
}
const specialBits=[0x00000000,0x80000000,0x00000001,0x80000001,0x007fffff,0x807fffff,0x00800000,0x80800000,
 0x3f000000,0xbf000000,0x3f7fffff,0x3f800000,0xbf800000,0x3fc90fdb,0xbfc90fdb,0x40000000,0xc0000000,
 0x4016cbe4,0xc016cbe4,0x40490fdb,0xc0490fdb,0x4096cbe4,0xc096cbe4,0x40c90fdb,0xc0c90fdb,
 0x4b000000,0xcb000000,0x4b7fffff,0xcb7fffff,0x4e800000,0xce800000,0x7f000000,0xff000000,
 0x7f7fffff,0xff7fffff,0x7f800000,0xff800000,0x7fc00000,0xffc00000];
const boundaryBits=[964689920,1061752794,1075235811,1075235812,1081824209,1085271519,1085271520,1088565717,
 1305022426,1305022427,2139095040];

test('cosf and sinf match every branch, quadrant and f32 boundary pattern',async()=>{
 const{runtime,compare,memoryBoundary,assertMemoryOutsideStack}=await oracle();
 const saved=memoryBoundary();
 const bits=[...specialBits,...boundaryBits];
 for(const base of boundaryBits)for(let offset=-3;offset<=3;offset++)bits.push((base+offset)>>>0);
 for(const raw of bits)for(const value of [f32FromBits(raw),-f32FromBits(raw)]) {
  compare(427,[value],'cosf boundary');compare(431,[value],'sinf boundary');
 }
 assert.ok(comparisons>=300);
 assertMemoryOutsideStack(saved,'cosf/sinf boundary');
});

test('range reduction preserves quotients, remainders and negative zero beyond 2^29',async()=>{
 const{runtime,compare,memoryBoundary,assertMemoryOutsideStack}=await oracle();
 const saved=memoryBoundary();
 const bits=[...specialBits,...boundaryBits];
 for(let exponent=0;exponent<256;exponent++)for(const mantissa of [0,1,0x200000,0x400000,0x600000,0x7fffff]){
  const raw=(exponent<<23|mantissa)>>>0;
  for(const sign of [0,0x80000000])compare(929,[f32FromBits((raw|sign)>>>0),OUT],'rem_pio2f exponent');
 }
 for(const raw of bits)compare(929,[f32FromBits(raw),OUT],'rem_pio2f special');
 let seed=0x243f6a8885a308d3n;
 for(let index=0;index<1500;index++) {
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  const raw=Number(seed>>32n)>>>0;
  compare(929,[f32FromBits(raw),OUT],'rem_pio2f random');
 }
 assertMemoryOutsideStack(saved,'rem_pio2f');
});

test('trigonometric kernels preserve all coefficients and addition order',async()=>{
 const{runtime,compare,memoryBoundary,assertMemoryOutsideStack}=await oracle();
 const saved=memoryBoundary();
 const values=[0,-0,1,-1,.5,-.5,.7853981633974483,-.7853981633974483,1.5707963267948966,-1.5707963267948966,
  3.141592653589793,-3.141592653589793,4.71238898038469,-4.71238898038469,6.283185307179586,-6.283185307179586,
  1e-8,-1e-8,1e8,-1e8,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,Infinity,-Infinity,NaN];
 for(const value of values)for(const id of [486,487])compare(id,[value],'kernel special');
 let seed=0x13198a2e03707344n;
 for(let index=0;index<600;index++) {
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  const value=f64FromBits(seed);
  for(const id of [486,487])compare(id,[value],'kernel random');
 }
 assertMemoryOutsideStack(saved,'kernels');
});

test('sinf and cosf match through the native large reduction over the whole float range',async()=>{
 const{runtime,compare,memoryBoundary,assertMemoryOutsideStack}=await oracle();
 const saved=memoryBoundary();
 const samples=[1e10,-1e10,1e20,-1e20,1e30,-1e30,1e38,-1e38,3.4028234663852886e38,-3.4028234663852886e38,
  16777216,-16777216,33554432,-33554432,1e7,-1e7,1e8,-1e8,1e9,-1e9];
 for(const value of samples){compare(427,[value],'cosf large');compare(431,[value],'sinf large');}
 let seed=0x9e3779b97f4a7c15n;
 for(let index=0;index<250;index++) {
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  const raw=Number(seed>>32n)>>>0;
  const value=f32FromBits(raw);
  compare(427,[value],'cosf random');compare(431,[value],'sinf random');
 }
 assertMemoryOutsideStack(saved,'cosf/sinf large');
});

test('trig entries retain WASM coercion, argument order and out-of-bounds traps',async()=>{
 const{runtime,hooks}=await oracle();
 const factories=[()=>null,()=>undefined,()=>true,()=>false,()=>'',()=>'.8',()=>1n,()=>Symbol('numeric'),
  trace=>({valueOf(){trace.push('value');return .8;}}),trace=>({valueOf(){trace.push('bigint');return 1n;}}),
  trace=>({valueOf(){trace.push('throw');throw new RangeError('numeric callback');}})];
 for(const id of [427,431,486,487])for(const factory of factories) {
  function invoke(original) {
   const trace=[],args=[factory(trace)];
   try{return{bits:id>=427?f32Bits(original?runtime.call(id,...args):hooks[id](...args)):f64Bits(original?runtime.call(id,...args):hooks[id](...args)),trace};}
   catch(error){return{error:error.constructor.name,message:error.message,trace};}
  }
  assert.deepEqual(invoke(false),invoke(true),`function ${id}`);
 }
 for(const pointer of [-1,-8,0x7ffffff8,0xfffffff8])for(const input of [1,1e10,-1e10]) {
  const saved=runtime.stackPointer.value;
  function invoke(original) {
   try { return {value:original?runtime.call(929,input,pointer):hooks[929](input,pointer),stack:runtime.stackPointer.value}; }
   catch(error) { return {error:error.constructor.name,stack:runtime.stackPointer.value}; }
   finally { runtime.stackPointer.value=saved; }
  }
  assert.deepEqual(invoke(false),invoke(true),`out-of-bounds pointer ${pointer} input ${input}`);
 }
});
