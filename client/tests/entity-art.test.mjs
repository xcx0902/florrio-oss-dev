import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
// Exercise source (including world integration) without stale client/public
// modules or generated writes while other render agents are working.
const sourceModules = new Map();
async function sourceModule(url) {
  if (!sourceModules.has(url.href)) sourceModules.set(url.href, (async () => {
    const source = await readFile(url, 'utf8');
    let compiled = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
    } }).outputText;
    for (const [, specifier] of compiled.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      if (!specifier.startsWith('.')) continue;
      const dependency = await sourceModule(new URL(specifier.replace(/\.js$/, '.ts'), url));
      compiled = compiled.replaceAll(JSON.stringify(specifier), JSON.stringify(dependency))
        .replaceAll(`'${specifier}'`, JSON.stringify(dependency));
    }
    return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
  })());
  return sourceModules.get(url.href);
}
const {
  TAU, drawAnt, drawBee, drawLadybug, drawPlayerFace, createPlayerFaceState, drawRock,
  drawPlayerHealthBar, createPlayerHealthBarState,
  drawSpecies, drawHornet, drawCactus, drawBeetle, drawSpider, drawCentipede,
  cactusPaths, flashColor, shade, insectWave, ladybugSpots, rockPoints,
} = await import(await sourceModule(new URL('../src/render/entity-art.ts', import.meta.url)));
const { drawWorld } = await import(await sourceModule(new URL('../src/render/world.ts', import.meta.url)));
const { WorldState } = await import(await sourceModule(new URL('../src/state/world.ts', import.meta.url)));
const { CameraState } = await import(await sourceModule(new URL('../src/state/camera.ts', import.meta.url)));
const { wrapContext } = await import(await sourceModule(new URL('../src/render/canvas2d/context.ts', import.meta.url)));
const { drawMobPortrait } = await import(await sourceModule(new URL('../src/render/menu-panels.ts', import.meta.url)));

class MockContext {
  constructor() {
    this.ops = [];
  }

  record(name, ...args) {
    this.ops.push([name, ...args]);
  }

  save() { this.record('save'); }
  restore() { this.record('restore'); }
  setTransform(...args) { this.record('setTransform', ...args); }
  beginPath() { this.record('beginPath'); }
  closePath() { this.record('closePath'); }
  rect(...args) { this.record('rect', ...args); }
  moveTo(...args) { this.record('moveTo', ...args); }
  lineTo(...args) { this.record('lineTo', ...args); }
  quadraticCurveTo(...args) { this.record('quadraticCurveTo', ...args); }
  bezierCurveTo(...args) { this.record('bezierCurveTo', ...args); }
  arc(...args) { this.record('arc', ...args); }
  ellipse(...args) { this.record('ellipse', ...args); }
  fill() { this.record('fill'); }
  stroke() { this.record('stroke'); }
  clip() { this.record('clip'); }
  fillRect(...args) { this.record('fillRect', ...args); }
  strokeRect(...args) { this.record('strokeRect', ...args); }
  clearRect(...args) { this.record('clearRect', ...args); }
  setFillRgb(...args) { this.record('=fillStyle', ...args); }
  setStrokeRgb(...args) { this.record('=strokeStyle', ...args); }
  setGlobalAlpha(...args) { this.record('=globalAlpha', ...args); }
  setLineWidth(...args) { this.record('=lineWidth', ...args); }
  setLineCap(...args) { this.record('=lineCap', ...args); }
  setLineJoin(...args) { this.record('=lineJoin', ...args); }
  setFont(...args) { this.record('=font', ...args); }
  fillText(...args) { this.record('fillText', ...args); }
  strokeText(...args) { this.record('strokeText', ...args); }
  measureText() { return { width: 0 }; }
  drawImage() { this.record('drawImage'); }
}

const record = (draw) => {
  const context = new MockContext();
  draw(context);
  return context.ops;
};

const close = (actual, expected, epsilon = 1e-6) => {
  assert.equal(actual.length, expected.length, `${actual} vs ${expected}`);
  for (let index = 0; index < actual.length; index++) {
    assert.ok(Math.abs(actual[index] - expected[index]) <= epsilon,
      `component ${index}: ${actual[index]} != ${expected[index]}`);
  }
};

test('player face emits the archived body, eyes, highlight and smile commands', () => {
  const ops = record(context => drawPlayerFace(context, { attacking: false, highlightRight: false, preserveContext: true }));
  assert.deepEqual(ops[0], ['save']);
  assert.deepEqual(ops[1], ['=lineCap', 'round']);
  assert.deepEqual(ops[2], ['=lineWidth', 3]);
  assert.deepEqual(ops[3], ['=fillStyle', 255, 231, 99]);
  assert.deepEqual(ops[4], ['=strokeStyle', 207, 187, 80]);
  assert.deepEqual(ops[5], ['beginPath']);
  assert.deepEqual(ops[6], ['arc', 0, 0, 25, 0, TAU]);
  assert.deepEqual(ops[7], ['fill']);
  assert.deepEqual(ops[8], ['stroke']);

  const eye = ops.findIndex(op => op[0] === 'ellipse');
  assert.ok(eye > 0);
  assert.deepEqual(ops[eye], ['ellipse', -7, -5, 3, 6, 0, 0, TAU]);
  const highlight = ops.find(op => op[0] === 'arc' && op[2] < 0);
  assert.ok(highlight, 'highlight offset present');
  close(highlight.slice(1), [eye === -1 ? NaN : ops[eye][1] + 2, ops[eye][2], 3, 0, TAU]);
  assert.ok(ops.some(op => op[0] === 'quadraticCurveTo' && op[2] === 15));
  assert.equal(ops[ops.length - 1][0], 'restore');
});

test('legacy attacking option selects native action colours and a settled frown', () => {
  const ops = record(context => drawPlayerFace(context, { attacking: true, highlightRight: true }));
  assert.ok(ops.some(op => op[0] === '=fillStyle' && op.slice(1).join() === '206,118,219'));
  assert.ok(!ops.some(op => op[0] === 'moveTo' && op[1] === -14));
  assert.ok(ops.some(op => op[0] === 'clip'));
  assert.ok(ops.some(op => op[0] === 'quadraticCurveTo' && op[2] === 5));
});

test('ladybug emits head, shell path, clipped spots and outline', () => {
  const ops = record(context => drawLadybug(context, 3993337875));
  assert.deepEqual(ops[0], ['=lineWidth', 7]);
  assert.deepEqual(ops[1], ['=lineJoin', 'round']);
  assert.deepEqual(ops[2], ['=fillStyle', 17, 17, 17]);
  assert.deepEqual(ops[3], ['=strokeStyle', 14, 14, 14]);
  assert.deepEqual(ops[4], ['beginPath']);
  assert.deepEqual(ops[5], ['arc', 15, 0, 15, 0, TAU]);
  assert.deepEqual(ops[6], ['fill']);
  assert.deepEqual(ops[7], ['stroke']);
  assert.deepEqual(ops[8], ['=fillStyle', 235, 64, 52]);
  assert.deepEqual(ops[9], ['=strokeStyle', 190, 52, 42]);

  const shell = ops.find(op => op[0] === 'arc' && op[3] === 30);
  assert.ok(shell);
  close(shell.slice(1, 6), [0, 0, 30, 0.6, TAU - 0.6]);
  assert.equal(shell[6], false, 'native path arc supplies the direction argument explicitly');
  const closing = ops.find(op => op[0] === 'quadraticCurveTo');
  assert.ok(closing);
  close(closing.slice(1), [10, 0, 24.760068893432617, 16.939273834228516], 1e-4);

  const spots = ops.filter(op => op[0] === 'arc' && op[3] > 3 && op[3] < 10);
  const roundedTau = Math.round(TAU * 10000) / 10000;
  assert.deepEqual(spots.map(op => op.slice(1).map(value => Math.round(value * 10000) / 10000)), [
    [-1.0872, 17.6704, 8.9704, 0, roundedTau],
    [16.2808, -12.0092, 7.3548, 0, roundedTau],
    [-6.8531, -4.4828, 7.9135, 0, roundedTau],
  ]);
  assert.equal(ops.filter(op => op[0] === 'clip').length, 1);
  assert.ok(ops.some(op => op[0] === '=strokeStyle' && op[1] === 190 && op[2] === 52 && op[3] === 42));
});

