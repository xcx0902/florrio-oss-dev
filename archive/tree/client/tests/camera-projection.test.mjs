import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recoverCameraProjection, gridPhase } from '../../tools/parity/camera-projection.mjs';

test('f32 grid inversion recovers all archived projections without entity offsets', () => {
  for (const scene of ['garden-idle', 'move', 'attack', 'equip', 'damage', 'death', 'spawn']) {
    const trace = JSON.parse(readFileSync(`tests/parity/golden/${scene}/canvas.json`));
    const anchors = JSON.parse(readFileSync(`tests/parity/golden/${scene}/camera.json`));
    for (let index = 0; index < trace.frames.length; index++) {
      const frame = trace.frames[index];
      const projection = recoverCameraProjection(frame, anchors.frames[index]);
      assert.ok(projection);
      assert.equal(projection.entityOffsetX, 0);
      assert.equal(projection.entityOffsetY, 0);
      assert.equal(Math.fround(projection.x), projection.x);
      assert.equal(Math.fround(projection.y), projection.y);
      const lines = frame.ops.filter(op => op[1] === 'moveTo');
      const x = lines.find(op => op[2][1] === 0.5)[2][0];
      const y = lines.find(op => op[2][0] === 0.5 && op[2][1] !== 0.5)[2][1];
      assert.ok(Math.abs(gridPhase(projection.x, 1280, projection.zoom) - x) < 1e-6);
      assert.ok(Math.abs(gridPhase(projection.y, 720, projection.zoom) - y) < 1e-6);
      // Perturbing the cell anchor must not change the measured phase.
      const perturbed = recoverCameraProjection(frame, { x: anchors.frames[index].x + 1, y: anchors.frames[index].y - 1 });
      assert.deepEqual(perturbed, projection);
    }
  }
});

test('camera inversion has no projection for the menu and rejects incomplete grids', () => {
  const menu = JSON.parse(readFileSync('tests/parity/golden/boot-menu/canvas.json'));
  assert.equal(recoverCameraProjection(menu.frames.at(-1), { x: 0, y: 0 }), null);
  assert.throws(() => recoverCameraProjection({ ops: [[0, '=globalAlpha', [0.06]]] }, { x: 0, y: 0 }), /incomplete/);
});
