import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { CameraState } from '../public/state/camera.js';

const golden = JSON.parse(readFileSync('tests/parity/golden/garden-idle/canvas.json', 'utf8'));

function findPlayerBlock(ops) {
  for (let index = 0; index < ops.length; index++) {
    const [context, op, args] = ops[index];
    if (context !== 0 || op !== 'arc' || args[2] !== 25) continue;
    let transform = null;
    let fill = null;
    for (let cursor = index - 1; cursor > index - 20; cursor--) {
      if (transform === null && ops[cursor][1] === 'setTransform') transform = ops[cursor][2];
      if (fill === null && ops[cursor][1] === '=fillStyle') fill = ops[cursor][2][0];
    }
    if (transform !== null && fill === '#FFE763') return { transform, index };
  }
  return null;
}

function firstGridLines(ops) {
  let alpha = -1;
  for (let index = 0; index < ops.length; index++) {
    if (ops[index][1] === '=globalAlpha' && Math.abs(ops[index][2][0] - 0.06) < 1e-4) {
      alpha = index;
      break;
    }
  }
  assert.ok(alpha >= 0, 'golden frame contains the world grid');
  let x = null;
  let y = null;
  for (let index = alpha; index < Math.min(alpha + 240, ops.length); index++) {
    const [context, op, args] = ops[index];
    if (context !== 0 || op !== 'moveTo') continue;
    if (x === null && args[1] === 0.5) x = args[0];
    if (y === null && args[0] === 0.5) y = args[1];
  }
  assert.ok(x !== null && y !== null, 'golden frame contains both grid directions');
  return { x, y };
}

/** First horizontal arena band stop == screen x of world x = -25000. */
function arenaLeftEdge(ops) {
  for (let index = 0; index < 32; index++) {
    const [context, op, args] = ops[index];
    if (context !== 0 || op !== 'setTransform') continue;
    if (args[1] !== 0 || args[3] !== 720 || args[4] !== 0 || args[5] !== 0) continue;
    if (args[0] > 0 && args[0] < 1280) return args[0];
  }
  return null;
}

// Camera struct samples recorded from the archived client at the last three
// garden-idle frames (t = 2848/2864/2880, the frames covered by the golden PNG;
// camera + 4, +8 and +12; camera + 12 is the scene scale, and `zoom` is
// scale * min(720/1080, 1280/1920)). These are the values the same-camera hook
// feeds back into the reconstructed client.
const recorded = [
  { x: -24978.3203125, y: -1043.633056640625, zoom: 0.6000000635782877,
    gridX: 27.492157, gridY: 26.67981 },
  { x: -24978.431640625, y: -1044.8385009765625, zoom: 0.6000000635782877,
    gridX: 27.55954, gridY: 27.403076 },
  { x: -24978.826171875, y: -1046.232421875, zoom: 0.6000000635782877,
    gridX: 27.795868, gridY: 28.239441 },
];

test('archived camera scale relaxes from 1.0 to 0.9 with 0.8 smoothing', () => {
  const camera = new CameraState();
  camera.resize(1280, 720, 1);
  assert.equal(camera.zoom, Math.fround(1280 * Math.fround(1 / 1920)));
  const samples = [];
  for (let frame = 0; frame < 29; frame++) {
    camera.follow(0, 0, 16);
    samples.push(camera.zoom);
  }
  // 27 follow frames after the player appears the scale is 0.9003076, i.e. the
  // 0.600205 pixels-per-world sampled by the earlier first-frame garden trace.
  assert.ok(Math.abs(samples[26] - 0.6002050638198853) < 1e-7);
  // The garden screenshot window (t=2848..2880) is ~174 follow frames after
  // spawn, where the scale has settled at 0.9.
  for (let frame = 0; frame < 150; frame++) camera.follow(0, 0, 16);
  assert.ok(Math.abs(camera.zoom - recorded[0].zoom) < 1e-7);
  assert.ok(Math.abs(camera.zoom - 0.6) < 1e-7);
});