test('bee emits the component-148 stinger, striped ellipse and antennae', () => {
  const ops = record(context => drawBee(context));
  assert.deepEqual(ops.slice(0, 4), [
    ['=lineWidth', 5],
    ['=lineJoin', 'round'],
    ['=lineCap', 'round'],
    ['=fillStyle', 51, 51, 51],
  ]);
  assert.deepEqual(ops[5], ['beginPath']);
  assert.deepEqual(ops[6], ['moveTo', -37, 0]);
  assert.deepEqual(ops[7], ['lineTo', -25, -9]);
  assert.deepEqual(ops[8], ['lineTo', -25, 9]);
  assert.ok(ops.some(op => op[0] === 'ellipse' && op[3] === 30 && op[4] === 20));
  assert.deepEqual(ops.filter(op => op[0] === 'fillRect'), [
    ['fillRect', 10, -20, 10, 40],
    ['fillRect', -10, -20, 10, 40],
    ['fillRect', -30, -20, 10, 40],
  ]);
  assert.ok(ops.some(op => op[0] === 'arc' && op[1] === 40 && op[2] === -15 && op[3] === 5));
  assert.ok(ops.some(op => op[0] === 'arc' && op[1] === 40 && op[2] === 15 && op[3] === 5));
});

test('ant emits two antenna strokes and a 14-unit body', () => {
  const ops = record(context => drawAnt(context, 3697180750, 14, 7, 0));
  assert.deepEqual(ops[0], ['=lineWidth', 7]);
  assert.deepEqual(ops[1], ['=lineJoin', 'round']);
  assert.deepEqual(ops[2], ['=lineCap', 'round']);
  assert.equal(ops.filter(op => op[0] === 'quadraticCurveTo').length, 2);
  const body = ops.find(op => op[0] === 'arc' && op[3] === 14);
  assert.ok(body);
  assert.ok(ops.some(op => op[0] === '=fillStyle' && op[1] === 85));
  assert.ok(ops.some(op => op[0] === '=strokeStyle' && op[1] === 69));
});

test('rock derives its polygon from the handle and radius', () => {
  const ops = record(context => drawRock(context, 3784458363, 23.19));
  assert.deepEqual(ops[0], ['=lineWidth', 7]);
  assert.deepEqual(ops[1], ['=lineJoin', 'round']);
  assert.deepEqual(ops[2], ['=fillStyle', 119, 119, 119]);
  assert.deepEqual(ops[3], ['=strokeStyle', 96, 96, 96]);
  assert.deepEqual(ops[4], ['beginPath']);
  close(ops[5].slice(1), [20.938339233398438, 0]);
  close(ops[6].slice(1), [10.1550874710083, 20.33759307861328]);
  assert.equal(ops.filter(op => op[0] === 'lineTo').length, 5);
  assert.ok(ops.some(op => op[0] === 'closePath'));
});

test('world drops read the pickup type from field22 rather than the domain kind or species', () => {
  for (const fields of [{ byteFields: { 22: 7 } }, { denseByteFields: { 22: 7 } }, { denseFields: { 22: 7 } }]) {
    const world = new WorldState();
    world.apply({ sequence: 1, serverTime: 0, events: [], entities: [
      { handle: 700, typeId: 4, kind: 4, speciesId: 1, x: 0, y: 0,
        angle: 0, radius: 35, health: 0, maxHealth: 0, flags: 0, ...fields },
    ] }, 0);
    const camera = new CameraState(); camera.resize(1280, 720, 1); camera.setCamera(0, 0, 1);
    const context = new ArtContext();
    drawWorld(context, world, camera, 0);
    assert.ok(context.ops.some(op => op[0] === 'lineTo'), 'field22 Stinger retains triangular artwork');
    assert.ok(context.ops.some(op => op[0] === 'fillText' && op[1] === 'Stinger'), 'pickup card retains the native petal name');
    assert.ok(context.ops.some(op => op[0] === 'rect' && op[1] === -36), 'pickup has the native black square rim');
  }
});

test('drawWorld wraps every entity in save/restore with the 0.600205 transform', async () => {
  const world = new WorldState();
  world.apply({
    sequence: 1,
    serverTime: 0,
    events: [],
    entities: [
      { handle: 10, typeId: 1, kind: 1, speciesId: 0, x: 0, y: 0, angle: 0, radius: 25,
        health: 100, maxHealth: 100, healthKnown: true, maxHealthKnown: true, flags: 0,
        byteFields: { 14: 1, 22: 6, 31: 0 } },
      { handle: 11, typeId: 2, kind: 2, speciesId: 4, x: 100, y: 0, angle: Math.PI / 2, radius: 30,
        health: 25, maxHealth: 25, healthKnown: true, maxHealthKnown: true, flags: 0 },
      { handle: 12, typeId: 2, kind: 2, speciesId: 1, x: -100, y: 0, angle: 0, radius: 23.19,
        health: 9, maxHealth: 9, healthKnown: true, maxHealthKnown: true, flags: 0 },
      { handle: 13, typeId: 3, kind: 3, speciesId: 1, x: 40, y: 0, angle: 0, radius: 10,
        health: 10, maxHealth: 10, healthKnown: true, maxHealthKnown: true, flags: 0 },
      { handle: 14, typeId: 2, kind: 2, speciesId: 4, x: 100000, y: 100000, angle: 0, radius: 30,
        health: 25, maxHealth: 25, healthKnown: true, maxHealthKnown: true, flags: 0 },
    ],
  }, 0);
  const camera = new CameraState();
  camera.zoom = 0.600205;
  camera.resize(1280, 720, 1);
  camera.follow(0, 0, 0);

  const context = new ArtContext();
  drawWorld(context, world, camera, 1000);

  const transforms = context.ops.filter(op => op[0] === 'setTransform');
  const entityTransforms = transforms.filter(op => op.length === 7 && Math.abs(op[1]) < 0.61 && Math.abs(op[2]) < 0.61);
  assert.ok(entityTransforms.length >= 4, `entity transforms ${entityTransforms.length}`);
  const uprights = entityTransforms.filter(op => Math.abs(op[1] - 0.600205) < 1e-6 && Math.abs(op[2]) < 1e-9);
  assert.ok(uprights.some(op => Math.abs(op[5] - 640) < 1e-3 && Math.abs(op[6] - 360) < 1e-3), 'player transform present');
  assert.ok(uprights.some(op => Math.abs(op[5] - (640 + 24.0082)) < 1e-3 && Math.abs(op[6] - 360) < 1e-3), 'petal transform present');
  const rotated = entityTransforms.find(op => Math.abs(op[2] - 0.600205) < 1e-6);
  assert.ok(rotated, 'rotated ladybug transform present');
  close([rotated[1], rotated[4]], [0, 0], 1e-6);
  close([rotated[5], rotated[6]], [700.0205, 360], 1e-3);

  const saves = context.ops.filter(op => op[0] === 'save').length;
  const restores = context.ops.filter(op => op[0] === 'restore').length;
  assert.equal(saves, restores);
  // Effect field14 selects the native action colour. Field22 deliberately
  // contains unrelated pickup bits and field31 is a separate expression.
  // Compare the first persistent frame against original1100's zero state.
  const native = await originalArt();
  const playerStart = context.paints.findIndex(paint => paint.op === 'fill'
    && paint.commands.some(([name, args]) => name === 'arc' && args[2] === 25));
  assert.ok(playerStart >= 0, 'player body present');
  const initial = createPlayerFaceState();
  const matrix = context.paints[playerStart].commands[0][2];
  const expected = native.player(initial, { attacking: true, deltaMs: 16 }, matrix);
  assertArtClose(context.paints.slice(playerStart, playerStart + expected.paints.length), expected.paints, 'world player');
  assert.ok(!transforms.some(op => op.length === 7 && op[5] > 2000), 'far entity culled');
});

