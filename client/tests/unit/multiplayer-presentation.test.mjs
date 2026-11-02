import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldState } from '../../../build/client/state/world.js';
import { CameraState } from '../../../build/client/state/camera.js';
import { GameSession } from '../../../build/client/app/game-session.js';
import { drawWorld } from '../../../build/client/render/world.js';
import { RenderResources, withRenderResources } from '../../../build/client/render/resources.js';
import { flowerEntries } from '../../../build/client/render/hud/scoreboard.js';
import { createHudState } from '../../../build/client/render/hud/state.js';
import { RenderingCanvas } from '../helpers/recording-canvas.mjs';
import { welcome, snapshot, selfState } from '../support/multiplayer.mjs';

const player = (buttons = 0, effects = 0) => ({ handle: 20, ownerPlayerId: 2, typeId: 1, kind: 1,
  speciesId: 0, x: 0, y: 0, angle: 0, radius: 25, health: 100, maxHealth: 100,
  healthKnown: true, maxHealthKnown: true, flags: 1, byteFields: { 31: buttons, 14: effects } });
function scene(entities) {
  const world = new WorldState(), camera = new CameraState(), resources = new RenderResources();
  world.setControlledPlayer(2,20);
  world.applyFullSnapshot({ sequence: 1, serverTime: 0, entities, events: [] }, 100);
  const draw = now => withRenderResources(resources, () => {
    const context = new RenderingCanvas(); drawWorld(context, world, camera, now); return context;
  });
  return { world, draw };
}
const bodyPaint = context => context.paints.find(p => p.op === 'fill'
  && p.path.some(([op, x, y, radius]) => op === 'arc' && x === 0 && y === 0 && radius === 25));

test('online attack/defend expression bits keep the yellow face across consecutive frames', () => {
  for (const buttons of [0,1,2,3]) {
    const { draw } = scene([player(buttons)]);
    for (const now of [100,116,150,250,600,1600])
      assert.deepEqual(bodyPaint(draw(now)).fill,[255,231,99],`buttons=${buttons}, now=${now}`);
  }
});
test('native effect flags and hit flash remain independent from attack/defend buttons', () => {
  const special = scene([player(0,1)]), attacking = scene([player(3,1)]);
  for (const now of [100,150,600]) assert.deepEqual(bodyPaint(special.draw(now)).fill,bodyPaint(attacking.draw(now)).fill);
  assert.notDeepEqual(bodyPaint(special.draw(700)).fill,[255,231,99]);
  const hit = scene([player(3)]);
  hit.world.applyDeltaSnapshot({ sequence: 2, serverTime: 50, entities: [], events: [{ opcode: 11, handle: 20 }] }, 120);
  assert.notDeepEqual(bodyPaint(hit.draw(125)).fill,[255,231,99]);
  assert.deepEqual(bodyPaint(hit.draw(1600)).fill,[255,231,99]);
});
const drop = flags => ({ handle: 30, typeId: 7, speciesId: 7, kind: 4, flags,
  x: 150, y: 0, angle: 0, radius: 14, health: 0, maxHealth: 0, byteFields: { 22: 7 } });
const rim = context => context.paints.find(p => p.op === 'stroke' && p.path[0]?.[0] === 'rect' && p.path[0][1] === -36);
const angle = paint => Math.atan2(paint.matrix[1],paint.matrix[0]);
test('creation-marked drops grow and rotate; existing drops keep their settled angle', () => {
  const born = scene([player(),drop(129)]), old = scene([player(),drop(1)]);
  const first = rim(born.draw(100)), second = rim(born.draw(150));
  assert.ok(Math.abs(angle(second)-angle(first)) > .1,'birth spin changes the actual card matrix');
  assert.ok(Math.hypot(...second.matrix.slice(0,2)) > Math.hypot(...first.matrix.slice(0,2)),'birth grows the card');
  const settled = [100,150,2000].map(now => angle(rim(old.draw(now))));
  assert.ok(settled.every(value => Math.abs(value-settled[0]) < 1e-6),'the original idle effect pulses without a continuous spin');
});

