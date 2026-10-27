#!/usr/bin/env node
/** Read-only original-server probes: extra exports, no replaced instructions. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServerWorld } from '../../../test/helpers/server-world.mjs';

const server = await createServerWorld(false, { functionIds: [43, 73, 85, 125, 144, 145, 168, 197, 390, 397] });
const golden = JSON.parse(await readFile('tests/parity/golden/attack/server.json', 'utf8'));
for (const event of golden.messages.filter(e => e.funcName === 'sp_server_send' && e.dataHex).slice(0, 2))
  server.send(Buffer.from(event.dataHex, 'hex'));
const view = new DataView(server.runtime.memory.buffer);
const u32 = a => view.getUint32(a, true), f32 = a => view.getFloat32(a, true);
const word = (a, v) => view.setUint32(a, v, true);
const byte = (a, v) => view.setUint8(a, v);
const float = (a, v) => view.setFloat32(a, v, true);
const entity = u32(u32(u32(24936) + 120) + 100);
const loadout = u32(entity + 200), health = u32(entity + 164);
const initial = server.capture();
const output = { originalWasm: createHash('sha256').update(await readFile('web/sp_server.wasm')).digest('hex'), passives: [] };
assert.equal(output.originalWasm, '75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d');
function equip(types) {
  server.restore(initial);
  for (let slot = 0; slot < 8; slot++) server.runtime.call(125, loadout, slot, types[slot] ?? 0);
  for (let slot = 0; slot < types.length; slot++)
    for (let instance = 0; instance < 3; instance++) server.runtime.call(397, loadout, slot, instance);
  float(health + 8, 50); float(health + 12, 100); float(loadout + 284, 0);
}
for (const types of [[1], [2], [14], [14,14], [26], [26,26], [14,26], [32], [32,32], [13], [21], [33], [13,21,33]]) {
  equip(types);
  server.runtime.call(145, loadout);
  const before = { health: f32(health+8), maximum: f32(health+12), phase: f32(loadout+284) };
  server.advance();
  output.passives.push({ types, before, after: { health: f32(health+8), maximum: f32(health+12), phase: f32(loadout+284) } });
}
for (const sample of output.passives) {
  const faster = sample.types.filter(t => t === 14).length;
  const leaves = sample.types.filter(t => t === 32).length;
  const maximum = 100 + sample.types.reduce((sum,t) => sum+(t===13||t===21?20:t===33?40:0),0);
  assert.equal(sample.before.maximum, maximum);
  assert.equal(sample.after.maximum, maximum);
  assert.equal(sample.after.phase, Math.fround((2.5 + 0.8*faster)*50*0.001));
  const rescaled = Math.fround(Math.fround(maximum*sample.before.health)/maximum);
  assert.equal(sample.after.health, Math.fround(rescaled + Math.fround(50*maximum/240000 + 50*leaves*0.001)));
}
output.pending = [];
for (const type of [14,32,13,21,33]) {
  equip([type]); byte(loadout+584,1);
  server.runtime.call(145,loadout);
  server.advance();
  const sample = {type,health:f32(health+8),maximum:f32(health+12),phase:f32(loadout+284)};
  assert.deepEqual(sample,{type,health:50.02083206176758,maximum:100,phase:0.125});
  output.pending.push(sample);
}
output.eggs = [];
for (const [type, delay] of [[22,1000],[23,2500]]) {
  equip([type]);
  const egg = u32(loadout+296);
  const series = [];
  const read = () => {
    const slot = u32(loadout+296), hp = slot ? u32(slot+164) : 0, ai = slot ? u32(slot+104) : 0;
    return { slot, egg: slot === egg, health: hp ? f32(hp+8) : null,
      pending: view.getUint8(loadout+584), timer: f32(loadout+608),
      owner: slot ? u32(slot+236) : 0, parent: slot ? u32(slot+224) : 0,
      aggressive: ai ? view.getUint8(ai+108) : null,
      radius: ai ? f32(ai+120) : null, guard: ai ? f32(ai+136) : null, leash: ai ? f32(ai+140) : null };
  };
  series.push({elapsed:0,...read()});
  server.advance(delay);
  series.push({elapsed:delay,...read()});
  server.advance(1);
  series.push({elapsed:delay+1,...read()});
  const pet = u32(loadout+296), ai = u32(pet+104), pos = u32(pet+168);
  // A real wild soldier at a controlled point, and an independent sibling pet.
  const x = view.getFloat64(pos+88,true), y = view.getFloat64(pos+96,true);
  const wild = server.runtime.call(144, 22928+1936, 9, x+100, y, -1);
  const sibling = server.runtime.call(144, 22928+1936, 9, x+120, y, -1);
  server.runtime.call(73, sibling, entity);
  const eligibility = {
    petToWild: server.runtime.call(168,ai,wild),
    petToOwner: server.runtime.call(168,ai,entity),
    petToSibling: server.runtime.call(168,ai,sibling),
    wildToPet: server.runtime.call(168,u32(wild+104),pet),
    wildToWild: server.runtime.call(168,u32(wild+104),server.runtime.call(144,22928+1936,9,x+130,y,-1)),
    wildParent: u32(wild+224), wildOwner: u32(wild+236), petParent:u32(pet+224),petOwner:u32(pet+236),
  };
  function root(actor) {
    for (let limit = 0; limit < 32; limit++) {
      const flags = view.getUint8(actor+93), owner = flags&64 ? u32(actor+236) : 0;
      const parent = flags&64 ? u32(actor+224) : 0;
      if (!(owner||parent)) return actor;
      actor = owner||parent;
    }
    throw new Error('cyclic original ownership');
  }
  const beforeContact = server.capture();
  const collision = server.runtime.call(16,16), flag = collision+8;
  byte(flag,+(root(pet)===root(wild))); word(collision,flag);
  const healthBefore = f32(u32(pet+164)+8);
  const contactDamage = f32(u32(wild+188)+44);
  server.runtime.call(390,collision,pet,wild,0,0,0,0);
  const contact = {healthBefore,contactDamage,healthAfter:f32(u32(pet+164)+8),sameRoot:root(pet)===root(wild)};
  assert.equal(contact.sameRoot,false);
  assert.equal(contact.healthAfter,Math.fround(healthBefore-contactDamage),'pet/wild contact damages pet');
  server.restore(beforeContact);
  // Disable acquisition, force a guard arrival at the pet's current location.
  byte(ai+108,0); byte(ai+184,1); float(ai+176,x); float(ai+180,y);
  server.advance();
  const guardArrival = view.getUint8(ai+184);
  server.advance(1100);
  series.push({elapsed:delay+1151,...read()});
  const scratch = server.runtime.call(16,4); view.setUint16(scratch,1,true);
  server.runtime.call(43,u32(pet+164),0,f32(u32(pet+164)+8),scratch);
  series.push({stage:'pet defeated',...read()});
  server.advance();
  series.push({stage:'first recharge tick',...read()});
  assert.equal(series[1].slot,egg,'strict hatch deadline');
  assert.notEqual(pet,egg,'post-deadline hatch');
  assert.equal(series[2].owner,entity);
  assert.equal(series[2].guard,300);
  assert.equal(series[2].radius,1000);
  assert.equal(series[2].leash,1000);
  assert.equal(eligibility.petToWild,1);
  assert.equal(eligibility.petToOwner,0);
  assert.equal(eligibility.petToSibling,0);
  assert.equal(eligibility.wildToWild,0);
  assert.equal(guardArrival,0,'arrived guard state clears');
  assert.equal(series[3].slot,pet,'living pet keeps slot after recharge duration');
  assert.equal(series[3].timer,0,'living pet does not charge the Egg');
  assert.equal(series.at(-1).slot,0,'dead pet releases the slot in the next sweep');
  assert.equal(series.at(-1).timer,50,'recharge begins counting after pet death');
  output.eggs.push({type,delay,egg,pet,eligibility,contact,guardArrival,series});
}
output.zoneDisabledPets = [];
for (const [type,delay] of [[22,1000],[23,2500]]) {
  equip([type]);
  server.advance(delay+1);
  const pet = u32(loadout+296), petHealth = u32(pet+164);
  const healthBefore = f32(petHealth+8);
  const cachedProgressBefore = view.getUint16(loadout+100,true);
  byte(loadout+148,60);
  float(loadout+288,45000);
  const position = u32(entity+168), playerX = view.getFloat64(position+88,true);
  server.advance();
  const sample = {type,pet,playerX,healthBefore,healthAfter:f32(petHealth+8),
    slot:u32(loadout+296),elapsedRecharge:f32(loadout+608),zoneTimer:f32(loadout+288),
    cachedProgressBefore,cachedProgress:view.getUint16(loadout+100,true)};
  assert.ok(healthBefore>0,'zone fixture starts with a living pet');
  assert.equal(sample.healthAfter,0,'capped zone kills the equipped pet');
  assert.equal(sample.slot,0,'zone sweep releases the pet handle');
  assert.equal(sample.elapsedRecharge,50,'zone tick starts recharge after releasing the pet');
  assert.equal(sample.zoneTimer,45000,'zone timer remains capped');
  assert.equal(sample.cachedProgressBefore,65535,'living equipped pet starts ready');
  assert.equal(sample.cachedProgress,0,'disabled-zone cache publishes zero');
  const firstDisabled = server.capture();
  for (let index=0; index<19; index++) server.advance();
  sample.afterRecharge = {slot:u32(loadout+296),elapsedRecharge:f32(loadout+608),
    cachedProgress:view.getUint16(loadout+100,true)};
  assert.equal(sample.afterRecharge.slot,0,'disabled slot never spawns another Egg');
  assert.equal(sample.afterRecharge.elapsedRecharge,1000,'recharge continues while disabled');
  assert.equal(sample.afterRecharge.cachedProgress,0,'charged disabled slot still publishes zero');
  float(position+20,24000); byte(position+80,0);
  server.advance();
  sample.reenabledCharged = {slot:u32(loadout+296),cachedProgress:view.getUint16(loadout+100,true)};
  assert.notEqual(sample.reenabledCharged.slot,0,'charged Egg spawns after re-enabling');
  assert.equal(sample.reenabledCharged.cachedProgress,65535,'charged slot restores ready cache');
  server.restore(firstDisabled);
  float(position+20,24000); byte(position+80,0);
  server.advance();
  sample.reenabledPartial = {slot:u32(loadout+296),elapsedRecharge:f32(loadout+608),
    cachedProgress:view.getUint16(loadout+100,true)};
  assert.deepEqual(sample.reenabledPartial,{slot:0,elapsedRecharge:100,cachedProgress:6553},
    're-enabling an incomplete recharge publishes its actual progress');
  output.zoneDisabledPets.push(sample);
}
output.discardedPets = [];
for (const [type,delay] of [[22,1000],[23,2500]]) {
  equip([type]);
  server.advance(delay+1);
  const pet = u32(loadout+296), petHealth = u32(pet+164);
  const healthBefore = f32(petHealth+8);
  const discard = expected => {
    const packet = Buffer.from([0,8,0,expected]);
    for (let index=0; index<packet.length; index++) packet[index]^=view.getUint8(4576+index);
    server.send(packet);
  };
  discard(1);
  assert.equal(u32(loadout+296),pet,'mismatched opcode8 keeps equipped pet');
  assert.equal(f32(petHealth+8),healthBefore,'mismatched opcode8 does not damage pet');
  discard(type);
  const sample = {type,pet,healthBefore,healthAfterDiscard:f32(petHealth+8),
    slot:u32(loadout+296),slotType:view.getUint8(loadout+20),
    backpackCount:view.getUint8(loadout+704),backpackType:view.getUint8(loadout+705)};
  assert.equal(sample.healthAfterDiscard,0,'opcode8 damages the hatchling before unlinking its slot');
  assert.equal(sample.slot,0,'opcode8 releases the equipped handle');
  assert.equal(sample.slotType,0,'opcode8 clears the carried type');
  assert.equal(sample.backpackCount,1,'opcode8 appends one backpack item');
  assert.equal(sample.backpackType,type,'discarded Egg, not hatchling species, enters backpack');
  const scratch = server.runtime.call(16,4); view.setUint16(scratch,1,true);
  server.runtime.call(43,health,0,f32(health+8),scratch);
  sample.afterOwnerDeath = {ownerHealth:f32(health+8),petHealth:f32(petHealth+8)};
  assert.deepEqual(sample.afterOwnerDeath,{ownerHealth:0,petHealth:0});
  output.discardedPets.push(sample);
}
output.passed = true;
console.log(JSON.stringify(output, null, 2));