// Independent fixtures computed by the recovered component-96/60 arithmetic;
// these handles were not in the former screenshot-derived art lookup tables.
test('procedural art handles unseen identities without a screenshot lookup', () => {
  assert.deepEqual(ladybugSpots(1), ladybugSpots(16384));
  assert.equal(ladybugSpots(987654321, 31).length, 5);
  assert.equal(ladybugSpots(987654321, 30).length, 3);
  assert.notDeepEqual(ladybugSpots(987654321), ladybugSpots(987654322));
  assert.deepEqual(rockPoints(987654321, 50), rockPoints(987654321, 50));
  assert.equal(rockPoints(987654321, 50).length, 10);
  assert.ok(rockPoints(987654321, 50).flat().every(Number.isFinite));
});

// Reuse the unchanged WASM as an independent oracle. Only extra exports are
// added by loadOriginal; no recovered JS implementation runs in these tests.
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';

class ArtPath {
  constructor() { this.ops = []; }
  moveTo(...args) { this.ops.push(['moveTo', args]); }
  lineTo(...args) { this.ops.push(['lineTo', args]); }
  arc(...args) { this.ops.push(['arc', args.slice(0, 5).concat(Boolean(args[5]))]); }
  quadraticCurveTo(...args) { this.ops.push(['quadraticCurveTo', args]); }
  closePath() { this.ops.push(['closePath', []]); }
}

/** Paint snapshots include every path command, local matrix, active color,
 * stroke style, alpha and clip. This compares artwork independently of the
 * outer world/HUD ordering and redundant bridge save/transform flushes. */
class ArtContext extends MockContext {
  constructor() {
    super(); this.paints = []; this.path = []; this.stack = [];
    this.state = { matrix: [1, 0, 0, 1, 0, 0], fill: [0, 0, 0], stroke: [0, 0, 0],
      width: 1, join: 'miter', cap: 'butt', alpha: 1, miter: 10 };
    this.pathsCreated = 0;
  }
  save() { this.stack.push(structuredClone(this.state)); super.save(); }
  restore() { assert.ok(this.stack.length, 'balanced artwork restore'); this.state = this.stack.pop(); super.restore(); }
  setTransform(...args) { this.state.matrix = args; super.setTransform(...args); }
  getTransform() { return [...this.state.matrix]; }
  transform(a, b, c, d, e, f) {
    const [A, B, C, D, E, F] = this.state.matrix, q = Math.fround;
    this.state.matrix = [q(q(A*a)+q(C*b)), q(q(B*a)+q(D*b)), q(q(A*c)+q(C*d)), q(q(B*c)+q(D*d)), q(E+q(q(A*e)+q(C*f))), q(F+q(q(B*e)+q(D*f)))];
    this.record('localTransform', a, b, c, d, e, f);
  }
  createPath() { this.pathsCreated++; return new ArtPath(); }
  beginPath() { this.path = []; super.beginPath(); }
  command(name, args) { this.path.push([name, args, [...this.state.matrix]]); this.record(name, ...args); }
  closePath() { this.command('closePath', []); }
  moveTo(...args) { this.command('moveTo', args); }
  lineTo(...args) { this.command('lineTo', args); }
  quadraticCurveTo(...args) { this.command('quadraticCurveTo', args); }
  arc(...args) { this.command('arc', args.slice(0, 5).concat(Boolean(args[5]))); }
  ellipse(...args) { this.command('ellipse', args.slice(0, 7).concat(Boolean(args[7]))); }
  rect(...args) { this.command('rect', args); }
  setFillRgb(...args) { this.state.fill = args; super.setFillRgb(...args); }
  setStrokeRgb(...args) { this.state.stroke = args; super.setStrokeRgb(...args); }
  setLineWidth(width) { this.state.width = width; super.setLineWidth(width); }
  setLineJoin(join) { this.state.join = join; super.setLineJoin(join); }
  setLineCap(cap) { this.state.cap = cap; super.setLineCap(cap); }
  setGlobalAlpha(alpha) { this.state.alpha = alpha; super.setGlobalAlpha(alpha); }
  getGlobalAlpha() { return this.state.alpha; }
  setMiterLimit(limit) { this.state.miter = limit; this.record('=miterLimit', limit); }
  paint(op, path) {
    const commands = path ? path.ops.map(([name, args]) => [name, args, [...this.state.matrix]]) : structuredClone(this.path);
    const style = op === 'clip' ? {} : op === 'fill'
      ? { color: this.state.fill, alpha: this.state.alpha }
      : { color: this.state.stroke, alpha: this.state.alpha, width: this.state.width,
        join: this.state.join, cap: this.state.cap, miter: this.state.miter };
    this.paints.push({ op, commands, ...structuredClone(style) });
  }
  fill(path) { this.paint('fill', path); }
  stroke(path) { this.paint('stroke', path); }
  clip(path) { this.paint('clip', path); }
  fillRect(...args) {
    this.paints.push({ op: 'fillRect', args, matrix: [...this.state.matrix], color: [...this.state.fill], alpha: this.state.alpha });
  }
}

class CanvasTraceContext extends ArtContext {
  paint(op, path) { super.paint(op, path); this.record(op); }
  fillRect(...args) { super.fillRect(...args); this.record('fillRect', ...args); }
}

/** Exercise the production lazy-flush bridge while retaining all raw Canvas
 * commands. The getter exposes logical state, never the stale host matrix. */
function playerBridge(matrix, alpha = 1) {
  const raw = new CanvasTraceContext();
  const surface = {
    getTransform: () => Object.fromEntries(['a','b','c','d','e','f'].map((key, i) => [key, raw.state.matrix[i]])),
  };
  for (const name of ['save','restore','setTransform','beginPath','closePath','rect','moveTo','lineTo',
    'quadraticCurveTo','bezierCurveTo','arc','ellipse','fill','stroke','clip','fillRect','strokeRect','clearRect'])
    surface[name] = (...args) => raw[name](...args);
  for (const [name, setter] of [['lineWidth','setLineWidth'],['lineJoin','setLineJoin'],['lineCap','setLineCap'],
    ['globalAlpha','setGlobalAlpha'],['miterLimit','setMiterLimit']])
    Object.defineProperty(surface, name, { get: () => name === 'globalAlpha' ? raw.state.alpha : undefined,
      set: value => raw[setter](value) });
  for (const [name, setter] of [['fillStyle','setFillRgb'],['strokeStyle','setStrokeRgb']])
    Object.defineProperty(surface, name, { set: value => raw[setter](...value.slice(1).match(/../g).map(channel => parseInt(channel, 16))) });
  const bridge = wrapContext(surface);
  assert.equal(typeof bridge.getTransform, 'function');
  bridge.setTransform(...matrix); bridge.setGlobalAlpha(alpha); raw.ops.length = 0;
  return { context: bridge, raw };
}

test('Canvas bridge reads a detached logical matrix without flushing Canvas', () => {
  const matrix = [0.6, 0, 0, 0.6, 640, 360];
  const { context, raw } = playerBridge(matrix);
  const snapshot = context.getTransform();
  assert.deepEqual(snapshot, matrix);
  snapshot[4] = -1;
  assert.deepEqual(context.getTransform(), matrix);
  assert.deepEqual(raw.ops, [], 'reading logical state emits no Canvas command');
  context.save();
  context.transform(1, 0, 0, 1, 10, 20);
  assert.deepEqual(context.getTransform(), [Math.fround(0.6), 0, 0, Math.fround(0.6), 646, 372]);
  context.restore();
  assert.deepEqual(context.getTransform(), matrix);
  assert.ok(!raw.ops.some(op => op[0] === 'setTransform'));
});

