/** All configured petal types through the actual combined world simulation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServerWorld} from './helpers/server-world.mjs';
const sha=memory=>createHash('sha256').update(new Uint8Array(memory.buffer)).digest('hex');

test('all38 petal types preserve complete world memory, output and real idle/attack/defend transitions',async()=>{
  const original=await createServerWorld(false,{functionIds:[125,213,397]}),recovered=await createServerWorld(true);
  const capture=JSON.parse(await fs.readFile(new URL('../reports/runtime/client-packet-traces.json',import.meta.url),'utf8'));
  for(const packet of capture.packets.filter(p=>p.direction==='toWorker'&&['startup','spawn'].includes(p.stage))){
    original.send(Uint8Array.from(packet.bytes));recovered.send(Uint8Array.from(packet.bytes));original.advance();recovered.advance();
  }
  const baselineOriginal=original.capture(),baselineRecovered=recovered.capture(),states=[];
  const view=world=>new DataView(world.runtime.memory.buffer);
  const u32=(world,a)=>view(world).getUint32(a,true);
  const currentPlayer=world=>u32(world,u32(world,24936)+120);
  const body=world=>u32(world,currentPlayer(world)+100);
  const loadout=world=>u32(world,body(world)+200);
  function compare(type,stage){
    const expected=sha(original.runtime.memory),actual=sha(recovered.runtime.memory);
    if(expected!==actual){const a=new Uint8Array(original.runtime.memory.buffer),b=new Uint8Array(recovered.runtime.memory.buffer),diff=[];for(let at=0;at<a.length&&diff.length<24;at++)if(a[at]!==b[at])diff.push({at,original:a[at],recovered:b[at]});assert.equal(actual,expected,`type${type} ${stage}: ${JSON.stringify(diff)}`);}
    assert.equal(recovered.runtime.stackPointer.value,original.runtime.stackPointer.value,`type${type} ${stage}: stack`);
    assert.deepEqual(recovered.outgoing,original.outgoing,`type${type} ${stage}: output`);
    states.push({type,stage,originalMemorySha256:expected,recoveredMemorySha256:actual,outputCount:recovered.outgoing.length});
  }
  for(let type=1;type<=38;type++){
    original.restore(baselineOriginal);recovered.restore(baselineRecovered);
    for(const world of[original,recovered]){
      world.runtime.call(125,loadout(world),0,type);
      for(let instance=0;instance<3;instance++)world.runtime.call(397,loadout(world),0,instance);
    }
    compare(type,'equipped');
    for(const [mask,milliseconds]of[[0,100],[1,600],[2,3000],[3,50]]){
      for(const world of[original,recovered]){
        const player=currentPlayer(world);view(world).setUint32(player+276,mask,true);view(world).setFloat32(player+280,0.6,true);view(world).setFloat32(player+284,0,true);
        // The protocol writes both controller flags and the tracked petal
        // input field. Updating the controller alone does not trigger petals.
        const input=loadout(world)+10,scratch=world.runtime.call(16,4);
        for(const bit of[1,2]){
          const before=view(world).getUint8(input),next=(mask&bit)?before|bit:before&~bit;
          view(world).setUint32(scratch,next,true);world.runtime.call(213,input,scratch);
        }
        world.runtime.call(14,scratch);
        world.advance(milliseconds);
      }
      compare(type,`input${mask} after${milliseconds}ms`);
    }
    for(const world of[original,recovered]){world.runtime.call(125,loadout(world),0,0);world.advance();}
    compare(type,'removed and cleaned');
  }
  // Each type has one equip and one remove call: 38 * 2 explicit mutations.
  assert.ok(recovered.runtime.calls[125]>=76,'actual high-level slot changes ran');
  assert.ok(recovered.runtime.calls[397]>=114,'actual high-level creation ran');
  assert.ok(recovered.runtime.calls[431]>0&&recovered.runtime.calls[676]>0&&recovered.runtime.calls[681]>0,'all three Peas methods ran in the real tick');
  assert.ok(recovered.runtime.calls[272]>0&&recovered.runtime.calls[277]>0,'Peas actually split and executed deferred launch callbacks');
  assert.ok(recovered.runtime.calls[693]>0&&recovered.runtime.calls[719]>0,'both Egg methods ran in the real tick');
  await fs.writeFile(new URL('../reports/server-petal-world.json',import.meta.url),JSON.stringify({
    coverage:'Bounded real-player scenario for all38 configured petal types and four input masks; no exhaustive equivalence claim.',
    types:38,snapshots:states.length,calls:recovered.runtime.calls,states,
  },null,2)+'\n');
});
