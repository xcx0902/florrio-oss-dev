import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeMessage, encodeMessage, CATALOG_HASH, LIMITS } from '../../../build/client/schema/multiplayer.js';
import { frame, WireReader } from '../../../build/client/net/multiplayer-wire.js';
import { NetworkSnapshotDecoder } from '../../../build/client/net/multiplayer-snapshot.js';

const welcome={roomId:'a',roomEpoch:Uint8Array.of(1,...Array(15).fill(0)),playerId:1,sessionEpoch:7,tickMs:50,serverTick:0,resumeToken:new Uint8Array(32)};
function snapshot(overrides={}) {
  return {roomEpoch:welcome.roomEpoch,full:true,snapshotSeq:1,baselineId:1,serverTick:1,lastAppliedInputSeq:0,inputAppliedTick:0,controlledHandle:0,removed:[],entities:[],events:[],selfState:{lifeEpoch:0,life:0,velocityX:0,velocityY:0,speed:0,buttons:0,angle:0,strength:0,inputNeutral:true,inputExpiresTick:0,nextSpawnTick:0,level:0,experience:0,score:0,zoneProgress:0,inventory:Array(16).fill(0),recharge:Array(8).fill(0),backpack:[],deathScore:0,deathLevel:0,kept:[],killerName:'',cameraX:0,cameraY:0,cameraScale:0.9},...overrides};
}
const packet=(s,epoch=7)=>encodeMessage({type:6,sessionEpoch:epoch,value:s});

test('v2 hand-authored vectors decode and encode exact independent bytes',async()=>{
  const {vectors}=JSON.parse(await readFile(new URL('../../../tests/fixtures/product/multiplayer/manual_vectors.json',import.meta.url)));
  for(const v of vectors) {
    const bytes=Uint8Array.from(Buffer.from(v.hex,'hex'));
    const actual=decodeMessage(bytes,v.direction==='client');
    assert.deepEqual(actual,{type:v.type,sessionEpoch:v.sessionEpoch,value:v.value},v.name);
    assert.deepEqual(encodeMessage(actual),bytes,v.name);
  }
});
test('Hello validates catalog syntax, room names, Unicode scalar counts and nickname normalization',()=>{
  const hello={protocolVersion:2,catalogHash:CATALOG_HASH,roomId:'room_1-A',nickname:'  玩家😀  '};
  const encode=v=>encodeMessage({type:1,sessionEpoch:0,value:v});
  assert.equal(decodeMessage(encode(hello),true).value.nickname,'玩家😀');
  for(const nickname of ['','  ','a\nb','\ud800','😀'.repeat(33),'x'.repeat(33)]) assert.throws(()=>encode({...hello,nickname}));
  assert.throws(()=>encode({...hello,roomId:'../a'}));
  assert.throws(()=>encode({...hello,catalogHash:'x'.repeat(64)}));
  assert.equal(decodeMessage(encode(hello)),null);
  assert.equal(decodeMessage(Uint8Array.of(1,1,0,0,0,0),true),null,'Worker v1 cannot be guessed as v2');
});
test('v2 rejects malformed UTF-8, control bytes, overlong/overflow varints, bools, numbers and lengths',()=>{
  for(const payload of [
    [1,3,0xed,0xa0,0x80,1], [1,2,0xc0,0xaf,1], [1,1,10,1],
    [1,0x82,0,104,105,1], [1,0xff,0xff,0xff,0xff,0x1f,1], [1,0,2],
  ]) assert.equal(decodeMessage(frame(10,0,Uint8Array.from(payload),4096)),null);
  const input={type:3,sessionEpoch:7,value:{inputSeq:1,lifeEpoch:1,targetTick:0,buttons:0,angle:0,strength:200}};
  for(const [key,value] of [['inputSeq',0],['angle',NaN],['angle',Infinity],['strength',201],['buttons',4]]) assert.throws(()=>encodeMessage({...input,value:{...input.value,[key]:value}}));
  const good=packet(snapshot());
  for(let i=0;i<good.length;i++) assert.equal(decodeMessage(good.subarray(0,i)),null,`truncate ${i}`);
  for(const offset of [0,4,6,7,12]) { const bad=good.slice();bad[offset]=255;assert.equal(decodeMessage(bad),null); }
  assert.equal(decodeMessage(new Uint8Array(LIMITS.maxServerFrameBytes+1)),null);
  assert.throws(()=>new WireReader(Uint8Array.from([255,127])).length(0,16,true));
  assert.throws(()=>packet(snapshot({events:Array(LIMITS.maxSnapshotEvents+1).fill({})})));
  assert.throws(()=>packet(snapshot({selfState:{...snapshot().selfState,inventory:[]}})));
});
test('full/delta binding, gaps and errors commit atomically; resync deduplicates events',()=>{
  const d=new NetworkSnapshotDecoder();d.bind(welcome);
  assert.equal(d.decode(packet(snapshot({full:false}))),null);
  const event={tick:1,ordinal:1,kind:3,target:0,actorPlayerId:1,actorHandle:0,amount:0,slot:0,text:'hello'};
  assert.equal(d.decode(packet(snapshot({events:[event]}))).events.length,1);
  assert.equal(d.decode(packet(snapshot({full:false,snapshotSeq:3}))),null,'gap');
  assert.equal(d.snapshotSeq,1);
  assert.equal(d.decode(packet(snapshot({full:false,snapshotSeq:2,baselineId:2}))),null);
  assert.equal(d.decode(packet(snapshot({full:false,snapshotSeq:2}),8)),null);
  assert.throws(()=>packet(snapshot({full:false,snapshotSeq:2,roomEpoch:new Uint8Array(16)})));
  assert.equal(d.decode(packet(snapshot({full:true,snapshotSeq:3,baselineId:2,events:[event]}))).events.length,0);
  assert.equal(d.decode(packet(snapshot({full:false,snapshotSeq:4,baselineId:2,controlledHandle:99}))),null);
  assert.equal(d.snapshotSeq,3);
  assert.ok(d.decode(packet(snapshot({full:false,snapshotSeq:4,baselineId:2}))));
  d.bind({...welcome,sessionEpoch:8});assert.equal(d.entities.size,0);
  assert.equal(d.decode(packet(snapshot())),null);
  assert.ok(d.decode(packet(snapshot(),8)));
  assert.equal(d.decode(packet(snapshot({snapshotSeq:LIMITS.counterDrainAt,baselineId:2}),8)),null);
});