function sessionHarness() {
  const listeners = {}, world = new WorldState(), noop = () => {};
  const app = { online: true, world, disposed: false, transitions: {}, camera: new CameraState(),
    transport: { state: 'connected', onControl: fn => listeners.control=fn,
      onSnapshot: fn => listeners.snapshot=fn, onClose: fn => listeners.close=fn },
    renderer: { petalMotion: { reset: noop }, petalTransfers: { reset: noop, receive: noop },
      playerTransform: { invalidate: noop }, movementHelper: { reset: noop } },
    loadout: {}, input: { pointer: { reset: noop }, keyboard: { clearPressed: noop } } };
  const session = new GameSession(app);
  listeners.control({ type: 2, sessionEpoch: 7, value: welcome });
  function receive(overrides = {}, health = 100) {
    const record = { ...player(), health }, ownership = { handle: 20, ownerPlayerId: 2, ownerHandle: 20, slot: 0, instance: 0 };
    const s = snapshot({ controlledHandle: 20, selfState: selfState({ life: 1, lifeEpoch: 1 }), ...overrides });
    listeners.snapshot({ kind: 'network', value: { snapshot: s,
      entities: new Map([[20,{ ownership, records: [record] }]]), events: [] } });
  }
  return { session, world, listeners, receive };
}
test('first healthy network receipt retains the last menu pass for the entry animation', () => {
  const h = sessionHarness(); h.session.enterJoining(); h.receive();
  assert.equal(h.session.phase,'joining','packet receipt must not skip the menu capture');
  const first = h.session.prepareFrame(100,16);
  assert.equal(first.menuFrame,true); assert.equal(first.player.entity.handle,20); assert.equal(h.session.phase,'playing');
  assert.equal(h.session.prepareFrame(116,16).menuFrame,false,'one final menu frame only');
  h.receive({ full: true, snapshotSeq: 2, baselineId: 2 });
  assert.equal(h.session.prepareFrame(132,16).menuFrame,false,'resync must not replay the entry animation');
  h.session.enterJoining(); h.receive({ full: false, snapshotSeq: 3, selfState: selfState({ life: 1, lifeEpoch: 2 }) });
  assert.equal(h.session.prepareFrame(150,16).menuFrame,true,'respawn also owns its entry pass');
});
test('delayed snapshots of the dead life preserve a pending respawn entry', () => {
  const h = sessionHarness(); h.session.enterJoining(); h.receive(); h.session.prepareFrame(100,16);
  const dead = { life: 3, lifeEpoch: 1, deathLevel: 1, killerName: 'Alice' };
  h.receive({ full: false, snapshotSeq: 2, selfState: selfState(dead) },0);
  assert.equal(h.session.dead,true,'authoritative death takes effect immediately during play');
  h.session.enterJoining();
  for (const snapshotSeq of [3,4,5]) {
    h.receive({ full: false, snapshotSeq, selfState: selfState(dead) },0);
    assert.equal(h.session.phase,'joining','old death cannot cancel the pending join');
    const frame = h.session.prepareFrame(snapshotSeq * 50,16);
    assert.equal(frame.menuFrame,true); assert.equal(frame.player,null);
  }
  h.receive({ full: false, snapshotSeq: 6, selfState: selfState({ life: 1, lifeEpoch: 2 }) });
  const entry = h.session.prepareFrame(300,16);
  assert.equal(entry.menuFrame,true); assert.equal(entry.player.entity.handle,20);
  assert.equal(h.session.phase,'playing'); assert.equal(h.session.prepareFrame(316,16).menuFrame,false);
});
test('room-wide roster survives AOI absence, sorts real scores and highlights only the controlled player', () => {
  const h = sessionHarness(); h.receive();
  const roster = { roomEpoch: welcome.roomEpoch, serverTick: 2, entries: [
    { playerId: 2, nickname: 'Bob', score: 10 }, { playerId: 1, nickname: 'Alice', score: 30 } ] };
  h.listeners.control({ type: 12, sessionEpoch: 7, value: roster });
  assert.equal([...h.world.entitiesOfKind(1)].length,1,'Alice is outside the entity table');
  const entries = flowerEntries({ flowerEntries: h.world.leaderboard.map(e => ({ name: e.nickname, score: e.score,
    local: e.playerId === h.world.controlledPlayerId })) });
  assert.deepEqual(entries,[{name:'Alice',score:30,local:false},{name:'Bob',score:10,local:true}]);
  const hud = createHudState().update({ health:100,maxHealth:100,level:1,flowerEntries:entries,flowers:2 },100,16);
  assert.equal(hud.flowerEntries.length,2); assert.equal(hud.flowers,2);
  h.listeners.control({ type:12,sessionEpoch:7,value:{...roster,serverTick:1,entries:[]} });
  assert.equal(h.world.leaderboard.length,2,'old ticks cannot clear current rows');
  h.listeners.control({ type:12,sessionEpoch:7,value:{...roster,roomEpoch:new Uint8Array(16).fill(9),serverTick:3,entries:[]} });
  assert.equal(h.world.leaderboard.length,2,'other rooms cannot change the roster');
  h.listeners.control({ type:12,sessionEpoch:7,value:{...roster,serverTick:3,entries:[roster.entries[0]]} });
  assert.equal(h.world.leaderboard.length,1,'departures replace the list');
  h.receive({ snapshotSeq:2,baselineId:2 }); assert.equal(h.world.leaderboard,undefined,'full rebind clears old rows');
  h.world.reset(); assert.equal(h.world.leaderboard,undefined);
});
