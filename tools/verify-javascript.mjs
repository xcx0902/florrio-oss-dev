#!/usr/bin/env node
/** Differential probes of shipped vs recovered JS; executes no external services. */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { specs } from './javascript-recovery-names.mjs';
const { parse } = createRequire(import.meta.url)('acorn');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function boot(code, spec, recovered, kind) {
  const logs=[], callbacks=[], elements=new Map();
  function element(id='') {
    const item={ id, style:{setProperty(){},removeProperty(){}}, width:800,height:600,clientWidth:800,clientHeight:600,nodeName:'CANVAS',addEventListener(){},removeEventListener(){},getBoundingClientRect(){return {left:0,top:0,width:800,height:600}}, getContext(){return context},focus(){},select(){},appendChild(){},removeChild(){},insertBefore(){},getAttribute(){},setAttribute(){} };
    item.parentNode=item; return item;
  }
  const context=new Proxy({canvas:null,measureText(text){logs.push(['measureText',text]);return{width:text.length*7}}},{get(object,key){if(key in object)return object[key];return(...args)=>logs.push([String(key),...args]);},set(object,key,value){object[key]=value;logs.push(['contextSet',String(key),typeof value==='object'?'[object]':value]);return true;}});
  const canvas=element('canvas');context.canvas=canvas;elements.set('canvas',canvas);
  const document={currentScript:{src:'http://localhost/client.js'},body:element('body'),documentElement:element('html'),activeElement:null,referrer:'',getElementById(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id)},createElement(){return element()},addEventListener(){},removeEventListener(){},querySelector(){return canvas},title:'',visibilityState:'visible',hidden:false};
  const location={href:'http://localhost/',protocol:'http:',reload(){logs.push(['reload'])},toString(){return this.href}};
  let top=32768,imports;
  const memory=new WebAssembly.Memory({initial:256}), exports={};
  const wasm=kind==='client'?'client':'sp_server';
  const binaryModule=new WebAssembly.Module(globalBinary[wasm]);
  const exportNames=Object.fromEntries(WebAssembly.Module.exports(binaryModule).map(item=>[item.name,item.kind]));
  const mapExports=kind==='client'?{Mf:'memory',eg:'table',Pf:'malloc',Of:'free'}:{o:'memory',z:'table',q:'malloc',r:'free'};
  for(const[name,type]of Object.entries(exportNames))exports[name]=mapExports[name]==='memory'?memory:mapExports[name]==='table'?{get(){return(...args)=>logs.push(['tableCall',...args])}}:mapExports[name]==='malloc'?(size)=>{const pointer=top;top+=size+16;return pointer}:mapExports[name]==='free'?(pointer)=>logs.push(['free',pointer]):(...args)=>{logs.push(['wasmExport',name,...args.map(value=>typeof value==='object'?'[object]':value)]);return 0};
  const module={noInitialRun:true,canvas,print(...args){logs.push(['print',...args])},printErr(...args){logs.push(['printErr',...args])},instantiateWasm(supplied,receive){imports=supplied;receive({exports});return exports}};
  const sandbox={Module:module,document,location,performance:{now:()=>1234},navigator:{userAgent:'Linux test',language:'en-US',languages:['en-US']},console:{log(...args){logs.push(['console',...args])},warn(...args){logs.push(['warn',...args])},error(...args){logs.push(['error',...args])}},WebAssembly,TextDecoder,TextEncoder,Uint8Array,Int8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,ArrayBuffer,DataView,URL,Date,Math,crypto:{getRandomValues(array){array.fill(17);return array}},setTimeout(fn,delay){callbacks.push({fn,delay});return callbacks.length},clearTimeout(){},setInterval(fn,delay){callbacks.push({fn,delay});return callbacks.length},clearInterval(){},postMessage(message){logs.push(['postMessage',JSON.parse(JSON.stringify(message))])},addEventListener(){},removeEventListener(){},screen:{width:1920,height:1080},innerWidth:800,innerHeight:600,devicePixelRatio:1};
  sandbox.window=kind==='client'?sandbox:undefined;sandbox.self=sandbox;
  sandbox.localStorage={};
  const ast=parse(code,{ecmaVersion:2020}),wrapper=ast.body.find(node=>node.expression?.callee?.type==='FunctionExpression').expression.callee;
  const resolve=original=>recovered?spec.names[original]||original:original;
  const fields=kind==='client'?{ASM_CONSTS:spec.asmConsts,UTF8ToString:'G',stringToUTF8:'J',lengthBytesUTF8:'oa',PATH:'H',PATH_FS:'ca',FS:'f',Browser:'r',strftime:'Dc'}:{ASM_CONSTS:spec.asmConsts,UTF8ArrayToString:'O',stringToUTF8Array:'sa',Browser:'e',strftime:'Qa'};
  const injected=`;globalThis.__probe={${Object.entries(fields).map(([key,original])=>`${key}:${resolve(original)}`).join(',')}};`;
  code=code.slice(0,wrapper.body.end-1)+injected+code.slice(wrapper.body.end-1);
  vm.createContext(sandbox);vm.runInContext(code,sandbox,{filename:`${kind}-${recovered?'recovered':'shipped'}.js`,timeout:10000});
  return{sandbox,module,logs,imports,recovered,spec,probe:sandbox.__probe,callbacks,memory};
}
const globalBinary={};for(const kind of ['client','sp_server'])globalBinary[kind]=await fs.readFile(path.join(root,`web/${kind}.wasm`));
const results=[];
for(const[kind,spec]of Object.entries(specs)){
 const original=await boot(await fs.readFile(path.join(root,`web/${kind}.js`),'utf8'),spec,false,kind);
 const recovered=await boot(await fs.readFile(path.join(root,`source/javascript/${kind}.js`),'utf8'),spec,true,kind);
 const observable=value=>value===undefined?'[undefined]':typeof value==='function'?'[function]':JSON.parse(JSON.stringify(value));
 assert.deepEqual(recovered.logs,original.logs,`${kind} startup calls`);
 assert.deepEqual(Object.keys(recovered.imports.a),Object.keys(original.imports.a),`${kind} Wasm ABI`);
 assert.deepEqual(Object.keys(recovered.module).sort(),Object.keys(original.module).sort(),`${kind} Module public API`);
 let probeCount=0;
 const check=(label,invoke)=>{assert.deepEqual(observable(invoke(recovered)),observable(invoke(original)),`${kind}: ${label}`);probeCount++};
 for(const format of ['%Y-%m-%d %H:%M:%S','%A %B %j %V %z','%c %% %p'])check(`strftime ${format}`,env=>{
   const bytes=new Uint8Array(env.memory.buffer),ints=new Int32Array(env.memory.buffer);
   bytes.set(new TextEncoder().encode(format+'\0'),6144);
   [27,45,13,15,9,126,4,287,0,28800,0].forEach((value,index)=>ints[(6208>>2)+index]=value);
   const length=env.probe.strftime(6400,256,6144,6208);return[length,new TextDecoder().decode(bytes.subarray(6400,6400+length))];
 });
 if(kind==='client'){
  for(const text of ['','flower','中文花瓣','🌸🌻','a\u0000b','é🪷']){
   check(`UTF8 ${JSON.stringify(text)}`,env=>{env.probe.stringToUTF8(text,4096,512);return[env.probe.UTF8ToString(4096),env.probe.lengthBytesUTF8(text),...new Uint8Array(env.memory.buffer,4096,48)]});
  }
  for(const filename of ['/a/../flower/./petals/','a//b/../../c','/','../x'])check(`PATH ${filename}`,env=>[env.probe.PATH.normalize(filename),env.probe.PATH.dirname(filename)]);
  check('FS read/write/stat',env=>{const prop=name=>env.recovered?env.spec.properties[name]||name:name;env.probe.FS[prop('Lg')]('/recovery');env.probe.FS[prop('On')]('/recovery/test','petals 🌸');return[env.probe.FS[prop('yn')]('/recovery/test',{encoding:'utf8'}),env.probe.FS.stat('/recovery/test').size]});
  for(const address of [133644,133686,133733,133975,134075,134676,134706,135144,136194,139312,140726,140768,140817,140864,141250,141314,142058,142175,144880,144905,144931,144961,145087,145224,150328]){
    if(address===139312)continue; // font layout requires a browser's layout engine.
    check(`bridge ${address}`,env=>env.probe.ASM_CONSTS[address](1,2));
  }
  check('Canvas context and drawing',env=>{const bridge=env.probe.ASM_CONSTS;let contextId=bridge[135607](640,480);bridge[137186](contextId,255,128,0);bridge[137806](contextId,12,24);bridge[137843](contextId,48,96);return env.logs.slice(-3)});
 }else{
  for(const text of ['','flower','中文花瓣','🌸🌻'])check(`UTF8 ${text}`,env=>{const bytes=new Uint8Array(128);const length=env.probe.stringToUTF8Array(text,bytes,0,128);return[length,env.probe.UTF8ArrayToString(bytes,0,128),...bytes]});
  for(const address of [22791,22855,22903])check(`bridge ${address}`,env=>env.probe.ASM_CONSTS[address](17,5));
  check('worker RPC no payload',env=>{env.sandbox.onmessage({data:{funcName:'sp_server_think',callbackId:7}});return env.logs.at(-1)});
  check('worker RPC payload',env=>{env.sandbox.onmessage({data:{funcName:'sp_server_send',callbackId:8,data:new Uint8Array([1,2,3])}});return[env.logs.at(-1),...new Uint8Array(env.memory.buffer,32768,3)]});
  check('worker provisional and final responses',env=>{
    env.sandbox.onmessage({data:{funcName:'sp_server_think',callbackId:42}});
    new Uint8Array(env.memory.buffer).set([9,8,7],4096);
    env.imports.a.d(4096,3);env.imports.a.c(4096,3);
    let error;try{env.imports.a.c(4096,3)}catch(caught){error=String(caught)}
    return[env.logs.slice(-2),error];
  });
  check('worker WASI environment',env=>{
    env.imports.a.i(7000,7004);env.imports.a.h(7100,7400);
    return[...new Uint8Array(env.memory.buffer,7000,700)];
  });
 }
 results.push({file:kind,startup:true,wasmImportAbiIdentical:true,modulePublicApiIdentical:true,differentialProbes:probeCount});
 console.log(`${kind}: startup, Wasm import ABI, Module API and ${probeCount} differential probes passed`);
}
await fs.writeFile(path.join(root,'reports/javascript-verification.json'),JSON.stringify({method:'Node VM with deterministic browser/worker stubs, synthetic Wasm exports; shipped and recovered code executed independently',limitations:['Does not execute gameplay Wasm','Browser layout/audio/rendering and live network require browser verification'],results},null,2)+'\n');
