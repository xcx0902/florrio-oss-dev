import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createClientRuntimePrimitiveHooks,functionIds} from '../source/game/client/runtime-primitives.mjs';
let memoryComparisons=0,scalarComparisons=0;
after(()=>console.log(`Runtime primitive oracle comparisons: ${memoryComparisons} memory, ${scalarComparisons} scalar`));

async function oracle() {
  let runtime,fail=false,hostResult=77;
  const events=[];
  runtime=await loadOriginal('client',{functionIds:[...functionIds,368],construct:false,imports:{a:{Fa:(destination,source,length)=>{
    events.push([destination,source,length]);
    if(fail)throw new Error('copy host failure');
    new Uint8Array(runtime.memory.buffer).copyWithin(destination,source,source+length);
    return hostResult;
  }}}});
  runtime.instance.exports.Nf();
  const hooks=createClientRuntimePrimitiveHooks(runtime),bytes=Buffer.from(runtime.memory.buffer);
  const capture=()=>({bytes:Buffer.from(bytes),stack:runtime.stackPointer.value});
  const restore=s=>{bytes.set(s.bytes);runtime.stackPointer.value=s.stack;};
  function compare(id,args,label){
    memoryComparisons++;
    const before=capture();events.length=0;
    const invoke=fn=>{try{return{result:fn(...args)}}catch(e){return{error:[e.constructor.name,e.message]}}};
    const expected=invoke((...args)=>runtime.call(id,...args)),after=capture(),calls=structuredClone(events);
    restore(before);events.length=0;
    const actual=invoke(hooks[id]);
    assert.deepEqual(actual,expected,label);assert.deepEqual(events,calls,`${label}: calls`);
    assert.equal(runtime.stackPointer.value,after.stack,`${label}: stack`);
    if(!bytes.equals(after.bytes)){
      const differences=[];for(let i=0;i<bytes.length&&differences.length<16;i++)if(bytes[i]!==after.bytes[i])differences.push([i,after.bytes[i],bytes[i]]);
      assert.fail(`${label}: full memory ${JSON.stringify(differences)}`);
    }
    return expected;
  }
  return{runtime,hooks,bytes,events,capture,restore,compare,setFailure:value=>{fail=value},setHostResult:value=>{hostResult=value}};
}

test('client memory copy preserves every alignment and byte/word/block/host threshold',async()=>{
  const o=await oracle(),{runtime,bytes,capture,restore,compare}=o;
  const source=runtime.call(368,4096),destination=runtime.call(368,4096);
  for(let i=0;i<4096;i++)bytes[source+i]=(i*137+29)&255;
  const initial=capture();
  for(let left=0;left<4;left++)for(let right=0;right<4;right++)for(const length of [0,1,2,3,4,7,8,15,16,31,32,63,64,65,127,128,255,256,511,512,513,1024]){
    restore(initial);assert.equal(compare(363,[destination+left,source+right,length],`alignment ${left}/${right}/${length}`).error,undefined);
  }
});

test('client memory copy retains forward overlap order and large-copy host semantics',async()=>{
  const {runtime,bytes,capture,restore,compare}=await oracle(),storage=runtime.call(368,4096);
  for(let i=0;i<4096;i++)bytes[storage+i]=(i*137+29)&255;
  const initial=capture();
  for(const displacement of [-68,-65,-64,-5,-4,-3,-1,0,1,3,4,5,64,65,68])for(const length of [0,1,3,4,7,63,64,65,127,511,512]){
    restore(initial);assert.equal(compare(363,[storage+256+displacement,storage+256,length],`overlap ${displacement}/${length}`).error,undefined);
  }
});

test('client memory copy retains wraparound no-ops, partial memory traps, and host exceptions',async()=>{
  const o=await oracle(),{runtime,bytes,capture,restore,compare,setFailure}=o,storage=runtime.call(368,4096);
  for(let i=0;i<4096;i++)bytes[storage+i]=(i*137+29)&255;
  const initial=capture(),limit=bytes.length;
  const cases=[[0xffffffff,storage,0],[storage,0xffffffff,0],[0xffffffff,storage,1],[0xfffffffc,storage,4],
    [storage,0xffffffff,1],[limit-2,storage,10],[limit-4,storage,64],[limit-64,storage,65],
    [storage,limit-2,10],[storage,limit-4,64],[storage,limit-64,65],[-4,-4,4],
    [-1,storage,512],[storage,-1,512],[storage,storage,-1],[storage,storage,-2147483648]];
  for(const args of cases){restore(initial);compare(363,args,`copy boundary ${args}`);}
  for(const length of [512,513,1024]){restore(initial);setFailure(true);assert.equal(compare(363,[storage+512,storage,length],'host failure').error?.[0],'Error');}
});

