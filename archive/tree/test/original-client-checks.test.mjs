import test from 'node:test';
import assert from 'node:assert/strict';
import { originalClientChecks } from '../tools/parity/original-client-checks.mjs';

const alive = handle => ({ worldReady: true, controllerCount: 1, controller: { scale: 0.9 },
  arenaWidth: 50000, arenaHeight: 4000, controlledBodyValid: true, controlLinkValid: true,
  mainWorldAlpha: 1, binding: 'bound', sequence: 128, activeCount: 10,
  player: { handle, x: 10, y: 20, health: 100, maxHealth: 100, petalDistance: 60 } });
function fixture() {
  const before = alive(16387), after = alive(32771);
  const moved = structuredClone(before); moved.player.x += 30;
  const attack = structuredClone(moved); attack.inputButtons = 1; attack.player.petalDistance = 100;
  const defend = structuredClone(moved); defend.inputButtons = 2; defend.player.petalDistance = 20;
  const dead = { ...before, binding: 'unbound', controlledBodyValid: false, player: null };
  const corpse = structuredClone(before); corpse.player.health = 0; corpse.player.visualFlags = 1;
  return { scenario: 'death', samples: [before, moved, attack, defend, dead, after],
    lifecycle: { beforeMove: before, afterMove: moved, attacking: attack, defending: defend,
      beforeDeath: before, corpse, dead, restarted: after },
    worker: { errors: [], dataPackets: 8, sent: { sp_server_send: 12 } },
    decode: { ok: true, sequence: 1 }, probe: { found: true }, consoleErrors: [],
    canvas: { gamePaint: { state: before, frame: 8, time: 128, stateFrame: 8, stateTime: 128,
      ops: 100, paintOps: 20, digest: 'frame' } } };
}

test('original-client lifecycle rejects protocol-only greens and each unobserved interaction', () => {
  const record = fixture();
  assert.equal(Object.values(originalClientChecks(record)).every(Boolean), true);
  for (const [key, patch] of [
    ['worldMetadata', r => r.samples.forEach(s => { s.worldReady = false; })],
    ['localController', r => r.samples.forEach(s => { s.controllerCount = 872; })],
    ['gameRendered', r => { r.canvas.gamePaint.paintOps = 0; }],
    ['gameRendered', r => { r.canvas.gamePaint.ops = 0; }],
    ['gameRendered', r => { r.canvas.gamePaint.state.mainWorldAlpha = 0; }],
    ['gameRendered', r => { r.canvas.gamePaint.stateFrame++; }],
    ['gameRendered', r => { r.canvas.gamePaint.stateTime++; }],
    ['gameRendered', r => { delete r.canvas.gamePaint.frame; }],
    ['validBindings', r => { r.samples[4].binding = 'invalid'; }],
    ['lifecycleMovement', r => { r.lifecycle.afterMove = r.lifecycle.beforeMove; }],
    ['lifecycleAttack', r => { r.lifecycle.attacking.inputButtons = 0; }],
    ['lifecycleDefend', r => { r.lifecycle.defending.inputButtons = 0; }],
    ['lifecycleAttack', r => { r.lifecycle.attacking.player.petalDistance = 60; }],
    ['lifecycleDefend', r => { r.lifecycle.defending.player.petalDistance = 60; }],
    ['deathObserved', r => { r.lifecycle.dead = r.lifecycle.beforeDeath; }],
    ['deathObserved', r => { r.lifecycle.dead.binding = 'invalid'; }],
    ['deathObserved', r => { r.lifecycle.corpse.player.visualFlags = 0; }],
    ['restartObserved', r => { r.lifecycle.restarted = r.lifecycle.beforeDeath; }],
    ['sequenceBoundary', r => r.samples.forEach(s => { s.sequence = 127; })],
  ]) {
    const copy = structuredClone(record); patch(copy);
    assert.equal(originalClientChecks(copy)[key], false, key);
  }
});
