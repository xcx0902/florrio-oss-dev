import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createClientMathHooks} from '../source/game/client/math.mjs';
let scalarComparisons=0;
after(()=>console.log(`Math oracle scalar comparisons: ${scalarComparisons}`));
const bits=new DataView(new ArrayBuffer(8));
const raw=value=>{bits.setFloat64(0,value,true);return bits.getBigUint64(0,true);};
const number=value=>{bits.setBigUint64(0,value,true);return bits.getFloat64(0,true);};
async function oracle(){
 const runtime=await loadOriginal('client',{functionIds:[375,511]}),hooks=createClientMathHooks(runtime);
 function compare(id,args,label){
  const expected=runtime.call(id,...args),actual=hooks[id](...args);scalarComparisons++;
  assert.equal(raw(actual),raw(expected),`${label}: ${args} expected ${raw(expected).toString(16)}, got ${raw(actual).toString(16)}`);
 }
 return{runtime,hooks,compare};
}

test('pow complete source matches special values, negative-base integer classes and exponent thresholds',async()=>{
 const{runtime,compare}=await oracle(),before=Buffer.from(runtime.memory.buffer),stack=runtime.stackPointer.value;
 const values=[-Infinity,-Number.MAX_VALUE,-(2**52),-3,-2,-1,-.5,-Number.MIN_VALUE,-0,0,Number.MIN_VALUE,.5,1,1.0000000000000002,1.5,2,3,2**52,Number.MAX_VALUE,Infinity,NaN];
 const exponents=[-Infinity,-(2**64),-(2**53),-(2**32),-1075,-1074,-1024,-1023,-513,-3,-2.5,-2,-1.5,-1,-.5,-Number.MIN_VALUE,-0,0,Number.MIN_VALUE,.5,1,1.5,2,2.5,3,511,1023,1024,1074,2**31,2**32,2**53,2**64,Infinity,NaN];
 for(const x of values)for(const y of exponents)compare(375,[x,y],'special pow');
 assert.ok(Buffer.from(runtime.memory.buffer).equals(before));assert.equal(runtime.stackPointer.value,stack);
});

test('pow and scaling match deterministic raw IEEE patterns and precision boundaries',async()=>{
 const{runtime,compare}=await oracle(),before=Buffer.from(runtime.memory.buffer),stack=runtime.stackPointer.value;
 let seed=0x123456789abcdef0n;
 const next=()=>{seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);return seed;};
 for(let i=0;i<12000;i++)compare(375,[number(next()),number(next())],`raw pow ${i}`);
 for(let exponent=0;exponent<2048;exponent++)for(const mantissa of [0n,1n,0x7ffffffffffffn,0x8000000000000n,0xfffffffffffffn]){
  const value=number(BigInt(exponent)<<52n|mantissa);
  for(const y of [-3,-.5,.5,2,3])compare(375,[value,y],`exponent ${exponent}`);
 }
 for(const x of [-Infinity,-Number.MAX_VALUE,-1,-Number.MIN_VALUE,-0,0,Number.MIN_VALUE,1,Number.MAX_VALUE,Infinity,NaN])for(const n of [-2147483648,-3067,-3066,-3065,-2046,-2045,-2044,-1024,-1023,-1022,-1,0,1,1023,1024,2046,2047,3068,3069,3070,2147483647])compare(511,[x,n],'scale boundary');
 assert.ok(Buffer.from(runtime.memory.buffer).equals(before));assert.equal(runtime.stackPointer.value,stack);
});

test('pow preserves the three live coefficient table reads and their NaN payloads',async()=>{
 const{runtime,compare}=await oracle(),view=new DataView(runtime.memory.buffer);
 const addresses=[131936,131944,131952,131960,131968,131976];
 const saved=addresses.map(address=>view.getBigUint64(address,true));
 const before=Buffer.from(runtime.memory.buffer),stack=runtime.stackPointer.value;
 try {
  for(let entry=0;entry<addresses.length;entry++)for(const replacement of [0n,0x8000000000000000n,0x3fe8000000000000n,0x4008000000000000n,0x7ff0000000000000n,0xfff0000000000000n,0x7ff8000000001234n,0xfff0000000005678n]) {
   view.setBigUint64(addresses[entry],replacement,true);
   for(const base of [.6,.8,1.1,1.4,1.8,3,-1.4])for(const exponent of [-3,.06,.8,3,511])compare(375,[base,exponent],`live table ${entry} ${replacement.toString(16)}`);
   view.setBigUint64(addresses[entry],saved[entry],true);
  }
 }finally{addresses.forEach((address,i)=>view.setBigUint64(address,saved[i],true));}
 assert.ok(Buffer.from(runtime.memory.buffer).equals(before));assert.equal(runtime.stackPointer.value,stack);
});

test('pow retains game easing values, logarithm intervals and half-integer reduction boundaries',async()=>{
 const{runtime,compare}=await oracle(),before=Buffer.from(runtime.memory.buffer),stack=runtime.stackPointer.value;
 for(const base of [.6,.7,.8,.9])for(let elapsed=-300;elapsed<=3000;elapsed++)compare(375,[base,elapsed*.06],'game easing');
 for(const center of [0x3ff3988fn,0x3ffbb67an,0x3ff00000n,0x41300000n,0x433fffffn,0x43400000n])for(let offset=-16;offset<=16;offset++) {
  const value=number(((center+BigInt(offset))<<32n)|0xffffffffn);
  for(const base of [value,-value])for(const exponent of [-1000,-3,-.5,.5,2,3,1000])compare(375,[base,exponent],'interval boundaries');
 }
 for(let exponent=-1075;exponent<=1024;exponent++)for(const delta of [-1e-12,0,1e-12])compare(375,[2,exponent+.5+delta],'half integer reduction');
 let seed=0xfeedfacecafebeefn;
 for(let index=0;index<20000;index++) {
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  const value=number(seed);
  compare(511,[value,(index%7201)-3600],'raw scale');
 }
 assert.ok(Buffer.from(runtime.memory.buffer).equals(before));assert.equal(runtime.stackPointer.value,stack);
});

test('math entry points retain WASM parameter coercion, order and exceptions',async()=>{
 const{runtime,hooks}=await oracle();
 const factories=[()=>null,()=>undefined,()=>true,()=>false,()=>'',()=>'.8',()=>1n,()=>Symbol('numeric'),
  trace=>({valueOf(){trace.push('value');return .8;}}),trace=>({valueOf(){trace.push('bigint');return 1n;}}),
  trace=>({valueOf(){trace.push('throw');throw new RangeError('numeric callback');}})];
 for(const id of [375,511])for(let argument=0;argument<2;argument++)for(const factory of factories) {
  function invoke(original) {
   const trace=[],args=[1.2,3];args[argument]=factory(trace);
   try{return{bits:raw(original?runtime.call(id,...args):hooks[id](...args)),trace};}
   catch(error){return{error:error.constructor.name,message:error.message,trace};}
  }
  assert.deepEqual(invoke(false),invoke(true),`function ${id}, argument ${argument}`);
 }
});