let oraclePromise;
async function originalArt() {
  if (oraclePromise) return oraclePromise;
  oraclePromise = (async () => {
    let runtime, context, nextPath = 1, frameHost = false, healthLayerAlpha = 1;
    const paths = new Map();
    const hostMethods = new Map([
      [136300, 'save'], [136329, 'restore'], [138111, 'setLineWidth'],
      [137186, 'setFillRgb'], [137456, 'setStrokeRgb'], [137728, 'setGlobalAlpha'], [137767, 'setGlobalAlpha'],
      [136878, 'beginPath'], [136414, 'setTransform'], [137806, 'moveTo'], [137843, 'lineTo'],
      [137880, 'quadraticCurveTo'], [137995, 'arc'], [138047, 'ellipse'], [136946, 'rect'],
      [136661, 'fill'], [136732, 'stroke'], [136912, 'closePath'], [136807, 'clip'], [138893, 'setMiterLimit'],
    ]);
    function host(code, signature, pointer) {
      if (!runtime) return 0;
      if (code === 141314) return 2000;
      const bytes = new Uint8Array(runtime.memory.buffer), view = new DataView(bytes.buffer), args = [];
      const argumentPointer = pointer;
      pointer >>= 2;
      for (let type; (type = bytes[signature++]); pointer++) {
        if (type < 105) { if (pointer & 1) pointer++; args.push(view.getFloat64((pointer++ >> 1) * 8, true)); }
        else args.push(view.getInt32(pointer * 4, true));
      }
      if (code === 141620) { const id = nextPath++; paths.set(id, new ArtPath()); return id; }
      const pathMethod = { 141801: 'moveTo', 141835: 'lineTo', 141869: 'arc', 141918: 'quadraticCurveTo', 142027: 'closePath' }[code];
      if (pathMethod) { paths.get(args[0])[pathMethod](...args.slice(1)); return 0; }
      if (!context) return 0;
      // Seed the caller's inherited opacity at the native health layer's save
      // (original763 scratch +1504), before its software drawing-state copy.
      if (frameHost && code === 136300 && argumentPointer === runtime.stackPointer.value + 1504) {
        view.setFloat64(renderer + 56, healthLayerAlpha, true);
        context.setGlobalAlpha(healthLayerAlpha);
      }
      if (code === 138811 || code === 138852) { context.setLineJoin(code === 138811 ? 'round' : 'miter'); return 0; }
      if (code === 138730) { context.setLineCap('round'); return 0; }
      const pathPaint = { 136690: 'fill', 136763: 'stroke', 136836: 'clip' }[code];
      if (pathPaint) { context[pathPaint](paths.get(args[1])); return 0; }
      if (code === 137096) { context.fillRect(0, 0, 1, 1); return 0; }
      const method = hostMethods.get(code);
      if (method) context[method](...args.slice(1));
      else if (!frameHost) assert.ok([141250, 139312, 138505].includes(code), `unhandled native art command ${code}`);
      return 0;
    }
    runtime = await loadOriginal('client', {
      functionIds: [368, 369, 370, 426, 491, 614, 615, 616, 763, 782, 785, 1015, 1038, 1039, 1040, 1043, 1044, 1045, 1096, 1100,
        2499, 2502, 2503, 2505, 2509, 2512, 2515, 2516, 2519, 2521, 2523, 2525, 2527, 2530, 2532, 2535, 2536, 2538, 2541, 2543],
      imports: { a: { a: host, c: host } },
    });
    const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(view.buffer);
    const alloc = size => { const p = runtime.call(368, size); bytes.fill(0, p, p + size); return p; };
    const renderer = alloc(128), component = alloc(64), entity = alloc(448),
      bounds = alloc(64), visual = alloc(128), type = alloc(32), flags = alloc(64);
    const put = (p, value) => view.setUint32(p, value, true);
    put(entity + 136, visual); put(entity + 140, bounds); put(entity + 100, type); put(entity + 56, flags);
    const native = (species, handle, radius, now, flash = 0, spiderPhase = 0, activity = 0, matrix = [1, 0, 0, 1, 0, 0], alpha = 1) => {
      bytes.fill(0, renderer, renderer + 128); bytes.fill(0, component, component + 64);
      view.setFloat32(renderer, 1, true); view.setFloat32(renderer + 12, 1, true);
      view.setFloat64(renderer + 56, 1, true); bytes[renderer + 48] = 1; bytes[renderer + 50] = 2;
      put(component, entity); put(entity + 16, handle); bytes[type + 8] = species;
      view.setFloat32(bounds + 8, radius, true);
      bytes[visual + 56] = flash > 0 ? 1 : 0;
      view.setFloat64(visual + 64, 2000 - (1 - flash) * 150, true);
      matrix.forEach((value, i) => view.setFloat32(renderer + i * 4, value, true));
      context = new ArtContext(); context.setTransform(...matrix.map(Math.fround)); context.setGlobalAlpha(alpha);
      view.setFloat64(renderer + 56, alpha, true);
      if (species === 1 || species === 2) runtime.call(785, component, renderer);
      else if (species === 3) runtime.call(1045, component, renderer);
      else if ([4, 5, 20, 21].includes(species)) runtime.call(616, component, renderer, -1);
      else if (species === 6) runtime.call(1044, component, renderer);
      else if (species >= 7 && species <= 10) {
        bytes[component + 8] = species - 7; view.setFloat32(component + 16, activity, true); view.setFloat64(component + 24, now, true);
        runtime.call(615, component, renderer, 0, -1);
      } else if (species === 11) runtime.call(1043, component, renderer);
      else if (species === 12 || species === 13) {
        view.setFloat32(component + 8, activity, true); view.setFloat64(component + 16, now, true); runtime.call(782, component, renderer, 0);
      } else if (species === 14) runtime.call(1040, component, renderer);
      else if (species >= 15 && species <= 18) {
        bytes[component + 8] = species >= 17 ? 1 : 0;
        bytes[component + 9] = species % 2; runtime.call(614, component, renderer, 0, 0);
      } else if (species === 19) runtime.call(1039, component, renderer);
      else if (species === 22) {
        view.setFloat64(component + 8, spiderPhase, true); runtime.call(1038, component, renderer, 0);
      }
      return context.paints;
    };
    native.gallery = (callback, matrix, alpha) => {
      bytes.fill(0, renderer, renderer + 128);
      matrix.forEach((value, i) => view.setFloat32(renderer + i * 4, value, true));
      bytes[renderer + 48] = 1; bytes[renderer + 50] = 2;
      view.setFloat64(renderer + 56, alpha, true);
      context = new ArtContext(); context.setTransform(...matrix); context.setGlobalAlpha(alpha);
      runtime.call(callback, renderer);
      return context.paints;
    };
    const appearance = alloc(32), parameters = alloc(20);
    native.player = (initial, options = {}, matrix = [1, 0, 0, 1, 0, 0], alpha = 1) => {
      bytes.fill(0, renderer, renderer + 128); bytes.fill(0, appearance, appearance + 32);
      bytes.fill(0, parameters, parameters + 20);
      matrix.forEach((value, i) => view.setFloat32(renderer + i * 4, value, true));
      // An identity host/cache before the caller installs its entity matrix.
      view.setFloat32(renderer + 24, 1, true); view.setFloat32(renderer + 36, 1, true);
      bytes[renderer + 48] = 1; bytes[renderer + 50] = 2;
      bytes[renderer + 69] = +!!options.grayscale; view.setFloat64(renderer + 56, alpha, true);
      initial.gaze.forEach((gaze, i) => {
        view.setFloat32(appearance + i * 8, gaze.x, true); view.setFloat32(appearance + i * 8 + 4, gaze.y, true);
      });
      for (const [name, offset] of [['mouthCurve', 16], ['eyeExpression', 20], ['attackAmount', 24], ['defendAmount', 28]])
        view.setFloat32(appearance + offset, initial[name], true);
      bytes[parameters] = options.expressionFlags ?? 0;
      bytes[parameters + 1] = +!!options.dead; bytes[parameters + 2] = +!!options.attacking;
      bytes[parameters + 3] = +!!options.defending; bytes[parameters + 4] = +!!options.extraAction;
      const amount = Math.fround(options.flash ?? 0);
      const color = options.flashTarget ?? (amount >= 0.9 ? {r:255,g:255,b:255} : {r:255,g:0,b:0});
      bytes.set([color.r, color.g, color.b], parameters + 5);
      view.setFloat32(parameters + 8, amount, true);
      view.setFloat32(parameters + 12, options.lookAngle ?? 0, true);
      put(parameters + 16, options.model ?? 0);
      context = new CanvasTraceContext(); context.setGlobalAlpha(alpha);
      runtime.call(1100, renderer, options.deltaMs ?? 0, appearance, parameters);
      const state = { gaze: [0, 1].map(i => ({ x: view.getFloat32(appearance + i * 8, true), y: view.getFloat32(appearance + i * 8 + 4, true) })) };
      for (const [name, offset] of [['mouthCurve', 16], ['eyeExpression', 20], ['attackAmount', 24], ['defendAmount', 28]])
        state[name] = view.getFloat32(appearance + offset, true);
      return { paints: context.paints, state, ops: context.ops, matrix: [...context.state.matrix] };
    };
    let healthEntity;
    native.health = async (initial, ratio, options = {}, alpha = 1) => {
      const state = 441408;
      if (!healthEntity) {
        context = undefined;
        bytes[441368] = 1; runtime.call(1096);
        if (!(bytes[7931360] & 1) && runtime.call(369, 7931360)) {
          runtime.call(426); runtime.call(370, 7931360);
        }
        for (const address of [7931248,7931256,7931264,7931272,7931280,7931320]) view.setBigUint64(address, 0n, true);
        for (const address of [7931240,7926872,7931316,7931312,7931292,7931340,7931336,7931332]) put(address, state);
        put(7931308, 1065353216); view.setBigUint64(7931300, 4575657221408423936n, true);
        for (const address of [7931244,7926880,7931296,7931344]) bytes[address] = 0;
        put(7931288, 0); view.setUint16(7931328, 0, true); bytes[7931352] = 1;
        const trace = JSON.parse(await readFile(new URL('../../reports/runtime/client-packet-traces.json', import.meta.url), 'utf8'));
        for (const packet of trace.packets.filter(packet => packet.direction === 'fromWorker' && packet.bytes[0] === 1)) {
          const data = Uint8Array.from(packet.bytes.slice(1)), pointer = alloc(data.length + 16), reader = alloc(16);
          bytes.set(data, pointer); put(reader, pointer); put(reader + 4, data.length);
          runtime.call(1015, state, reader);
        }
        const localPlayer = view.getUint32(view.getUint32(state + 264, true), true);
        healthEntity = view.getUint32(localPlayer + 144, true);
        assert.ok(healthEntity, 'native local player exists');
        const component = view.getUint32(healthEntity + 152, true);
        native.initialHealthState = {};
        for (const [key, offset] of [['alpha',792],['trailingRatio',796],['healthRatio',800]])
          native.initialHealthState[key] = view.getFloat32(component + offset, true);
        native.initialHealthImmediate = bytes[view.getUint32(healthEntity + 136, true) + 16];
        // Call the actual appearance constructor, independently of packet
        // replay and all renderer-supplied test states. Native491 initializes
        // +792/+796/+800 explicitly (WAT 28312–28317).
        const freshEntity = alloc(448); put(freshEntity, state);
        const freshComponent = runtime.call(491, freshEntity);
        native.constructedHealthState = {};
        for (const [key, offset] of [['alpha',792],['trailingRatio',796],['healthRatio',800]])
          native.constructedHealthState[key] = view.getFloat32(freshComponent + offset, true);
        // Restrict the native component intersection to this single player.
        // No drawing instructions are patched; original763 still owns the
        // health updates, bridge calls and all three strokes.
        const reference = alloc(4), entries = alloc(4);
        put(reference, healthEntity); put(entries, reference);
        for (const offset of [1276, 1788]) { put(state + offset, 1); put(state + offset + 8, entries); }
      }
      const component = view.getUint32(healthEntity + 152, true);
      const health = view.getUint32(healthEntity + 116, true);
      const visual = view.getUint32(healthEntity + 136, true);
      assert.ok(component && health && visual, 'native player health components exist');
      for (const [key, offset] of [['alpha',792],['trailingRatio',796],['healthRatio',800]])
        view.setFloat32(component + offset, initial[key], true);
      view.setFloat32(health + 8, ratio, true); view.setFloat32(health + 12, 1, true);
      bytes[visual + 16] = +!!options.immediate;
      bytes.fill(0, renderer, renderer + 128);
      view.setFloat32(renderer, 1, true); view.setFloat32(renderer + 12, 1, true);
      view.setFloat64(renderer + 56, 1, true); bytes[renderer + 48] = 1; bytes[renderer + 50] = 2;
      bytes[renderer + 69] = +!!options.grayscale;
      context = new ArtContext();
      const stack = runtime.stackPointer.value;
      healthLayerAlpha = alpha;
      frameHost = true;
      try { runtime.call(763, state - 8, renderer, options.deltaMs ?? 0, 1280, 800); }
      finally { frameHost = false; }
      assert.equal(runtime.stackPointer.value, stack, 'native frame restores stack');
      const paints = context.paints.filter(paint => paint.op === 'stroke'
        && paint.commands[0]?.[0] === 'moveTo'
        && paint.commands[0][1][0] === -35 && paint.commands[0][1][1] === 50);
      assert.equal(paints.length, 3, `one isolated native health bar: ${JSON.stringify({
        active: bytes[state + 1], entity: healthEntity, component, health,
        flags: Array.from(bytes.slice(healthEntity + 45, healthEntity + 50)),
        strokes: context.paints.filter(paint => paint.op === 'stroke').map(paint => ({width:paint.width,commands:paint.commands.slice(0,2)})).slice(-4),
      })}`);
      const result = {};
      for (const [key, offset] of [['alpha',792],['trailingRatio',796],['healthRatio',800]])
        result[key] = view.getFloat32(component + offset, true);
      return { paints, state: result, ops: context.ops };
    };
    return native;
  })();
  return oraclePromise;
}
function assertArtClose(actual, expected, label, epsilon = 1e-4) {
  if (typeof expected === 'number') {
    assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon, `${label}: ${actual} != ${expected}`); return;
  }
  if (Array.isArray(expected)) {
    assert.equal(actual?.length, expected.length, `${label}: array length`);
    expected.forEach((value, index) => assertArtClose(actual[index], value, `${label}[${index}]`, epsilon)); return;
  }
  if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), label);
    for (const [key, value] of Object.entries(expected)) assertArtClose(actual[key], value, `${label}.${key}`, epsilon);
    return;
  }
  assert.equal(actual, expected, label);
}

