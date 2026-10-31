import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldState } from '../../../build/client/state/world.js';
import { hotbarRects, getHudLayout } from '../../../build/client/ui/layout/hud.js';
import { inventoryLayout } from '../../../build/client/ui/layout/inventory.js';
import { deathCardRects } from '../../../build/client/ui/layout/death.js';
import { contains } from '../../../build/client/ui/layout/rect.js';
import { hotbarSlotAt, inventorySlotAt } from '../../../build/client/render/ui.js';
import { RenderResources, withRenderResources, renderResources } from '../../../build/client/render/resources.js';
import { ServerWorkerClient } from '../../../build/client/net/worker.js';
const entity = (handle, kind, health = 10) => ({ handle, typeId: kind, kind, health, maxHealth: 10, x: 0, y: 0, angle: 0, flags: 0 });
const snapshot = entities => ({ sequence: 1, serverTime: 0, entities, events: [] });
test('world membership indexes survive deletion, replacement, corpse and reset', () => {
  const world = new WorldState();
  world.applyFullSnapshot(snapshot([entity(1, 1), entity(2, 2)]), 0);
  const revision = world.membershipRevision;
  assert.equal(world.healthyPlayer().handle, 1);
  assert.equal([...world.entitiesOfKind(2)].length, 1);
  world.applyFullSnapshot(snapshot([entity(1, 1, 0)]), 50);
  assert.equal(world.healthyPlayer(), undefined);
  assert.equal(world.playerEntity().handle, 1);
  assert.equal([...world.entitiesOfKind(2)].length, 0);
  assert.ok(world.membershipRevision > revision);
  world.applyDeltaSnapshot({ ...snapshot([]), deletedHandles: [1] }, 100);
  assert.equal(world.playerEntity(), undefined);
  world.applyFullSnapshot(snapshot([entity(16385, 1)]), 150);
  assert.equal(world.playerEntity().handle, 16385);
  world.reset();
  assert.equal(world.count, 0); assert.equal(world.playerEntity(), undefined);
  assert.deepEqual([...world.entitiesOfKind(1)], []);
});
for (const [width, height] of [[1280, 720], [390, 844], [800, 600]]) for (const dpr of [1, 2]) for (const level of [1, 15, 30, 45]) {
  test(`one layout drives slot painting/hits ${width}x${height} DPR${dpr} level${level}`, () => {
    const layout = getHudLayout(width, height, level);
    for (const rect of hotbarRects(layout)) {
      const x = rect.centerX * layout.scale, y = rect.centerY * layout.scale;
      assert.equal(hotbarSlotAt(x * dpr / dpr, y * dpr / dpr, width, height, level), rect.slot);
      assert.equal(contains(rect, rect.x + rect.width, rect.y), false);
      assert.equal(contains(rect, rect.x - .1, rect.y + 1), false);
    }
    for (const [slot, rect] of inventoryLayout(width, height).slots.entries()) {
      assert.equal(inventorySlotAt(rect.x + rect.width / 2, rect.y + rect.height / 2, width, height), slot);
      assert.equal(inventorySlotAt(rect.x + rect.width + 2, rect.y + rect.height / 2, width, height), undefined);
    }
    for (const progress of [0, .5, 1]) for (const rect of deathCardRects(Array(16).fill(1), level, { width, height }, progress)) {
      assert.ok(contains(rect, rect.centerX, rect.centerY));
      assert.equal(contains(rect, rect.x + rect.width + 5, rect.centerY), false);
    }
  });
}
test('renderer owners isolate caches and nested scopes restore after an exception', () => {
  const first = new RenderResources(), second = new RenderResources(), original = renderResources();
  withRenderResources(first, () => { first.measurements.set('a', 1); assert.equal(renderResources(), first);
    assert.throws(() => withRenderResources(second, () => { assert.equal(renderResources(), second); throw new Error('fixture'); }));
    assert.equal(renderResources(), first);
  });
  assert.equal(renderResources(), original); assert.equal(second.measurements.size, 0);
  first.dispose(); assert.equal(first.measurements.size, 0); assert.equal(first.hudSurface, undefined);
});
test('worker termination, crash and message decoding failure reject every pending request', async () => {
  const old = globalThis.Worker;
  class FakeWorker { constructor() { FakeWorker.last = this; } postMessage() {} terminate() { this.terminated = true; } }
  globalThis.Worker = FakeWorker;
  try {
    for (const reason of ['terminate', 'error', 'messageerror']) {
      const client = new ServerWorkerClient(), worker = FakeWorker.last;
      const requests = [client.think(), client.flush()];
      const checks = requests.map(p => assert.rejects(p, /terminated|fixture|Invalid worker/));
      if (reason === 'terminate') client.terminate();
      if (reason === 'error') worker.onerror({ message: 'fixture crash' });
      if (reason === 'messageerror') worker.onmessageerror({});
      await Promise.all(checks); await assert.rejects(client.think(), /terminated/); client.terminate();
    }
  } finally { globalThis.Worker = old; }
});