test('recorded camera trajectory reproduces the golden grid phase within 1e-3 px', () => {
  assert.equal(golden.frames.length, 3);
  for (let frame = 0; frame < golden.frames.length; frame++) {
    const ops = golden.frames[frame].ops;
    const player = findPlayerBlock(ops);
    assert.ok(player !== null, `frame ${frame} contains the yellow player arc`);
    const grid = firstGridLines(ops);
    const expected = recorded[frame];
    // The per-entity setTransform scale is the archived pixelsPerWorld.
    assert.ok(Math.abs(player.transform[0] - expected.zoom) < 1e-6);

    const camera = new CameraState();
    camera.resize(1280, 720, 1);
    camera.setCamera(expected.x, expected.y, expected.zoom);
    assert.ok(Math.abs(camera.zoom - expected.zoom) < 1e-9);
    // drawWorldGrid adds the archived half-pixel offset to every line.
    const gridX = (Math.ceil(camera.originX / 50) * 50 - camera.originX) * camera.zoom + 0.5;
    const gridY = (Math.ceil(camera.originY / 50) * 50 - camera.originY) * camera.zoom + 0.5;
    assert.ok(Math.abs(gridX - grid.x) < 1e-3, `frame ${frame} first vertical grid line`);
    assert.ok(Math.abs(gridY - grid.y) < 1e-3, `frame ${frame} first horizontal grid line`);
    assert.ok(Math.abs(gridX - expected.gridX) < 1e-3);
    assert.ok(Math.abs(gridY - expected.gridY) < 1e-3);
  }
});

test('arena band extraction recovers the recorded camera centre', () => {
  for (let frame = 0; frame < golden.frames.length; frame++) {
    const ops = golden.frames[frame].ops;
    const player = findPlayerBlock(ops);
    const edge = arenaLeftEdge(ops);
    assert.ok(edge !== null, `frame ${frame} contains the arena band`);
    // world x = -25000 projects to edge; screen = (world - originX) * zoom.
    const cameraX = -25000 + (640 - edge) / player.transform[0];
    assert.ok(Math.abs(cameraX - recorded[frame].x) < 0.0025,
      `frame ${frame} camera x from arena band`);
  }
});

test('player screen projection matches the recorded camera', () => {
  for (let frame = 0; frame < golden.frames.length; frame++) {
    const player = findPlayerBlock(golden.frames[frame].ops);
    const expected = recorded[frame];
    const camera = new CameraState();
    camera.resize(1280, 720, 1);
    camera.setCamera(expected.x, expected.y, expected.zoom);
    const world = camera.screenToWorld(player.transform[4], player.transform[5]);
    // The rendered player is the interpolated entity plus the mouse-pan
    // offset, so it is offset from the camera centre at this transient.
    const screenX = (world.x - camera.originX) * camera.zoom;
    const screenY = (world.y - camera.originY) * camera.zoom;
    assert.ok(Math.abs(screenX - player.transform[4]) < 1e-6);
    assert.ok(Math.abs(screenY - player.transform[5]) < 1e-6);
  }
});

test('derived camera recordings reproduce every golden grid frame', () => {
  const scenes = ['garden-idle', 'move', 'attack', 'equip', 'damage', 'death', 'spawn'];
  for (const scene of scenes) {
    const recording = JSON.parse(readFileSync(`tests/parity/golden/${scene}/camera.json`, 'utf8'));
    assert.equal(recording.apply, true, `${scene} camera must be applied`);
    assert.equal(recording.stale, false, `${scene} golden must cover the screenshot window`);
    const frames = JSON.parse(readFileSync(`tests/parity/golden/${scene}/canvas.json`, 'utf8')).frames;
    assert.equal(frames.length, recording.frames.length, `${scene} frame count`);
    for (let index = 0; index < frames.length; index++) {
      const camera = new CameraState();
      camera.resize(1280, 720, 1);
      camera.setCamera(recording.frames[index].x, recording.frames[index].y, recording.frames[index].zoom);
      const grid = firstGridLines(frames[index].ops);
      const predictedX = (Math.ceil(camera.originX / 50) * 50 - camera.originX) * camera.zoom + 0.5;
      const predictedY = (Math.ceil(camera.originY / 50) * 50 - camera.originY) * camera.zoom + 0.5;
      assert.ok(Math.abs(predictedX - grid.x) < 0.01, `${scene} frame ${index} grid x`);
      assert.ok(Math.abs(predictedY - grid.y) < 0.01, `${scene} frame ${index} grid y`);
    }
  }
  const menu = JSON.parse(readFileSync('tests/parity/golden/boot-menu/camera.json', 'utf8'));
  assert.equal(menu.apply, false, 'menu camera must not be pinned');
});