const speciesRadii = [0, 23.19, 100, 49.99694, 30, 120, 25, 14, 20, 20, 60, 40, 40, 80, 25, 35, 35, 35, 35, 30, 30, 30, 25];
test('all twenty gallery portraits match their original fixed callbacks', async () => {
  const native = await originalArt();
  const callbacks = { 1:2543, 2:2541, 3:2538, 4:2536, 5:2535, 6:2532, 7:2530, 8:2527, 9:2525,
    10:2523, 11:2521, 12:2519, 13:2516, 14:2515, 15:2512, 17:2509, 19:2505, 20:2503, 21:2502, 22:2499 };
  for (const matrix of [[1,0,0,1,0,0], [-.4949749,-.4949749,.4949749,-.4949749,270.2,500.3]].map(m => m.map(Math.fround)))
    for (const [type, callback] of Object.entries(callbacks)) {
      const context = new ArtContext(); context.setTransform(...matrix); context.setGlobalAlpha(.35);
      drawMobPortrait(context, Number(type));
      assertArtClose(context.paints, native.gallery(callback, matrix, .35), `gallery portrait ${type}`);
    }
});
test('all 23 catalog ids dispatch their native species artwork on unseen handles', async () => {
  const native = await originalArt();
  for (let species = 0; species <= 22; species++) {
    const context = new ArtContext(), radius = speciesRadii[species];
    drawSpecies(context, species, 0xabc12345, radius, 317, 0);
    assertArtClose(context.paints, native(species, 0xabc12345, radius, 317), `species ${species}`);
    assert.equal(context.stack.length, 0, `species ${species} balances local state`);
  }
});

