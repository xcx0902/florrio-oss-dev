#!/usr/bin/env node
/** Execute immutable original damage43 and poison ticks654; optionally compare
 * the native regression executable's trace. No original bytes are modified. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServerWorld } from '../../../test/helpers/server-world.mjs';

const server=await createServerWorld(false,{functionIds:[43,144,747]});
const {runtime}=server, view=new DataView(runtime.memory.buffer), bytes=new Uint8Array(view.buffer);
const u32=p=>view.getUint32(p,true), word=(p,n)=>view.setUint32(p,n,true);
const target=runtime.call(144,24864,1,1000,1000,-1), health=u32(target+164), effects=u32(target+192);
assert.ok(health && effects && u32(target+184));
view.setFloat32(health+8,1000,true); view.setFloat32(health+12,1000,true);
const options=runtime.call(16,2), optionEvidence=[];
for(const flags of [0,1,255,256,257,65280]) {
  view.setUint16(options,flags,true); word(22928+2140,u32(22928+2140)+1);
  const beforeHealth=view.getFloat32(health+8,true), beforeEpoch=u32(health+28);
  runtime.call(43,health,0,1,options);
  const row={flags,loss:beforeHealth-view.getFloat32(health+8,true),hit:u32(health+28)!==beforeEpoch};
  assert.equal(row.loss,1); assert.equal(row.hit,(flags&255)===0); optionEvidence.push(row);
}
// This is a real poison payload installed by native747. All poison payloads
// flow through the same 654 gate, including Iris's longer-lived payload.
runtime.call(747,0,0,target);
word(health+28,0); // option probes must not pre-coalesce the first poison epoch
const rows=[];
for(let tick=1;tick<=25;tick++) {
  const beforeHealth=view.getFloat32(health+8,true), beforeEpoch=u32(health+28);
  server.advance(50);
  const loss=beforeHealth-view.getFloat32(health+8,true);
  assert.ok(loss>0,`poison tick ${tick} still damages`);
  rows.push({at:tick*50,hit:u32(health+28)!==beforeEpoch});
}
assert.deepEqual(rows.filter(row=>row.hit).map(row=>row.at),[50,650,1250]);
if(process.argv[2]) {
  const actual=JSON.parse(execFileSync(process.argv[2],['--trace'],{encoding:'utf8'}));
  assert.deepEqual(actual,{options:optionEvidence,poison:rows});
}
console.log(JSON.stringify({passed:true,options:optionEvidence,poison:rows,
  originalWasm:createHash('sha256').update(await readFile('web/sp_server.wasm')).digest('hex'),
  scope:'Native43 low-byte notification suppression and native654 600ms poison notification gate; damage continues every tick.'}));
