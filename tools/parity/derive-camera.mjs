#!/usr/bin/env node
/**
 * Derive a per-scene camera recording from the archived-client golden.
 *
 * The golden Canvas2D trace keeps the last `captureFrames` frames (the rolling
 * buffer added for R19.1), so `frames.at(-1)` is the frame the PNG screenshot
 * was taken from. For each recorded frame:
 *
 *   - the player block (world-scale transform + `arc(0,0,25)` + `#FFE763`)
 *     gives the player's screen position and pixels-per-world;
 *   - the world grid (50-unit cells, drawn at x+0.5) gives the camera centre
 *     modulo 50 on both axes;
 *   - the engine's per-tick player trace at `frame.time - 120 ms` gives the
 *     absolute anchor for that grid phase.
 *
 * The PNG screenshot is decoded as an independent check: the yellow player
 * face gives a screen-space anchor and the arena band edge (world x = -25000)
 * gives an absolute camera x. The PNG edge has a ~1 px anti-aliasing bias, so
 * it is only used when the trace/engine anchor is unavailable.
 *
 * Usage:
 *   node tools/parity/derive-camera.mjs --all                 # report only
 *   node tools/parity/derive-camera.mjs --all --write         # write camera.json
 *   node tools/parity/derive-camera.mjs --scenario move --write
 *
 * A stale golden (trace frames do not end at the screenshot frame) is reported
 * and never written unless --allow-stale is passed.
 */
import path from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { scenarios, BOOT_FRAMES } from './scenarios.mjs';
import { recoverCameraProjection, gridPhase } from './camera-projection.mjs';

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const repoRoot = path.resolve('.');
const scenarioNames = ['boot-menu', 'garden-idle', 'move', 'attack', 'equip', 'damage', 'death', 'spawn'];
const selectedNames = args.filter((value, index) => index > 0 && args[index - 1] === '--scenario');
const selected = selectedNames.length ? selectedNames : scenarioNames;
const frameMs = 16;
const interpolationMs = 120;
const viewport = { width: 1280, height: 720 };
const ARENA_LEFT = -25000;
const OUTSIDE = [26, 150, 87];   // #1A9657
const ARENA = [30, 167, 97];     // #1EA761
const YELLOW = [255, 231, 99];   // #FFE763

const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const snapToPhase = (anchor, phase) => phase + 50 * Math.round((anchor - phase) / 50);