test('native species flash matches f32 truncation and shading at red/white boundaries', async () => {
  const native = await originalArt();
  const flashes = new Set([0.137, 0.5, 0.2712345, 0.6180339, 0.8999, 0.9, 0.9001, 1,
    ...[17, 51, 85, 119, 150, 238].flatMap(denominator =>
      Array.from({ length: denominator - 1 }, (_, index) => (index + 1) / denominator))]);
  const failures = new Map();
  for (const flash of flashes) for (let species = 1; species <= 22; species++) {
    const context = new ArtContext(), radius = speciesRadii[species];
    drawSpecies(context, species, 0xfed56789, radius, 417, flash);
    try {
      assertArtClose(context.paints, native(species, 0xfed56789, radius, 417, flash), `species ${species}, flash ${flash}`);
    } catch (error) { if (!failures.has(species)) failures.set(species, error.message); }
  }
  assert.equal(failures.size, 0, [...failures.values()].join('\n'));
});

test('native insect animation matches multiple times and spider movement phases', async () => {
  const native = await originalArt();
  for (const now of [0, 40, 200, 1000, 12345]) for (const species of [7, 8, 9, 10, 12, 13]) {
    const context = new ArtContext(), radius = speciesRadii[species];
    drawSpecies(context, species, 1234567, radius, now, 0);
    assertArtClose(context.paints, native(species, 1234567, radius, now), `species ${species}, now ${now}`);
  }
  for (const phase of [0, 16, 100, 617.25]) {
    const context = new ArtContext(); drawSpider(context, phase);
    assertArtClose(context.paints, native(22, 1234567, 25, 0, 0, phase), `spider phase ${phase}`);
  }
});

test('procedural native shapes generalize across radii and independent new identities', async () => {
  const native = await originalArt();
  for (const radius of [9, 30, 30.0000001, 30.001, 55.75, 120]) for (const handle of [1, 0x1234abcd, 0xffffffff]) for (const species of [1, 3, 4, 20, 21]) {
    const context = new ArtContext(); drawSpecies(context, species, handle, radius, 0);
    assertArtClose(context.paints, native(species, handle, radius, 0), `species ${species}, radius ${radius}, handle ${handle}`);
  }
});

test('Path2D caches are geometric and do not grow with entity handles', () => {
  const context = new ArtContext();
  for (const handle of [1, 2, 3, 0x7fffffff]) drawSpecies(context, 4, handle, 30, 0);
  assert.equal(context.pathsCreated, 1);
  for (const handle of [1, 2, 3, 0x7fffffff]) drawSpecies(context, 3, handle, 50, 0);
  assert.equal(context.pathsCreated, 3);
  assert.ok(context.paints.some(paint => paint.op === 'stroke' && paint.join === 'miter' && paint.miter === 10));
});

test('ladybug Path2D records the native explicit false arc argument without normalization', async () => {
  const native = await originalArt();
  for (const species of [4, 5, 20, 21]) {
    const context = new ArtContext(), calls = [];
    context.createPath = () => {
      const path = new ArtPath();
      path.arc = (...args) => { calls.push(['arc', ...args]); ArtPath.prototype.arc.apply(path, args); };
      return path;
    };
    drawSpecies(context, species, 0x1234abcd, speciesRadii[species], 0);
    assert.deepEqual(calls, [['arc', 0, 0, 30, 0.6000000238418579, 5.683185283337728, false]]);
    assert.equal(calls[0].length, 7, 'trace definition includes the explicit false argument');
    assertArtClose(context.paints, native(species, 0x1234abcd, speciesRadii[species], 0), `strict native shell ${species}`);
  }
});