test('client byte comparison retains unsigned differences, early exits, invalid pointers and zero counts',async()=>{
  const {runtime,hooks,bytes,capture,restore,compare}=await oracle(),left=runtime.call(368,512),right=runtime.call(368,512);
  for(let i=0;i<512;i++)bytes[left+i]=bytes[right+i]=(i*137+29)&255;
  const initial=capture();
  for(const length of [0,1,2,3,4,15,16,63,64,127,255,511]){
    restore(initial);assert.equal(compare(366,[left,right,length],`equal ${length}`).result,0);
    for(const position of [0,Math.max(0,length-1)])for(const value of [0,1,127,128,255]){
      restore(initial);bytes[right+position]=value;
      compare(366,[left,right,length],`difference ${length}/${position}/${value}`);
    }
  }
  for(const args of [[-1,-1,0],[-1,right,1],[left,-1,1],[bytes.length-1,bytes.length-1,2],[-1,-1,-1]]){
    restore(initial);compare(366,args,`compare pointer ${args}`);
  }
  restore(initial);bytes[left]=1;bytes[right]=255;
  assert.equal(compare(366,[left,right,0xffffffff],'early difference before huge count').result,-254);
  const before=capture();
  for(let a=0;a<256;a++)for(const b of [0,1,127,128,255]){
    bytes[left]=a;bytes[right]=b;assert.equal(hooks[366](left,right,1),runtime.call(366,left,right,1));scalarComparisons++;
  }
  // The scalar batch may only change the explicit input bytes.
  bytes[left]=before.bytes[left];bytes[right]=before.bytes[right];assert.ok(bytes.equals(before.bytes));
});

test('large-copy imports preserve ToNumber before narrowing the unused i32 return',async()=>{
  const {runtime,bytes,capture,restore,compare,setHostResult}=await oracle(),storage=runtime.call(368,2048);
  for(let i=0;i<1024;i++)bytes[storage+i]=(i*137+29)&255;
  const initial=capture();
  for(const result of [0n,{valueOf:()=>0n},Symbol('copy-result'),undefined,NaN,Infinity,3.75,{valueOf:()=>42}]){
    restore(initial);setHostResult(result);compare(363,[storage+1024,storage,512],`host result ${String(result)}`);
  }
});

test('client f64 rounding preserves raw exponent boundaries, half ties, signed zero and NaN payloads',async()=>{
  const {runtime,hooks,bytes,capture}=await oracle(),scratch=new DataView(new ArrayBuffer(8));
  const values=[];
  for(let exponent=0;exponent<2048;exponent++)for(const mantissa of [0n,1n,0x7ffffffffffffn,0x8000000000000n,0xfffffffffffffn])for(const sign of [0n,0x8000000000000000n])values.push(sign|BigInt(exponent)<<52n|mantissa);
  let seed=0x123456789abcdef0n;
  for(let i=0;i<4096;i++){seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);values.push(seed);}
  for(const number of [-2.5,-1.5,-.5,.5,1.5,2.5,4503599627370495,4503599627370495.5]){scratch.setFloat64(0,number,true);values.push(scratch.getBigUint64(0,true));}
  const before=capture();
  for(const bits of values){
    scratch.setBigUint64(0,bits,true);const value=scratch.getFloat64(0,true);
    const expected=runtime.call(373,value),actual=hooks[373](value);
    scratch.setFloat64(0,expected,true);const expectedBits=scratch.getBigUint64(0,true);
    scratch.setFloat64(0,actual,true);assert.equal(scratch.getBigUint64(0,true),expectedBits,`round bits ${bits.toString(16)}`);scalarComparisons++;
  }
  assert.ok(bytes.equals(before.bytes));assert.equal(runtime.stackPointer.value,before.stack);
});
