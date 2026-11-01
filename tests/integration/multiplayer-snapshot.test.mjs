import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { decodeMessage,encodeMessage } from '../../build/client/schema/multiplayer.js';
import { NetworkSnapshotDecoder } from '../../build/client/net/multiplayer-snapshot.js';
const directory=await mkdtemp(path.join(os.tmpdir(),'florr-m04-'));
after(()=>rm(directory,{recursive:true,force:true}));
const executable=path.resolve('build/engine/engine_native_replication_fixture');
let cached;
async function fixture() {
  if(cached)return cached;
  const file=path.join(directory,'native.bin');const run=spawnSync(executable,[file],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const bytes=await readFile(file);assert.equal(bytes.subarray(0,4).toString(),'M04F');
  let offset=8;const frames=[];
  for(let i=0;i<bytes.readUInt32LE(4);i++){const n=bytes.readUInt32LE(offset);offset+=4;frames.push(Uint8Array.from(bytes.subarray(offset,offset+n)));offset+=n;}
  assert.equal(offset,bytes.length);assert.equal(frames.length,13);cached=frames;return frames;
}
function nativeDecode(bytes,direction='server') {return spawnSync(executable,['--decode',direction,Buffer.from(bytes).toString('hex')],{encoding:'utf8'});}
test('native and TS agree on independent manual vectors and real full/delta/resync/reconnect bytes',async()=>{
  const {vectors}=JSON.parse(await readFile('tests/fixtures/product/multiplayer/manual_vectors.json','utf8'));
  for(const v of vectors){const result=nativeDecode(Buffer.from(v.hex,'hex'),v.direction);assert.equal(result.status,0,v.name);assert.equal(result.stdout.trim(),v.hex);}
  for(const bytes of await fixture()) {
    const m=decodeMessage(bytes);assert.ok(m);assert.deepEqual(encodeMessage(m),bytes);
    const result=nativeDecode(encodeMessage(m));assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),Buffer.from(bytes).toString('hex'));
  }
});
test('native public entities expose real distinct profiles, owner-local petals and receiver-only selfState',async()=>{
  const frames=await fixture(),a=new NetworkSnapshotDecoder(),b=new NetworkSnapshotDecoder();
  const wa=decodeMessage(frames[0]).value,wb=decodeMessage(frames[1]).value;a.bind(wa);b.bind(wb);
  const sa=a.decode(frames[2]),sb=b.decode(frames[3]);assert.ok(sa&&sb);
  assert.equal(sa.snapshot.selfState.experience,123);assert.equal(sb.snapshot.selfState.experience,456);
  assert.equal(sa.snapshot.selfState.inventory[8],38);assert.equal(sb.snapshot.selfState.inventory[8],2);
  assert.notEqual(sa.snapshot.controlledHandle,sb.snapshot.controlledHandle);
  const player=id=>[...sa.entities.values()].find(e=>e.ownership.ownerPlayerId===id&&e.records.some(r=>r.kind===1));
  assert.ok(player(wa.playerId).records.some(r=>r.stringField4==='Alice'&&r.level===undefined));
  assert.ok(player(wa.playerId).records.some(r=>r.level===5));assert.ok(player(wb.playerId).records.some(r=>r.level===9));
  assert.ok(player(wb.playerId).records.some(r=>r.stringField4==='Bob'));assert.ok(player(wb.playerId).records.some(r=>r.score===5678));
  for(const e of sa.entities.values())for(const record of e.records){
    assert.deepEqual(record.byteArrayField60??[],[]);assert.equal(record.varintFields?.[58],undefined);
    for(const field of [1,5,6,16,20,21,24,32,34,47,56,58,60,61,63]) assert.equal(record.denseFields?.[field],undefined,`private dense ${field}`);
  }
  const petals=[...sa.entities.values()].filter(e=>e.records.some(r=>r.kind===3));
  assert.ok(petals.some(e=>e.ownership.ownerPlayerId===wa.playerId&&e.ownership.slot===0));
  assert.ok(petals.some(e=>e.ownership.ownerPlayerId===wb.playerId&&e.ownership.slot===0));
  assert.ok(a.decode(frames[4]));assert.ok(b.decode(frames[5]));
  assert.equal(decodeMessage(frames[4]).value.lastAppliedInputSeq,1);assert.equal(decodeMessage(frames[5]).value.lastAppliedInputSeq,0);
  const ea=decodeMessage(frames[4]).value.events,eb=decodeMessage(frames[5]).value.events;
  assert.deepEqual(ea,eb);assert.equal(ea.length,2);assert.equal(ea[1].actorPlayerId,wb.playerId);
  assert.ok(a.decode(frames[6]));assert.equal(a.baselineId,2);
  const dead=a.decode(frames[7]);assert.equal(dead.snapshot.selfState.killerName,'Bob');assert.ok(dead.snapshot.selfState.cameraX<0);
  const absent=a.decode(frames[8]);assert.equal(absent.snapshot.controlledHandle,0);assert.equal(absent.snapshot.selfState.killerName,'Bob');assert.equal(absent.snapshot.selfState.cameraX,dead.snapshot.selfState.cameraX);
  const born=a.decode(frames[9]);assert.equal(born.snapshot.selfState.lifeEpoch,2);assert.notEqual(born.snapshot.controlledHandle,sa.snapshot.controlledHandle);
  a.bind(decodeMessage(frames[10]).value);assert.equal(a.decode(frames[9]),null);assert.ok(a.decode(frames[11]));
  const sparse=new NetworkSnapshotDecoder();sparse.bind(wb);assert.ok(sparse.decode(frames[12]));
});
test('native and TS reject damaged real frames and decoder failure leaves the baseline intact',async()=>{
  const frames=await fixture(),good=frames[2],d=new NetworkSnapshotDecoder();d.bind(decodeMessage(frames[0]).value);
  for(const offset of [0,4,6,7,12]){const bytes=good.slice();bytes[offset]=255;assert.equal(decodeMessage(bytes),null);assert.equal(nativeDecode(bytes).status,1);assert.equal(d.decode(bytes),null);assert.equal(d.snapshotSeq,0);}
  for(const n of [0,15,16,57,good.length-1]){const bytes=good.slice(0,n);assert.equal(decodeMessage(bytes),null);assert.equal(nativeDecode(bytes).status,1);}
  const m=decodeMessage(good),entity=m.value.entities[0];
  // Corrupt the first entity's private component mask inside an otherwise valid envelope.
  const original=entity.fields.slice(),malicious=entity.fields.slice();malicious[11]|=32;entity.fields=malicious;
  assert.throws(()=>encodeMessage(m));entity.fields=original;
  // Repair the envelope byte count after adding an impossible entity-array count.
  const oversized=good.slice();oversized[58]=255;oversized[59]=255;oversized[60]=127;
  assert.equal(decodeMessage(oversized),null);assert.equal(nativeDecode(oversized).status,1);
  assert.ok(d.decode(good));const count=d.entities.size;assert.equal(d.decode(frames[4].slice(0,-1)),null);assert.equal(d.entities.size,count);assert.equal(d.snapshotSeq,1);assert.ok(d.decode(frames[4]));
});
