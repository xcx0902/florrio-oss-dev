import test from 'node:test';
import assert from 'node:assert/strict';
import { PetalTransfers } from '../../public/render/petal-transfers.js';
import { WorldState } from '../../public/state/world.js';
import { CameraState } from '../../public/state/camera.js';

const viewport = { width: 1280, height: 720, level: 1 };
const drop = { handle: 91, typeId: 4, kind: 4, speciesId: 1, byteFields: { 22: 6 },
  x: 100, y: -50, angle: 0, radius: 25, health: 1, maxHealth: 1, flags: 0 };
const receive = [{ opcode: 14, handle: drop.handle, index: 2 }];
function fixture() {
  const world = new WorldState(), camera = new CameraState(), transfers = new PetalTransfers();
  camera.resize(1280, 720, 1); camera.setCamera(0, 0, 0.6);
  world.apply({ sequence: 1, serverTime: 0, entities: [drop], events: [] }, 0);
  return { world, camera, transfers };
}

test('event14 captures the previous pickup before deletion and suppresses its world visual', () => {
  const { world, camera, transfers } = fixture();
  transfers.receive(receive, world, camera, 0, viewport);
  assert.equal(world.count, 1, 'receipt changes presentation ownership, not authoritative state');
  assert.equal([...world.renderable(0)].length, 0);
  world.applyPartial({ sequence: 2, serverTime: 16, entities: [], events: [], deletedHandles: [91] }, 16);
  const inventory = [1, 1, 6, 1, 1];
  const [effect] = transfers.update(16, 16, inventory, undefined, viewport);
  assert.equal(effect.type, 6); assert.equal(effect.index, 2);
  assert.ok(effect.opacity > 0 && effect.opacity < 1);
  assert.equal(effect.phase, 'arriving');
  assert.equal([...world.renderable(16)].length, 0, 'deleted pickup does not fade a second time in world');
  camera.setCamera(1000, 1000, 0.6);
  transfers.receive(receive, world, camera, 16, viewport);
  assert.equal(transfers.update(32, 16, inventory, undefined, viewport).length, 1, 'duplicate receipt cannot overwrite the slot visual');
  for (let now = 48; now <= 3000; now += 16) transfers.update(now, 16, [], undefined, viewport);
  assert.deepEqual(transfers.update(3016, 16, [], undefined, viewport), []);
});

test('event14 ignores unknown handles/types and reset discards previous-game effects', () => {
  const { world, camera, transfers } = fixture();
  transfers.receive([{ opcode: 14, handle: 0, index: 2 }], world, camera, 0, viewport);
  assert.deepEqual(transfers.update(16, 16, [1, 1, 6], undefined, viewport), []);
  transfers.receive(receive, world, camera, 16, viewport);
  assert.equal(transfers.update(32, 16, [1, 1, 6], undefined, viewport).length, 1);
  transfers.reset(); world.reset();
  assert.deepEqual(transfers.update(48, 16, [1, 1, 6], undefined, viewport), []);
});

test('drag takeover removes the pickup overlay and preserves its current position and size', () => {
  const { world, camera, transfers } = fixture();
  transfers.receive(receive, world, camera, 0, viewport);
  const [effect] = transfers.update(16, 16, [1, 1, 6], undefined, viewport);
  const taken = transfers.detachSlot(2);
  assert.equal(taken, effect);
  assert.ok(taken.size > 0 && taken.size < 70);
  assert.deepEqual(transfers.update(32, 16, [1, 1, 6], undefined, viewport), []);
  assert.equal(transfers.detachSlot(2), undefined);
});