/** Minimal PNG decoder: 8-bit RGB, non-interlaced (the parity screenshots). */
function readPng(filename) {
  const bytes = readFileSync(filename);
  let cursor = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (cursor < bytes.length) {
    const length = bytes.readUInt32BE(cursor);
    const type = bytes.toString('ascii', cursor + 4, cursor + 8);
    const data = bytes.subarray(cursor + 8, cursor + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error(`${filename}: interlaced PNG is unsupported`);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    cursor += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 2) {
    throw new Error(`${filename}: expected 8-bit RGB, got ${bitDepth}/${colorType}`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  const pixels = Buffer.alloc(stride * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++];
    const source = raw.subarray(offset, offset + stride);
    offset += stride;
    const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    const line = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= 3 ? line[x - 3] : 0;
      const above = previous === null ? 0 : previous[x];
      const upperLeft = previous !== null && x >= 3 ? previous[x - 3] : 0;
      let value = source[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += above;
      else if (filter === 3) value += (left + above) >> 1;
      else if (filter === 4) {
        const estimate = left + above - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const aboveDistance = Math.abs(estimate - above);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        value += leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
          ? left : (aboveDistance <= upperLeftDistance ? above : upperLeft);
      }
      line[x] = value & 255;
    }
  }
  return { width, height, pixels };
}

const pixel = (image, x, y) => {
  const offset = (y * image.width + x) * 3;
  return [image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2]];
};
const near = (color, target, tolerance) =>
  Math.abs(color[0] - target[0]) <= tolerance
  && Math.abs(color[1] - target[1]) <= tolerance
  && Math.abs(color[2] - target[2]) <= tolerance;

/** Yellow player disc: nearest round component to the traced player screen. */
function findPlayerCentre(image, expected) {
  const { width, height, pixels } = image;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
      if (red > 245 && green >= 215 && green <= 240 && blue >= 85 && blue <= 115) mask[y * width + x] = 1;
    }
  }
  const components = [];
  const stack = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (mask[start] === 0) continue;
      mask[start] = 0;
      stack.push(start);
      let count = 0, sumX = 0, sumY = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      while (stack.length > 0) {
        const index = stack.pop();
        const px = index % width;
        const py = (index - px) / width;
        count += 1;
        sumX += px;
        sumY += py;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] === 0) continue;
          mask[next] = 0;
          stack.push(next);
        }
      }
      if (count >= 60) {
        const centre = { x: sumX / count, y: sumY / count, area: count };
        const boxWidth = maxX - minX + 1, boxHeight = maxY - minY + 1;
        centre.aspect = boxWidth / boxHeight;
        centre.box = { width: boxWidth, height: boxHeight };
        components.push(centre);
      }
    }
  }
  if (components.length === 0) return null;
  let best = null, bestScore = Infinity;
  for (const component of components) {
    const roundness = Math.abs(Math.log(Math.max(1e-6, component.aspect)));
    const distance = expected === null
      ? Math.hypot(component.x - image.width / 2, component.y - image.height / 2)
      : Math.hypot(component.x - expected.x, component.y - expected.y);
    // The camera follows the player, so the avatar is within a few hundred
    // pixels of the viewport centre in every game scene. This rejects UI
    // icons (equip's top-right petal slot) and off-screen mobs.
    if (distance > 200) continue;
    const sizePenalty = Math.abs(Math.log(component.area / 700));
    const score = distance * 2 + roundness * 6 + sizePenalty;
    if (score < bestScore) { bestScore = score; best = component; }
  }
  return best;
}

/** First vertical #1A9657 -> #1EA761 edge (world x = -25000). */
function findArenaEdge(image) {
  const edges = [];
  for (let y = 80; y <= 560; y += 16) {
    for (let x = 2; x < image.width - 4; x++) {
      const before = pixel(image, x - 1, y);
      const current = pixel(image, x, y);
      if (!near(before, OUTSIDE, 2)) continue;
      if (!near(pixel(image, x + 2, y), ARENA, 3)) continue;
      if (!near(pixel(image, x + 3, y), ARENA, 3)) continue;
      const coverage = Math.max(0, Math.min(1,
        (current[1] - OUTSIDE[1]) / (ARENA[1] - OUTSIDE[1])));
      if (!near(current, OUTSIDE, 2) && !near(current, ARENA, 3) && coverage <= 0) continue;
      edges.push(x + (1 - coverage));
      break;
    }
  }
  if (edges.length < 5) return null;
  edges.sort((left, right) => left - right);
  return edges[Math.floor(edges.length / 2)];
}

function canvasFor(scene) {
  return JSON.parse(readFileSync(path.join(repoRoot, 'tests/parity/golden', scene, 'canvas.json'), 'utf8'));
}
function engineFor(scene) {
  const filename = path.join(repoRoot, 'tests/parity/engine', `${scene}.json`);
  return existsSync(filename) ? JSON.parse(readFileSync(filename, 'utf8')) : null;
}
function screenshotFor(scene) {
  const filename = path.join(repoRoot, 'tests/parity/golden', scene, 'screenshot.png');
  return existsSync(filename) ? readPng(filename) : null;
}

