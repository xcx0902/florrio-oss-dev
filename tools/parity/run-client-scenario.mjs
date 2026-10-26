#!/usr/bin/env node
/**
 * Deterministic Canvas2D baseline for the reconstructed TypeScript client.
 *
 * The original-client runner (`run-scenario.mjs`) replays the archived game.
 * This runner drives `client/public` directly with synthetic domain snapshots
 * and the same virtual clock + Canvas2D recorder. It records the eight scenes
 * that correspond to the original parity scenarios so the new renderer has its
 * own command-level regression baseline.
 *
 * Usage:
 *   node tools/parity/run-client-scenario.mjs --all --update
 *   node tools/parity/run-client-scenario.mjs --all
 *   node tools/parity/run-client-scenario.mjs --scenario damage --repeat 2
 */
import { chromiumExecutable } from '../lib/chromium.mjs';
import http from 'node:http';
import path from 'node:path';
import { evidence } from '../verification-evidence.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const flag = name => args.includes(name);
const root = path.resolve(option('--root', 'client/public'));
const output = path.resolve(option('--out', 'tests/parity/next-ui-v2'));
const update = flag('--update');
const repeat = Math.max(1, Number(option('--repeat', 2)));
const selectedNames = args.filter((value, index) => index > 0 && args[index - 1] === '--scenario');
const viewport = { width: 1280, height: 720 };

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
};
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local.test').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const body = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': mime[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;

async function playwrightPath() {
  if (process.env.PLAYWRIGHT_CORE) return process.env.PLAYWRIGHT_CORE;
  for (const candidate of ['node_modules/playwright-core/index.mjs', 'node_modules/playwright/node_modules/playwright-core/index.mjs']) {
    if (existsSync(candidate)) return path.resolve(candidate);
  }
  throw new Error('playwright-core is required for Canvas2D parity');
}
const { chromium } = await import(pathToFileURL(await playwrightPath()).href);
const chromePath = chromiumExecutable();
const stripExports = source => source.replace(/^export function /gm, 'function ');

function entity(handle, typeId, x, y, extra = {}) {
  return {
    handle, typeId, kind: typeId, speciesId: typeId === 1 ? 0 : 4,
    x, y, angle: 0, health: typeId === 1 ? 100 : 25,
    maxHealth: typeId === 1 ? 100 : 25,
    healthKnown: true, maxHealthKnown: true, level: 1, flags: 0,
    ...extra,
  };
}

function gardenMobs(count = 12, offset = 0) {
  const mobs = [];
  for (let index = 0; index < count; ++index) {
    const angle = (index / count) * Math.PI * 2;
    mobs.push(entity(0x1000 + index + offset, 2,
      Math.cos(angle) * (120 + index * 9), Math.sin(angle) * (90 + index * 7),
      { health: 25 - (index % 5), maxHealth: 25 }));
  }
  return mobs;
}

function petals(count = 5, owner = 0x10) {
  const list = [];
  for (let index = 0; index < count; ++index) {
    const angle = (index / count) * Math.PI * 2;
    list.push(entity(0x2000 + index, 3, Math.cos(angle) * 65, Math.sin(angle) * 65,
      { health: 10, maxHealth: 10, owner }));
  }
  return list;
}

const scenarios = [
  {
    name: 'boot-menu',
    description: 'Empty world, HUD only.',
    entities: [], events: [],
  },
  {
    name: 'garden-idle',
    description: 'Player plus the standard garden population.',
    entities: [entity(0x10, 1, 0, 0), ...gardenMobs(12)], events: [],
  },
  {
    name: 'move',
    description: 'Player displaced right with a camera-following garden.',
    entities: [entity(0x10, 1, 100, 0), ...gardenMobs(12)], events: [],
  },
  {
    name: 'attack',
    description: 'Player with equipped petals and a nearby mob.',
    entities: [entity(0x10, 1, 0, 0), ...petals(5), entity(0x3000, 2, 90, 0)], events: [],
  },
  {
    name: 'equip',
    description: 'Eight equipped petals around the player.',
    entities: [entity(0x10, 1, 0, 0), ...petals(8)], events: [],
  },
  {
    name: 'damage',
    description: 'Damaged player with visual hit events.',
    entities: [entity(0x10, 1, 0, 0, { health: 40, maxHealth: 100 }), ...gardenMobs(4)],
    events: [
      { opcode: 14, handle: 0x10, index: 3 },
      { opcode: 11, handle: 0x1000 },
      { opcode: 9, text: 'ouch' },
    ],
  },
  {
    name: 'death',
    description: 'No player; drops and the surviving garden.',
    entities: [
      entity(0x4000, 4, 20, 10, { health: 1, maxHealth: 1 }),
      entity(0x4001, 4, -30, 20, { health: 1, maxHealth: 1 }),
      ...gardenMobs(6),
    ],
    events: [{ opcode: 9, text: 'You died' }],
  },
  {
    name: 'spawn',
    description: 'A dense spawn wave with forty mobs.',
    entities: [entity(0x10, 1, 0, 0), ...gardenMobs(40)], events: [],
  },
];

const selected = selectedNames.length
  ? selectedNames.map(name => {
    const scenario = scenarios.find(item => item.name === name);
    if (!scenario) throw new Error(`unknown scenario ${name}`);
    return scenario;
  })
  : scenarios;

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-first-run', '--disable-background-networking'],
});
const report = { evidence: await evidence(), generatedAt: new Date().toISOString(), scenarios: [], passed: true };
try {
  for (const scenario of selected) {
    const runs = [];
    for (let run = 0; run < repeat; ++run) {
      // Repeat from a fresh page with the same initial history. Renderer-owned
      // text/arena/menu histories persist naturally throughout each capture.
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
      await page.addInitScript({
        content: stripExports(await readFile(new URL('./deterministic-entropy.js', import.meta.url), 'utf8'))
          + '\ninstallDeterministicEntropy();',
      });
      await page.addInitScript({
        content: stripExports(await readFile(new URL('./virtual-clock.js', import.meta.url), 'utf8'))
          + '\ninstallVirtualClock({ epoch: Date.UTC(2024, 0, 1, 0, 0, 0), frameMs: 16 });',
      });
      await page.addInitScript({
        content: stripExports(await readFile(new URL('./canvas-trace.js', import.meta.url), 'utf8'))
          + '\ninstallCanvasTrace({ captureFrames: 3 });',
      });
      await page.goto(origin + '/index.html', { waitUntil: 'load' });
      await page.evaluate(() => new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
          if (window.__florr !== undefined && document.getElementById('status') === null) resolve(true);
          else if (++attempts > 200) reject(new Error('client boot timeout'));
          else window.__realSetTimeout(check, 50);
        };
        check();
      }));
      await page.evaluate(() => window.__florr.freeze());

      await page.evaluate(data => window.__florr.setSnapshot(data.entities, data.events), scenario);
      // Repeated captures restart the artwork timeline. Menu frames match the
      // archived t=2848/2864/2880 ms window; gameplay fixtures start at t=0.
      await page.evaluate(at => window.__florr.setAnimationTime(at), scenario.name === 'boot-menu' ? 2800 : 0);
      await page.evaluate(() => window.__virtualClock.runFrames(2));
      await page.evaluate(() => window.__canvasTrace.reset({ captureFrames: 3 }));
      await page.evaluate(() => window.__virtualClock.runFrames(3));
      const canvas = await page.evaluate(name => window.__canvasTrace.export({
        scenario: name, viewport: { width: 1280, height: 720 }, frameMs: 16, frames: 3,
      }), scenario.name);
      // Capture only the canvas: the surrounding page has no game DOM, and a
      // full-page screenshot can differ on cursor/font-raster details even when
      // every recorded Canvas2D command is identical.
      const screenshot = await page.locator('#canvas').screenshot({ type: 'png' });
      runs.push({ canvas, screenshot, sha256: createHash('sha256').update(screenshot).digest('hex') });
      await page.close();
    }
    const first = runs[0];
    const deterministic = runs.every(run => run.canvas.digest === first.canvas.digest
      && run.sha256 === first.sha256);
    const directory = path.join(output, scenario.name);
    const entry = {
      name: scenario.name,
      description: scenario.description,
      deterministic,
      canvas: { digest: first.canvas.digest, totalOps: first.canvas.totalOps, frames: first.canvas.frameDigests.length },
      screenshot: { sha256: first.sha256 },
      checks: { deterministic, rendered: first.canvas.totalOps > 0 },
      issues: [],
    };
    if (!entry.checks.rendered) entry.issues.push({ path: 'canvas', message: 'no commands recorded' });
    if (!deterministic) entry.issues.push({ path: 'determinism', message: 'repeated runs differ' });
    if (update) {
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'canvas.json'), JSON.stringify(first.canvas) + '\n');
      await writeFile(path.join(directory, 'screenshot.png'), first.screenshot);
      await writeFile(path.join(directory, 'meta.json'), JSON.stringify({
        scenario: scenario.name, description: scenario.description, viewport, frameMs: 16,
        screenshot: entry.screenshot,
      }, null, 2) + '\n');
      entry.updated = true;
    } else {
      try {
        const expectedCanvas = JSON.parse(await readFile(path.join(directory, 'canvas.json'), 'utf8'));
        const expectedScreenshot = await readFile(path.join(directory, 'screenshot.png'));
        const expectedSha = createHash('sha256').update(expectedScreenshot).digest('hex');
        entry.checks.canvas = expectedCanvas.digest === first.canvas.digest;
        entry.checks.screenshot = expectedSha === first.sha256;
        if (!entry.checks.canvas) entry.issues.push({ path: 'canvas', message: 'canvas digest differs' });
        if (!entry.checks.screenshot) entry.issues.push({ path: 'screenshot', message: 'screenshot differs' });
      } catch (error) {
        entry.issues.push({ path: 'golden', message: `missing golden (${error.message})` });
      }
    }
    entry.passed = entry.issues.length === 0;
    if (!entry.passed) report.passed = false;
    report.scenarios.push(entry);
    console.log(JSON.stringify(entry, null, 2));
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
await mkdir(output, { recursive: true });
await writeFile(path.join(output, selected.length === scenarios.length ? 'report.json' : 'report-partial.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, scenarios: report.scenarios.map(item => ({ name: item.name, passed: item.passed, deterministic: item.deterministic, canvas: item.canvas })) }, null, 2));
if (!report.passed) process.exitCode = 1;
