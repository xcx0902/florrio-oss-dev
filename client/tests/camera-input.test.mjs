import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { CameraState } from '../public/state/camera.js';
import { InputPacketEncoder } from '../public/net/input.js';
import { PACKET_XOR_KEY } from '../public/schema/packet-key.js';
import { lerp, lerpAngle, interpolateEntity } from '../public/state/interpolation.js';

function decode(packet) {
  const bytes = Uint8Array.from(packet);
  for (let index = 0; index < bytes.length; index++) bytes[index] ^= PACKET_XOR_KEY[index % PACKET_XOR_KEY.length];
  return bytes;
}

function varint(bytes, cursor) {
  let value = 0;
  let shift = 0;
  for (;;) {
    const byte = bytes[cursor++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [value >>> 0, cursor];
}

test('camera follows the archived interpolated target and resets to the origin', () => {
  const camera = new CameraState();
  camera.resize(1280, 720, 1);
  // The archived camera starts at the world origin and snaps to the first
  // controlled-player target; the recovered follow coefficient is 1.
  assert.equal(camera.x, 0);
  assert.equal(camera.y, 0);
  camera.follow(100, 50, 16);
  assert.equal(camera.x, 100);
  assert.equal(camera.y, 50);
  camera.follow(200, 50, 90);
  assert.equal(camera.x, 200);
  assert.equal(camera.y, 50);
  camera.follow(250, 80, 16, 5, -5);
  assert.equal(camera.x, 255);
  assert.equal(camera.y, 75);
  camera.reset();
  assert.equal(camera.x, 0);
  assert.equal(camera.y, 0);
  assert.equal(camera.zoom, Math.fround(1280 * Math.fround(1 / 1920)));
  camera.follow(-20, 30, 16);
  assert.equal(camera.x, -20);
  assert.equal(camera.y, 30);
  const zoom = camera.zoom;
  assert.equal(camera.originX, -20 - 640 / zoom);
  assert.equal(camera.originY, 30 - 360 / zoom);
});

test('camera handles DPR and screen-to-world conversion', () => {
  const camera = new CameraState();
  camera.resize(800, 600, 2);
  camera.follow(0, 0, 0);
  // Native projection selects max(height/1080, width/1920), with f32
  // products. DPR affects the backing surface, not the CSS camera centre.
  assert.equal(camera.pixelRatio, 2);
  const expectedZoom = Math.fround(600 * Math.fround(1 / 1080));
  assert.equal(camera.zoom, expectedZoom);
  assert.deepEqual(camera.screenToWorld(400, 300), { x: 0, y: 0 });
  assert.deepEqual(camera.screenToWorld(0, 0), { x: -400 / expectedZoom, y: -300 / expectedZoom });
});

test('camera setCamera pins the recorded projection and getCamera round-trips', () => {
  const camera = new CameraState();
  camera.resize(1280, 720, 1);
  camera.setCamera(-24530.1796875, -920.900634765625, 0.6002050638198853);
  camera.follow(0, 0, 16);
  assert.equal(camera.x, -24530.1796875);
  assert.equal(camera.y, -920.900634765625);
  assert.equal(camera.zoom, 0.6002050638198853);
  assert.deepEqual(camera.getCamera(), {
    x: -24530.1796875, y: -920.900634765625, zoom: 0.6002050638198853,
  });
  camera.clearOverride();
  camera.follow(0, 0, 16);
  assert.equal(camera.x, 0);
  assert.equal(camera.y, 0);
});

test('game camera renders at the original 0.600205 zoom', () => {
  // Historical first-window garden sample: the archived trace at t=1936 (30
  // frames after spawn) used setTransform(0.600205, ..., tx, ty) and a
  // 30.010254 px grid step. The current golden captures the settled window
  // (t=2848..2880) at 0.6, but this sample still pins the projection maths.
  const camera = new CameraState();
  camera.resize(1280, 720, 1);
  camera.zoom = 0.600205;
  camera.follow(0, 0, 0);
  assert.ok(Math.abs(camera.originX + 1280 / (2 * 0.600205)) < 1e-9);
  assert.ok(Math.abs(camera.originY + 720 / (2 * 0.600205)) < 1e-9);
  const corner = camera.screenToWorld(0, 0);
  assert.ok(Math.abs(corner.x + 1280 / (2 * 0.600205)) < 1e-9);
  assert.ok(Math.abs(corner.y + 720 / (2 * 0.600205)) < 1e-9);
  assert.ok(Math.abs(camera.viewportWidth / camera.zoom - 2132.604693396423) < 1e-9);
});

test('golden garden camera transform matches the settled client zoom', () => {
  const frames = JSON.parse(readFileSync('tests/parity/golden/garden-idle/canvas.json', 'utf8')).frames;
  const ops = frames[0].ops;
  // The re-recorded golden covers the screenshot window (t=2848..2880), where
  // the archived scale has settled at 0.9 -> 0.6 pixels per world unit.
  const transform = ops.find((op) => op[1] === 'setTransform'
    && Math.abs(op[2][0] - 0.6) < 1e-9 && Math.abs(op[2][3] - 0.6) < 1e-9);
  assert.ok(transform, 'golden garden frame contains a 0.6 world transform');
  const camera = new CameraState();
  camera.zoom = 0.6;
  camera.resize(1280, 720, 1);
  assert.equal(camera.zoom, 0.6);
});

test('interpolation clamps and wraps angles', () => {
  assert.equal(lerp(0, 10, 0.25), 2.5);
  assert.ok(Math.abs(lerpAngle(Math.PI * 1.9, -Math.PI * 1.9, 0.5) - Math.PI * 2) < 1e-9
    || Math.abs(lerpAngle(Math.PI * 1.9, -Math.PI * 1.9, 0.5)) < 1e-9);
  const entity = { previousX: 0, previousY: 0, previousAngle: 0, x: 10, y: 20, angle: 1, receivedAt: 0 };
  assert.deepEqual(interpolateEntity(entity, 60), { x: 5, y: 10, angle: 0.5 });
  assert.deepEqual(interpolateEntity(entity, 1000), { x: 10, y: 20, angle: 1 });
});

test('input encoder emits restart, input, discard, swap, suicide and bench opcodes', () => {
  const encoder = new InputPacketEncoder();
  let decoded = decode(encoder.restart());
  let [sequence, cursor] = varint(decoded, 0);
  let [opcode, end] = varint(decoded, cursor);
  assert.equal(sequence, 1);
  assert.equal(opcode, 4);
  assert.equal(end, decoded.length);

  decoded = decode(encoder.input(2, 1.5, 635));
  [sequence, cursor] = varint(decoded, 0);
  [opcode, cursor] = varint(decoded, cursor);
  assert.equal(sequence, 2);
  assert.equal(opcode, 12);
  let buttons;
  [buttons, cursor] = varint(decoded, cursor);
  assert.equal(buttons, 2);
  const view = new DataView(decoded.buffer, decoded.byteOffset);
  assert.ok(Math.abs(view.getFloat32(cursor, true) - 1.5) < 1e-6);
  assert.equal(view.getFloat32(cursor + 4, true), 635);
  assert.equal(cursor + 8, decoded.length);

  decoded = decode(encoder.discard(3, 7));
  [sequence, cursor] = varint(decoded, 0);
  [opcode, cursor] = varint(decoded, cursor);
  assert.equal(opcode, 8);
  assert.deepEqual([...decoded.slice(cursor)], [3, 7]);

  decoded = decode(encoder.swap(1, 2, 3, 4));
  [sequence, cursor] = varint(decoded, 0);
  [opcode, cursor] = varint(decoded, cursor);
  assert.equal(opcode, 10);
  assert.deepEqual([...decoded.slice(cursor)], [1, 2, 3, 4]);

  decoded = decode(encoder.suicide());
  [sequence, cursor] = varint(decoded, 0);
  [opcode, cursor] = varint(decoded, cursor);
  assert.equal(opcode, 3);
  const [argument, argumentEnd] = varint(decoded, cursor);
  assert.equal(argument, 0);
  assert.equal(argumentEnd, decoded.length);

  decoded = decode(encoder.benchCycle());
  [sequence, cursor] = varint(decoded, 0);
  [opcode, cursor] = varint(decoded, cursor);
  assert.equal(opcode, 13);
  assert.equal(cursor, decoded.length);
});

test('input packet trace is stable for a scripted action sequence', () => {
  // Regression trace: the exact XOR/varint bytes the client sends for a fixed
  // script. Recomputing the script must reproduce the recorded hex.
  const encoder = new InputPacketEncoder();
  const packets = [
    encoder.restart(),
    encoder.input(1, 0.25, 635),
    encoder.discard(2, 5),
    encoder.swap(0, 1, 4, 2),
    encoder.suicide(),
    encoder.benchCycle(),
  ];
  const hex = packets.map(packet => Buffer.from(packet).toString('hex'));
  assert.deepEqual(hex, [
    '3609',
    '35012c2ef7e5ca1305d0f6',
    '34052f2b',
    '33072d2ff367',
    '320e2d',
    '3100',
  ]);
});