function findPlayer(ops) {
  for (let index = 0; index < ops.length; index++) {
    const op = ops[index];
    if (op[1] !== 'arc' || op[2][2] !== 25) continue;
    let transform = null;
    for (let cursor = index - 1; cursor > index - 24; cursor--) {
      if (ops[cursor][1] === 'setTransform') { transform = ops[cursor][2]; break; }
    }
    if (transform === null || transform[0] < 0.4 || transform[0] > 0.8) continue;
    // The avatar is the only radius-25 arc under a world-scale transform in
    // these scenes; the fill changes under the hit flash (#FFE763 -> white /
    // red) and the face becomes a triangle during the attack pose, so neither
    // can be used as the identity. The camera keeps the player near the centre.
    if (Math.abs(transform[4] - viewport.width / 2) > 240
        || Math.abs(transform[5] - viewport.height / 2) > 240) continue;
    return { index, scale: transform[0], screenX: transform[4], screenY: transform[5] };
  }
  return null;
}

function findGrid(ops) {
  let start = -1;
  for (let index = 0; index < ops.length; index++) {
    const op = ops[index];
    if (op[1] === '=globalAlpha' && Math.abs(op[2][0] - 0.060021) < 1e-4) { start = index; break; }
  }
  if (start < 0) return null;
  let x = null, y = null, step = null, previousX = null;
  for (let index = start; index < Math.min(start + 320, ops.length); index++) {
    const op = ops[index];
    if (op[1] !== 'moveTo') continue;
    const [px, py] = op[2];
    if (py === 0.5) {
      if (x === null) x = px;
      else if (step === null && px > previousX) step = px - previousX;
      previousX = px;
    } else if (px === 0.5 && y === null) {
      y = py;
    }
  }
  return x === null || y === null ? null : { x, y, step };
}

/** First horizontal arena band fill width: screen x of world x = -25000. */
function findArenaBand(ops) {
  for (let index = 0; index < 36; index++) {
    const op = ops[index];
    if (op[1] !== 'setTransform') continue;
    const [a, b, c, d, e, f] = op[2];
    if (b !== 0 || c !== 0 || d !== viewport.height || e !== 0 || f !== 0) continue;
    if (a > 0 && a < viewport.width) return a;
  }
  return null;
}

function captureStartFrame(scene) {
  const scenario = scenarios.find(item => item.name === scene);
  if (scenario === undefined) throw new Error(`unknown scenario ${scene}`);
  let frame = BOOT_FRAMES;
  let capture = null;
  for (const step of scenario.steps) {
    if (step.advance) frame += step.advance;
    if (step.reset) capture = frame + 1;
  }
  return capture ?? 1;
}

function enginePlayerAt(engine, time) {
  if (engine === null || engine.trace === undefined) return null;
  const samples = Object.values(engine.trace)
    .map(sample => ({ at: sample.at, player: sample.original ?? sample }))
    .filter(sample => sample.player.playerValid)
    .sort((left, right) => left.at - right.at);
  if (samples.length === 0) return null;
  if (time <= samples[0].at) return { x: samples[0].player.playerX, y: samples[0].player.playerY, at: samples[0].at };
  for (let index = 1; index < samples.length; index++) {
    const after = samples[index];
    if (time > after.at) continue;
    const before = samples[index - 1];
    const fraction = (time - before.at) / Math.max(1, after.at - before.at);
    return {
      x: before.player.playerX + (after.player.playerX - before.player.playerX) * fraction,
      y: before.player.playerY + (after.player.playerY - before.player.playerY) * fraction,
      at: time,
      from: before.at,
      to: after.at,
    };
  }
  const last = samples[samples.length - 1];
  return { x: last.player.playerX, y: last.player.playerY, at: last.at };
}

