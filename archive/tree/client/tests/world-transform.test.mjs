import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerWorldTransformCache, playerWorldPosition, isOutsideWorldViewport } from '../public/state/world-transform.js';
import { CameraState } from '../public/state/camera.js';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';

const player = (overrides = {}) => ({ handle: 1, kind: 1, typeId: 1,
  x: -24975, y: 10, angle: 0, radius: 25, health: 100, maxHealth: 100,
  previousX: -24975, previousY: 10, previousAngle: 0, receivedAt: -120,
  ...overrides });

test('controlled world transform applies pan before the raw-radius arena clamp', () => {
  const entity = player({ previousRadius: 10, receivedRadiusAt: 100 });
  assert.deepEqual(playerWorldPosition(entity, 100, { x: -5, y: 3 }), { x: -24975, y: 13 });
});

test('input retains the previous render transform until the frame invalidates it', () => {
  const cache = new PlayerWorldTransformCache();
  const entity = player();
  assert.deepEqual(cache.get(entity, 0, { x: 5, y: 3 }), { handle: 1, x: -24970, y: 13 });
  entity.x = -24900; entity.y = 100;
  assert.deepEqual(cache.get(entity, 16, { x: -5, y: -3 }), { handle: 1, x: -24970, y: 13 });
  cache.invalidate();
  assert.deepEqual(cache.get(entity, 16, { x: -5, y: -3 }), { handle: 1, x: -24905, y: 97 });
  assert.deepEqual(cache.get(player({ handle: 2 }), 32, { x: 0, y: 0 }), { handle: 2, x: -24975, y: 10 });
});

test('viewport culling agrees with original760 expanded collider AABB comparisons', async () => {
  const reachedDraw = new Error('inside viewport');
  const host = address => { if (address === 136300) throw reachedDraw; return 0; };
  const native = await loadOriginal('client', { functionIds: [368, 760], imports: { a: { a: host, c: host } } });
  const state = native.call(368, 4096), entity = native.call(368, 448), collider = native.call(368, 64);
  const bytes = new Uint8Array(native.memory.buffer), view = new DataView(bytes.buffer);
  bytes.fill(0, state, state + 4096); bytes.fill(0, entity, entity + 448); bytes.fill(0, collider, collider + 64);
  const camera = new CameraState(); camera.setCamera(-24900, -1000, 0.6);
  const f = Math.fround, at = state + 2144;
  const width = f(1280 / f(camera.zoom)), height = f(720 / f(camera.zoom));
  const left = f(f(camera.x) + f(f(-640) / f(camera.zoom)));
  const top = f(f(camera.y) + f(f(-360) / f(camera.zoom)));
  view.setUint32(entity + 140, collider, true); bytes[collider + 36] = 1;
  for (const [offset, value] of [[28,left],[32,top],[36,width],[40,height]]) view.setFloat32(at + offset, value, true);
  const beforeStack = native.stackPointer.value;
  for (const radius of [0, 10, 25, 100]) for (const x of [left-101-radius,left-100-radius,left-99-radius,left+width+99+radius,left+width+101+radius])
    for (const y of [top-101-radius,top-100-radius,top,top+height+101+radius]) {
      view.setFloat32(collider + 40, f(f(x)-radius), true); view.setFloat32(collider + 44, f(f(y)-radius), true);
      view.setFloat32(collider + 48, f(radius+radius), true); view.setFloat32(collider + 52, f(radius+radius), true);
      let outside = true;
      try { native.call(760, at, 0, entity, 16); } catch (error) {
        assert.equal(error, reachedDraw); outside = false;
      } finally { native.stackPointer.value = beforeStack; }
      assert.equal(isOutsideWorldViewport(x,y,radius,camera), outside, `${x},${y},${radius}`);
    }
});
