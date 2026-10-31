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
test('frame viewport bounds preserve per-entity f32 culling at inclusive edges and large coordinates', async () => {
  const {worldViewportBounds,isOutsideWorldBounds,isOutsideWorldViewport}=await import('../../../build/client/state/world-transform.js');
  const f=Math.fround;
  // Independent form of the prior per-entity test, including its rounding order.
  const original=(x,y,radius,camera)=>{
    const zoom=f(camera.zoom),width=f(camera.viewportWidth/zoom),height=f(camera.viewportHeight/zoom);
    const left=f(f(f(camera.x)+f(f(camera.viewportWidth*-.5)/zoom))-100);
    const top=f(f(f(camera.y)+f(f(camera.viewportHeight*-.5)/zoom))-100);
    const bx=f(f(x)-radius),by=f(f(y)-radius),size=f(radius+radius);
    return left>f(bx+size)||f(left+f(width+200))<bx||top>f(by+size)||f(top+f(height+200))<by;
  };
  for(const [viewportWidth,viewportHeight] of [[1280,720],[390,844],[1920,1080]])
    for(const zoom of [.0001,.63,.9,1,2.4])for(const center of [-25000,-.1,0,.1,25000]) {
      const camera={viewportWidth,viewportHeight,zoom,x:center,y:center*.17},view=worldViewportBounds(camera);
      for(const radius of [0,.1,20,100])for(const edgeX of [view.left-radius,view.right+radius])
        for(const edgeY of [view.top-radius,view.bottom+radius])for(const epsilon of [-.01,0,.01]) {
          const x=f(edgeX+epsilon),y=f(edgeY-epsilon),expected=original(x,y,radius,camera);
          assert.equal(isOutsideWorldBounds(x,y,radius,view),expected);
          assert.equal(isOutsideWorldViewport(x,y,radius,camera),expected);
        }
    }
});
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

test('draw order invalidates on membership and layer changes, while position-only deltas keep cached ordering', async () => {
  const {FrameContext}=await import('../../../build/client/render/frame-context.js');
  const world=new WorldState(),frame=new FrameContext(),camera={viewportWidth:1280,viewportHeight:720,pixelRatio:1};
  world.applyFullSnapshot(snapshot([entity(3,2),entity(1,1),entity(2,4)]),0);
  const layer=e=>e.kind;
  frame.begin(world,camera,0,16,layer);assert.deepEqual(frame.orderedHandles,[1,3,2]);
  assert.equal(frame.stats.sorts,1);
  world.applyDeltaSnapshot({...snapshot([{...entity(3,2),x:50,floatFields:{5:50}}]),sequence:2},50);
  frame.begin(world,camera,50,16,layer);assert.equal(frame.stats.sorts,0);assert.equal(frame.stats.worldScans,0);
  const slots=world.playerLoadout();assert.equal(world.playerLoadout(),slots);
  world.applyFullSnapshot(snapshot([entity(3,4),entity(1,1),entity(2,2)]),100);
  frame.begin(world,camera,100,16,layer);assert.deepEqual(frame.orderedHandles,[1,2,3]);assert.equal(frame.stats.sorts,1);
  world.reset();frame.begin(world,camera,150,16,layer);assert.deepEqual(frame.orderedHandles,[]);
});

test('worker step backpressure, streamed errors, timeout and post failure settle and clear pending records', async () => {
  const old=globalThis.Worker;
  class FakeWorker {constructor(){FakeWorker.last=this;}postMessage(request){this.request=request;if(this.throwPost)throw new Error('post failed');}terminate(){}}
  globalThis.Worker=FakeWorker;
  try {
    const client=new ServerWorkerClient('fixture',50),worker=FakeWorker.last;
    const first=client.step([],()=>{});assert.equal(client.pendingCount,1);
    await assert.rejects(client.step([],()=>{}),/already pending/);
    worker.onmessage({data:{callbackId:worker.request.callbackId,finalResponse:true}});await first;assert.equal(client.pendingCount,0);
    const callback=client.step([],()=>{throw new Error('packet failed');});
    worker.onmessage({data:{callbackId:worker.request.callbackId,finalResponse:false,data:new Uint8Array([1])}});
    await assert.rejects(callback,/packet failed/);assert.equal(client.pendingCount,0);
    worker.throwPost=true;await assert.rejects(client.think(),/post failed/);assert.equal(client.pendingCount,0);client.terminate();
    const timeout=new ServerWorkerClient('fixture',5);
    await assert.rejects(timeout.step([],()=>{}),/timeout/);assert.equal(timeout.pendingCount,0);await assert.rejects(timeout.think(),/terminated/);
  } finally {globalThis.Worker=old;}
});


test('frame transforms reuse settled values, preserve scalar clocks, invalidate on updates and release deleted handles',async()=>{
  const {FrameContext}=await import('../../../build/client/render/frame-context.js');
  const {interpolateEntity}=await import('../../../build/client/state/interpolation.js');
  const world=new WorldState(),frame=new FrameContext(),camera={viewportWidth:1280,viewportHeight:720,pixelRatio:1};
  world.applyFullSnapshot(snapshot([{...entity(7,2),radius:20}]),0);
  frame.begin(world,camera,200,16,()=>0);const first=world.get(7),value=frame.transform(first,200);
  assert.deepEqual(value,interpolateEntity(first,200));assert.equal(frame.stats.interpolations,1);
  assert.equal(frame.transform(first,300),value);assert.equal(frame.stats.interpolations,1);
  world.applyDeltaSnapshot({...snapshot([{...entity(7,2),x:90,floatFields:{5:90}}]),sequence:2},300);
  frame.begin(world,camera,330,16,()=>0);const updated=world.get(7);
  assert.deepEqual(frame.transform(updated,330),interpolateEntity(updated,330));
  assert.deepEqual(frame.transform(updated,310),interpolateEntity(updated,310));
  world.reset();frame.begin(world,camera,400,16,()=>0);assert.equal(frame.transforms.size,0);
});