test('rock cached Path2D uses native785 geometry and flushes transform after its style setters', async () => {
  const native = await originalArt(), nativePath = globalThis.Path2D;
  const matrix = [0.6, 0, 0, 0.6, 100, 200].map(Math.fround);
  const ops = [], paths = [];
  let current = [1, 0, 0, 1, 0, 0];
  const raw = {
    getTransform: () => Object.fromEntries(['a','b','c','d','e','f'].map((key, i) => [key, current[i]])),
    setTransform: (...values) => { current = values; ops.push(['setTransform', ...values]); },
    fill: path => { paths.push(path); ops.push(['fillPath']); },
    stroke: path => { paths.push(path); ops.push(['strokePath']); },
  };
  for (const name of ['lineWidth', 'lineJoin', 'fillStyle', 'strokeStyle'])
    Object.defineProperty(raw, name, { set: value => ops.push([`=${name}`, value]) });
  globalThis.Path2D = ArtPath;
  try {
    const context = wrapContext(raw);
    context.setTransform(...matrix);
    drawRock(context, 0x1234abcd, 55.75);
    assert.deepEqual(ops, [['=lineWidth', 7], ['=lineJoin', 'round'],
      ['=fillStyle', '#777777'], ['=strokeStyle', '#606060'],
      ['setTransform', ...matrix], ['fillPath'], ['strokePath']]);
    const expected = native(1, 0x1234abcd, 55.75, 0, 0, 0, 0, matrix);
    assertArtClose(paths[0].ops, expected[0].commands.map(([name, args]) => [name, args]), 'native rock path');
    drawRock(context, 0x1234abcd, 55.75, 0.4);
    assert.strictEqual(paths[0], paths[1], 'fill and stroke share the native path');
    assert.strictEqual(paths[0], paths[2], 'hit colors reuse cached geometry');
    drawRock(context, 0x1234abcd, 56);
    assert.notStrictEqual(paths[0], paths[4], 'radius changes regenerate procedural geometry');
  } finally {
    if (nativePath === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = nativePath;
  }
});

test('unknown/None species draw nothing and malformed inputs never create nonfinite commands', () => {
  assert.deepEqual(record(context => drawSpecies(context, 0, 1, 25, 0)), []);
  assert.deepEqual(record(context => drawSpecies(context, 99, 1, 25, 0)), []);
  for (let species = 1; species <= 22; species++) for (const radius of [0, -3, NaN, Infinity]) {
    const ops = record(context => drawSpecies(context, species, 0xffffffff, radius, NaN, NaN));
    assert.ok(ops.length, `species ${species} draws`);
    for (const op of ops) for (const value of op.slice(1)) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${op}`);
  }
});

test('active/attack animation blends match original component84/104', async () => {
  const native = await originalArt();
  for (const activity of [0.2, 0.5, 1]) for (const species of [7, 8, 9, 10, 12, 13]) {
    const context = new ArtContext(), radius = speciesRadii[species];
    drawSpecies(context, species, 17, radius, 617, 0.4, { activity: Math.fround(activity) });
    assertArtClose(context.paints, native(species, 17, radius, 617, 0.4, 0, Math.fround(activity)), `species ${species}, activity ${activity}`);
  }
  const context = new ArtContext(); drawSpecies(context, 22, 17, 25, 5000, 0.4, { legPhase: 617.25 });
  assertArtClose(context.paints, native(22, 17, 25, 5000, 0.4, 617.25), 'dispatcher spider phase');
});

test('species artwork composes native f32 transforms under a rotated camera matrix', async () => {
  const native = await originalArt();
  for (const matrix of [[0.600205, 0, 0, 0.600205, 640, 360], [0.5, 0.3, -0.3, 0.5, -107.25, 613.5]]) {
    for (let species = 1; species <= 22; species++) {
      const context = new ArtContext(); context.setTransform(...matrix.map(Math.fround));
      drawSpecies(context, species, 0xfabc0123, speciesRadii[species], 417, 0.4);
      assertArtClose(context.paints, native(species, 0xfabc0123, speciesRadii[species], 417, 0.4, 0, 0, matrix), `transformed species ${species}`);
    }
  }
});

test('golden Path2D shell commands match recovered static geometry without handle fixtures', async () => {
  for (const scene of ['garden-idle', 'move', 'attack', 'equip', 'damage', 'death', 'spawn']) {
    const trace = JSON.parse(await readFile(new URL(`../../tests/parity/golden/${scene}/canvas.json`, import.meta.url), 'utf8'));
    const shell = trace.paths.find(path => path.ops.some(op => op[0] === 'arc' && op[3] === 30 && Math.abs(op[4] - 0.6) < 1e-4));
    assert.ok(shell, `${scene} contains the native shared shell path`);
    const context = new ArtContext(); drawSpecies(context, 4, 1234567, 30, 0);
    const fill = context.paints.find(paint => paint.op === 'fill' && paint.commands.some(([name]) => name === 'closePath'));
    assertArtClose(fill.commands.map(([name, args]) => [name, ...args]), shell.ops, `${scene} shell`);
  }
});

test('native-capable player eyes emit stretched arc transforms instead of ellipses', () => {
  const context = new ArtContext(); drawPlayerFace(context);
  assert.ok(!context.ops.some(op => op[0] === 'ellipse'));
  const eyes = context.paints.filter(paint => paint.op === 'fill' && paint.color?.[0] === 34);
  assert.equal(eyes.length, 2);
  assert.deepEqual(eyes[0].commands[0], ['arc', [0, 0, 3, 0, TAU, false], [1, 0, 0, 2, -7, -5]]);
  const highlights = context.paints.filter(paint => paint.op === 'fill' && paint.color?.[0] === 238);
  assert.deepEqual(highlights[0].commands[0][2], [1, 0, 0, 1, -7, -5]);
  assert.equal(context.stack.length, 0);
});

test('player face uses native1100/690 Canvas save structure and leaves the native mouth matrix', async () => {
  const native = await originalArt();
  for (const matrix of [[1,0,0,1,0,0], [0.600205,0,0,0.600205,642.2958984375,359.9183349609375],
    [0.5,0.3,-0.3,0.5,-107.25,613.5]].map(matrix => matrix.map(Math.fround)))
    for (const options of [{deltaMs:16}, {deltaMs:40,attacking:true}, {deltaMs:40,expressionFlags:1},
      {deltaMs:40,dead:true}, {deltaMs:16,model:1}, {deltaMs:40,expressionFlags:4}]) {
      const initial = createPlayerFaceState(), state = structuredClone(initial);
      const { context, raw } = playerBridge(matrix, 0.35);
      drawPlayerFace(context, { ...options, state });
      const expected = native.player(initial, options, matrix, 0.35);
      const label = JSON.stringify({matrix,options});
      assert.deepEqual(raw.ops.map(op => op[0]), expected.ops.slice(1).map(op => op[0]), `native command structure ${label}`);
      assertArtClose(raw.ops, expected.ops.slice(1), `native commands ${label}`, 1e-7);
      assertArtClose(raw.paints, expected.paints, `native face paints ${label}`);
      assert.deepEqual(context.getTransform(), expected.matrix, `native final mouth matrix ${label}`);
      assert.equal(raw.stack.length, 0);
    }
});

test('standalone player wrapper preserves caller state and adds only its requested save pair', async () => {
  const native = await originalArt(), initial = createPlayerFaceState();
  const matrix = [0.5,0.3,-0.3,0.5,-107.25,613.5].map(Math.fround);
  const { context, raw } = playerBridge(matrix, 0.35);
  const inherited = structuredClone(raw.state);
  drawPlayerFace(context, { state: structuredClone(initial), deltaMs: 16, preserveContext: true });
  const expected = native.player(initial, { deltaMs:16 }, matrix, 0.35);
  assert.deepEqual(raw.ops[0], ['save']);
  assert.deepEqual(raw.ops.at(-1), ['restore']);
  assert.deepEqual(raw.ops.slice(1,-1).map(op => op[0]), expected.ops.slice(1).map(op => op[0]));
  assert.deepEqual(context.getTransform(), matrix);
  assert.deepEqual(raw.state, inherited);
  assert.equal(raw.stack.length, 0);
});

test('bee and hornet stripes compose every native410 matrix independently in f32', async () => {
  const native = await originalArt();
  for (const matrix of [[0.600205,0,0,0.600205,640,360], [0.5,0.3,-0.3,0.5,-107.25,613.5],
    [-0.7,-0.2,0.2,-0.7,1234.567,-987.654]].map(matrix => matrix.map(Math.fround)))
    for (const species of [6,14]) {
      const context = new ArtContext(); context.setTransform(...matrix);
      drawSpecies(context, species, 0x1234abcd, speciesRadii[species], 0);
      const expected = native(species, 0x1234abcd, speciesRadii[species], 0, 0, 0, 0, matrix);
      assert.deepEqual(context.paints.filter(paint => paint.op === 'fillRect'),
        expected.filter(paint => paint.op === 'fillRect'), `native410 stripe matrices species ${species}, ${matrix}`);
      assertArtClose(context.paints, expected, `native410 caller restoration species ${species}`);
      assert.equal(context.ops.filter(op => op[0] === 'save').length, 1, 'only the native outer ellipse clip save');
    }
});

test('legacy transform-only bee bridges add no per-stripe Canvas saves', () => {
  const context = new ArtContext(); context.getTransform = undefined;
  drawBee(context);
  assert.equal(context.ops.filter(op => op[0] === 'save').length, 1, 'native outer ellipse clip only');
  assert.equal(context.ops.filter(op => op[0] === 'restore').length, 1);
  assert.equal(context.ops.filter(op => op[0] === 'localTransform').length, 3);
  assert.equal(context.paints.filter(paint => paint.op === 'fillRect').length, 3);
});

test('wing opacity multiplies inherited entity fade instead of replacing it', async () => {
  const native = await originalArt();
  for (const species of [9, 10]) {
    const context = new ArtContext(); context.setGlobalAlpha(0.35);
    drawSpecies(context, species, 17, speciesRadii[species], 417, 0.4);
    assertArtClose(context.paints, native(species, 17, speciesRadii[species], 417, 0.4, 0, 0, [1, 0, 0, 1, 0, 0], 0.35), `fading species ${species}`);
    assert.equal(context.getGlobalAlpha(), 0.35);
  }
});

test('player idle, attack, hit, defend, death and moving gaze match native1100/690', async () => {
  const native = await originalArt();
  const initial = createPlayerFaceState();
  const cases = [
    { deltaMs: 0 }, { deltaMs: 40 }, { deltaMs: 40, attacking: true },
    { deltaMs: 16, defending: true }, { deltaMs: 40, flash: 0.4 },
    { deltaMs: 40, flash: 1 }, { deltaMs: 40, dead: true },
    { deltaMs: 16, lookAngle: Math.PI * 0.73 },
    { deltaMs: 40, expressionFlags: 1 }, { deltaMs: 40, expressionFlags: 2 },
    { deltaMs: 40, expressionFlags: 4 }, { deltaMs: 40, extraAction: true },
    { deltaMs: 40, attacking: true, defending: true, flash: 0.9, expressionFlags: 5 },
  ];
  const failures = [];
  for (const options of cases) {
    const state = structuredClone(initial), context = new ArtContext();
    drawPlayerFace(context, { ...options, state });
    const expected = native.player(initial, options);
    try {
      assertArtClose(context.paints, expected.paints, JSON.stringify(options));
      assertArtClose(state, expected.state, `state ${JSON.stringify(options)}`, 1e-7);
    } catch (error) { failures.push(error.message); }
    assert.equal(context.stack.length, 0);
  }
  assert.equal(failures.length, 0, failures.join('\n'));
});

test('player models, expression masks and action combinations match original state and paints', async () => {
  const native = await originalArt();
  const initial = { gaze: [{x:0.2,y:-0.4},{x:-0.7,y:0.3}], mouthCurve: -3,
    eyeExpression: 0.5, attackAmount: 0.25, defendAmount: 0.75 };
  for (const model of [0, 1]) for (let expressionFlags = 0; expressionFlags < 8; expressionFlags++)
    for (let actions = 0; actions < 16; actions++) {
      const options = { model, expressionFlags, dead: !!(actions & 1), attacking: !!(actions & 2),
        defending: !!(actions & 4), extraAction: !!(actions & 8),
        deltaMs: actions & 1 ? 40 : 0, lookAngle: (expressionFlags - 4) * 0.7,
        flash: actions % 5 * 0.25, flashTarget: {r:255,g:32,b:0}, grayscale: !!(expressionFlags & 1) };
      const state = structuredClone(initial), context = new ArtContext();
      drawPlayerFace(context, { ...options, state });
      const expected = native.player(initial, options);
      const label = JSON.stringify(options);
      assertArtClose(context.paints, expected.paints, label);
      assertArtClose(state, expected.state, `state ${label}`, 1e-7);
      assert.equal(context.stack.length, 0);
    }
});

test('player gaze, expression and colours retain native state through consecutive frames', async () => {
  const native = await originalArt();
  for (const model of [0, 1]) {
    const state = createPlayerFaceState();
    let expectedState = structuredClone(state);
    for (const options of [
      { deltaMs: 16, expressionFlags: 1, lookAngle: 0.4 },
      { deltaMs: 40, attacking: true, defending: true, flash: 0.6180339, lookAngle: -2.3 },
      { deltaMs: 200, expressionFlags: 0, lookAngle: 1.4 },
      { deltaMs: 1000, expressionFlags: 0, lookAngle: Math.PI },
      { deltaMs: 16, expressionFlags: 1, dead: true },
      { deltaMs: 40, expressionFlags: 5, grayscale: true },
    ]) {
      const matrix = [0.5, 0.3, -0.3, 0.5, -107.25, 613.5];
      const context = new ArtContext(); context.setTransform(...matrix.map(Math.fround)); context.setGlobalAlpha(0.35);
      drawPlayerFace(context, { ...options, model, state });
      const expected = native.player(expectedState, { ...options, model }, matrix, 0.35);
      const label = `model ${model}, ${JSON.stringify(options)}`;
      assertArtClose(context.paints, expected.paints, label);
      assertArtClose(state, expected.state, `state ${label}`, 1e-7);
      assert.equal(context.getGlobalAlpha(), 0.35);
      assert.equal(context.stack.length, 0);
      expectedState = expected.state;
    }
  }
});

test('player f32 colour truncation and expression cutoff agree with original boundaries', async () => {
  const native = await originalArt();
  for (const amount of [0, 1e-8, 0.137, 0.2712345, 0.5, 0.6180339, 0.8999, 0.9, 0.9001, 1])
    for (const eyeExpression of [0.00009999, 0.0001, 0.00010001, 0.5]) {
      const initial = { gaze: [{x:0.1,y:0.2},{x:-0.3,y:-0.4}], mouthCurve: 2,
        eyeExpression, attackAmount: Math.fround(amount), defendAmount: Math.fround(1 - amount) };
      const options = { deltaMs: 0, flash: amount, expressionFlags: 5,
        flashTarget: {r:19,g:187,b:241} };
      const state = structuredClone(initial), context = new ArtContext();
      drawPlayerFace(context, { ...options, state });
      const expected = native.player(initial, options);
      assertArtClose(context.paints, expected.paints, `player boundary ${amount}, expression ${eyeExpression}`);
      assertArtClose(state, expected.state, `player boundary state ${amount}, expression ${eyeExpression}`, 1e-7);
    }
});

test('health green ratio, red trail and visibility match isolated original763 strokes', async () => {
  const native = await originalArt();
  for (const immediate of [false, true]) for (const grayscale of [false, true]) {
    const state = createPlayerHealthBarState();
    let expectedState = structuredClone(state);
    for (const [ratio, deltaMs] of [[1,0],[0.5,40],[0.5,16],[0.5,200],[0.1,40],[0.1,1000],
      [0.75,16],[1,40],[0,40],[0,1000],[0.01,16],[0.9999,40]]) {
      const options = { deltaMs, immediate, grayscale };
      const expected = await native.health(expectedState, ratio, options);
      const context = new ArtContext(); context.setTransform(...expected.paints[0].commands[0][2]);
      drawPlayerHealthBar(context, ratio, { ...options, state });
      const label = `health ${ratio}, ${JSON.stringify(options)}`;
      assertArtClose(context.paints, expected.paints, label);
      assertArtClose(state, expected.state, `state ${label}`, 1e-7);
      assert.equal(context.getGlobalAlpha(), 1);
      assert.equal(context.stack.length, 0);
      expectedState = expected.state;
    }
  }
  assert.deepEqual(createPlayerHealthBarState(), native.initialHealthState, 'native constructor initializes all three health fields to zero');
  assert.deepEqual(createPlayerHealthBarState(), native.constructedHealthState, 'original491 constructor, independent of supplied renderer state');
  assert.equal(native.initialHealthImmediate, 1, 'native new-entity visual+16 requests an immediate first draw');
});

test('health emits native alpha before lineCap and fresh immediate health retains a full red trail', async () => {
  const native = await originalArt(), state = createPlayerHealthBarState();
  let expectedState = structuredClone(native.constructedHealthState ?? state);
  for (let frame = 0; frame < 210; frame++) {
    const ratio = frame < 180 ? 1 : Math.fround(0.50145824);
    const options = { deltaMs: 16, immediate: frame === 0 };
    const expected = await native.health(expectedState, ratio, options);
    const context = new ArtContext(); context.setTransform(...expected.paints[0].commands[0][2]);
    drawPlayerHealthBar(context, ratio, { ...options, state });
    assertArtClose(state, expected.state, `health lifetime frame ${frame}`, 1e-7);
    assertArtClose(context.paints, expected.paints, `health lifetime paints ${frame}`);
    if (frame === 0) assert.deepEqual(state, { healthRatio: 1, trailingRatio: 1, alpha: 0 },
      'native fresh visual initializes ratios to full health without showing the bar');
    if (frame === 180) {
      assert.equal(state.trailingRatio, 1, 'red endpoint is 35 after settled full-health history');
      for (const ops of [expected.ops, context.ops]) {
        const width = ops.findIndex(op => op[0] === '=lineWidth' && op[1] === 10);
        assert.deepEqual(ops.slice(width - 2, width), [['=globalAlpha', state.alpha], ['=lineCap', 'round']]);
      }
    }
    expectedState = expected.state;
  }
});

test('health damage holds the red trail until green catches up and preserves inherited opacity', async () => {
  const native = await originalArt();
  const state = { healthRatio: 1, trailingRatio: 1, alpha: 0 };
  let expectedState = structuredClone(state);
  for (let frame = 0; frame < 48; frame++) {
    const ratio = frame < 32 ? Math.fround(0.50145824) : 0.8;
    const deltaMs = 16, options = { deltaMs }, inheritedAlpha = 0.35;
    const expected = await native.health(expectedState, ratio, options, inheritedAlpha);
    const context = new ArtContext(); context.setGlobalAlpha(inheritedAlpha);
    context.setTransform(...expected.paints[0].commands[0][2]);
    drawPlayerHealthBar(context, ratio, { ...options, state });
    assertArtClose(context.paints, expected.paints, `damage/heal frame ${frame}`);
    assertArtClose(state, expected.state, `damage/heal state ${frame}`, 1e-7);
    assert.equal(context.getGlobalAlpha(), inheritedAlpha);
    assert.equal(context.stack.length, 0);
    if (frame === 0) {
      assert.equal(state.trailingRatio, 1, 'red stays at the pre-hit ratio');
      assert.ok(state.healthRatio < 1 && state.healthRatio > ratio, 'green eases toward damage');
    }
    if (frame === 31) assert.ok(state.trailingRatio < 1, 'red eventually follows green');
    expectedState = expected.state;
  }
});

test('health visibility eases per render while ratio easing uses delta and thin ends fade', async () => {
  const native = await originalArt();
  for (const deltaMs of [0, 1, 16, 40, 1000]) for (const ratio of [0, 0.01, 0.9999, 1, 1.25]) {
    const state = { healthRatio: 0.01, trailingRatio: 0.02, alpha: 0.5 };
    const expected = await native.health(structuredClone(state), ratio, { deltaMs });
    const context = new ArtContext(); context.setTransform(...expected.paints[0].commands[0][2]);
    drawPlayerHealthBar(context, ratio, { state, deltaMs });
    assertArtClose(context.paints, expected.paints, `health boundary ${ratio}, delta ${deltaMs}`);
    assertArtClose(state, expected.state, `health boundary state ${ratio}, delta ${deltaMs}`, 1e-7);
    assert.equal(state.alpha, Math.fround(ratio > 0 && ratio < 1 ? 0.6 : 0.4));
  }
});