function deriveScene(scene) {
  const canvas = canvasFor(scene);
  const engine = engineFor(scene);
  const image = screenshotFor(scene);
  const allFrames = canvas.frames ?? [];
  const digests = canvas.frameDigests ?? [];
  const screenshotDigest = digests.length === 0 ? null : digests[digests.length - 1];
  const lastTraceTime = allFrames.length === 0 ? null : allFrames[allFrames.length - 1].time;
  const stale = screenshotDigest !== null && lastTraceTime !== null
    && Math.abs(lastTraceTime - screenshotDigest.time) > frameMs / 2;
  // With the rolling trace buffer the last three frames are the screenshot
  // window. With an old first-three capture they are not, so do not pretend.
  const frames = allFrames.slice(-3);
  const tracePlayer = frames.length === 0 ? null : findPlayer(frames[frames.length - 1].ops);
  const pngPlayer = image === null ? null : findPlayerCentre(image, tracePlayer === null
    ? null : { x: tracePlayer.screenX, y: tracePlayer.screenY });
  const pngArenaEdge = image === null ? null : findArenaEdge(image);

  const derived = frames.map((frame, index) => {
    const ops = frame.ops;
    const player = findPlayer(ops);
    const grid = findGrid(ops);
    const arenaBand = findArenaBand(ops);
    const zoom = grid?.step ? grid.step / 50 : (player?.scale ?? 0.6);
    const captureTime = typeof frame.time === 'number' ? frame.time : (captureStartFrame(scene) + index) * frameMs;
    const playerSample = enginePlayerAt(engine, captureTime - interpolationMs);
    const phaseX = grid === null ? null : mod(640 / zoom - (grid.x - 0.5) / zoom, 50);
    const phaseY = grid === null ? null : mod(360 / zoom - (grid.y - 0.5) / zoom, 50);
    const isScreenshotFrame = index === frames.length - 1;
    let screenX = player?.screenX ?? null;
    let screenY = player?.screenY ?? null;
    let playerSource = player === null ? 'none' : 'trace';
    // Pixel centroids are diagnostics only. The immutable trace is the
    // subpixel evidence and cannot be replaced by a rasterized face centroid.
    let cameraX = null;
    let cameraY = null;
    let sourceX = 'fallback';
    let sourceY = 'fallback';
    if (arenaBand !== null) {
      // Exact: the archived band fill's width is the screen x of world -25000.
      cameraX = ARENA_LEFT + (viewport.width / 2 - arenaBand) / zoom;
      sourceX = 'arena-band';
    }
    if (cameraX === null && playerSample !== null && screenX !== null && phaseX !== null) {
      cameraX = snapToPhase(playerSample.x + (viewport.width / 2 - screenX) / zoom, phaseX);
      sourceX = `player+${playerSource}+grid`;
    }
    if (playerSample !== null && screenY !== null && phaseY !== null) {
      cameraY = snapToPhase(playerSample.y + (viewport.height / 2 - screenY) / zoom, phaseY);
      sourceY = `player+${playerSource}+grid`;
    }
    if (cameraX === null && isScreenshotFrame && pngArenaEdge !== null && phaseX !== null) {
      // The PNG edge is a fallback: anti-aliasing biases it by about one pixel.
      cameraX = snapToPhase(ARENA_LEFT + (viewport.width / 2 - pngArenaEdge) / zoom, phaseX);
      sourceX = 'png-arena+grid';
    }
    if (cameraY === null && phaseY !== null) {
      cameraY = snapToPhase(cameraY ?? phaseY, phaseY);
      sourceY = 'grid-only';
    }
    if (cameraX === null && phaseX !== null) { cameraX = phaseX; sourceX = 'grid-only'; }
    if (cameraY === null) { cameraY = 0; sourceY = 'menu-fallback'; }
    if (cameraX === null) { cameraX = 0; sourceX = 'menu-fallback'; }
    const recovered = recoverCameraProjection(frame, { x: cameraX, y: cameraY });
    if (recovered !== null) {
      cameraX = recovered.x;
      cameraY = recovered.y;
      sourceX = sourceY = recovered.source;
    }
    const measuredZoom = recovered?.zoom ?? zoom;
    const predictedGridX = grid === null ? null : gridPhase(cameraX, viewport.width, measuredZoom);
    const predictedGridY = grid === null ? null : gridPhase(cameraY, viewport.height, measuredZoom);
    return {
      x: cameraX,
      y: cameraY,
      zoom: measuredZoom,
      source: { x: sourceX, y: sourceY },
      captureTime,
      entityOffsetX: 0,
      entityOffsetY: 0,
      screenshotFrame: isScreenshotFrame,
      playerScreen: screenX === null ? null : { x: screenX, y: screenY },
      playerScreenSource: playerSource,
      grid: grid === null ? null : { x: grid.x, y: grid.y, step: grid.step },
      gridError: grid === null ? null : {
        x: Math.round((predictedGridX - grid.x) * 1e6) / 1e6,
        y: Math.round((predictedGridY - grid.y) * 1e6) / 1e6,
      },
      playerWorld: playerSample === null ? null : {
        x: Math.round(playerSample.x * 1000) / 1000,
        y: Math.round(playerSample.y * 1000) / 1000,
      },
      arenaBand,
      png: { player: pngPlayer, arenaLeftEdge: pngArenaEdge },
      gridPhase: { x: phaseX, y: phaseY },
    };
  });

  const hasWorld = frames.some(frame => {
    const player = findPlayer(frame.ops);
    return player !== null || findGrid(frame.ops) !== null;
  });
  return {
    version: 1,
    scenario: scene,
    apply: hasWorld && !stale,
    stale,
    screenshot: {
      traceTime: lastTraceTime,
      digestTime: screenshotDigest?.time ?? null,
      digestIndex: digests.length === 0 ? null : digests.length - 1,
    },
    frameMs,
    captureStartFrame: frames.length === 0
      ? captureStartFrame(scene)
      : (typeof frames[0].frame === 'number' ? frames[0].frame : Math.round(frames[0].time / frameMs)),
    interpolationMs,
    viewport,
    source: `tests/parity/golden/${scene}/canvas.json + tests/parity/golden/${scene}/screenshot.png + tests/parity/engine/${scene}.json`,
    frames: derived,
  };
}

const results = [];
for (const scene of selected) {
  const derived = deriveScene(scene);
  results.push(derived);
  const requestedWrite = flag('--write');
  if (requestedWrite && (!derived.stale || flag('--allow-stale'))) {
    writeFileSync(
      path.join(repoRoot, 'tests/parity/golden', scene, 'camera.json'),
      JSON.stringify(derived, null, 2) + '\n',
    );
  }
}
const summary = results.map(result => {
  const errors = result.frames.flatMap(frame => frame.gridError === null
    ? [] : [Math.abs(frame.gridError.x), Math.abs(frame.gridError.y)]);
  const maxGridError = errors.length === 0 ? null : Math.max(...errors);
  const passed = !result.stale && (result.apply
    ? (maxGridError === null || maxGridError < 0.01)
    : result.scenario === 'boot-menu');
  return {
    scenario: result.scenario,
    stale: result.stale,
    apply: result.apply,
    passed,
    maxGridError,
    screenshot: result.screenshot,
    frames: result.frames.map(frame => ({
      x: Math.round(frame.x * 1000) / 1000,
      y: Math.round(frame.y * 1000) / 1000,
      zoom: Math.round(frame.zoom * 1e9) / 1e9,
      source: frame.source,
      playerScreenSource: frame.playerScreenSource,
      gridError: frame.gridError,
      screenshotFrame: frame.screenshotFrame,
      entityOffsetX: frame.entityOffsetX,
      entityOffsetY: frame.entityOffsetY,
    })),
  };
});
const overall = summary.filter(item => item.scenario !== 'boot-menu');
const maxGridError = Math.max(...overall.map(item => item.maxGridError ?? 0));
const passed = overall.every(item => item.passed);
console.log(JSON.stringify({ write: flag('--write'), passed, maxGridError, scenarios: summary }, null, 2));
if (flag('--strict') && !passed) process.exitCode = 1;
