/** Shared HTTP + Playwright fixture for the split worker/browser tests. */
import { existsSync } from 'node:fs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chromiumExecutable } from '../../../tools/lib/chromium.mjs';

const root = path.resolve(process.env.CLIENT_ROOT || 'client/public');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.map': 'application/json' };
let server;
export let browser;
export let origin;

/** Original beginSnapshot (simulation-tick.mjs 5939–5958) queries a
 * (1920 / viewScale + 200) x (1080 / viewScale + 200) rectangle. A fresh
 * Basic loadout uses f32(0.9), from original func145. These stationary smoke
 * checks use the authoritative player position, not the easing client camera.
 * func192 tests inclusive AABB overlap; func167 includes attached children in
 * a root's bounds, so a visible Centipede may include an off-edge segment. */
export function readPeerVisibleSet() {
  const entities = [...window.__florr.world.all()];
  const byHandle = new Map(entities.map(entity => [entity.handle, entity]));
  const players = entities.filter(entity => entity.kind === 1);
  const player = players[0];
  const scale = Math.fround(0.9);
  const width = Math.fround(Math.fround(1920 / scale) + 200);
  const height = Math.fround(Math.fround(1080 / scale) + 200);
  const bounds = player ? {
    left: Math.fround(Math.fround(width * -0.5) + player.x),
    top: Math.fround(Math.fround(height * -0.5) + player.y),
    width, height,
  } : undefined;
  const rootOf = entity => {
    const seen = new Set([entity.handle]);
    for (;;) {
      const owner = entity.referenceFields?.[23] ?? entity.denseFields?.[23];
      if (!byHandle.has(owner) || seen.has(owner)) return entity.handle;
      seen.add(owner); entity = byHandle.get(owner);
    }
  };
  const groups = new Map();
  for (const entity of entities) {
    const radius = entity.radius ?? 0;
    const left = Math.fround(entity.x - radius), top = Math.fround(entity.y - radius);
    const diameter = Math.fround(radius + radius);
    const box = { left, top, right: Math.fround(left + diameter), bottom: Math.fround(top + diameter) };
    const root = rootOf(entity), previous = groups.get(root);
    groups.set(root, previous ? {
      left: Math.min(previous.left, box.left), top: Math.min(previous.top, box.top),
      right: Math.max(previous.right, box.right), bottom: Math.max(previous.bottom, box.bottom),
    } : box);
  }
  const summarize = entity => ({ handle: entity.handle, kind: entity.kind, x: entity.x, y: entity.y,
    radius: entity.radius, health: entity.health, maxHealth: entity.maxHealth,
    bounds: groups.get(rootOf(entity)) });
  return { count: entities.length, worldCount: window.__florr.world.count,
    players: players.map(summarize), mobs: entities.filter(entity => entity.kind === 2).map(summarize),
    bounds, ui: window.__florr.ui };
}

export function assertPeerVisibleSet(result, phase) {
  const describe = (message, mob) => `${phase}: ${message}; ${JSON.stringify({
    count: result.count, worldCount: result.worldCount, mobCount: result.mobs.length,
    players: result.players, bounds: result.bounds, mob,
  })}`;
  assert.equal(result.count, result.worldCount, describe('the decoded table has a coherent count'));
  assert.equal(result.players.length, 1, describe('the local controlled player is present exactly once'));
  const player = result.players[0];
  assert.ok(Number.isFinite(player.x) && Number.isFinite(player.y), describe('player position is finite'));
  assert.ok(player.health > 0 && player.health <= player.maxHealth, describe('player has live domain health'));
  assert.equal(player.maxHealth, 100, describe('a fresh level-one player has its native maximum health'));
  assert.ok(result.mobs.some(mob => mob.health > 0 && mob.maxHealth >= mob.health),
    describe('the peer receives a nearby live mob, not just its player/loadout'));
  const view = result.bounds;
  for (const mob of result.mobs) {
    assert.ok(Number.isFinite(mob.x) && Number.isFinite(mob.y)
      && Number.isFinite(mob.radius) && mob.radius > 0, describe(`mob ${mob.handle} has real spatial fields`));
    const box = mob.bounds;
    assert.ok(box.right >= view.left && box.left <= Math.fround(view.left + view.width)
      && box.bottom >= view.top && box.top <= Math.fround(view.top + view.height),
    describe(`mob ${mob.handle} and its attached body must overlap the native peer query`, mob));
  }
}

export async function start() {
  const local = ['node_modules/playwright-core/index.mjs', 'node_modules/playwright/node_modules/playwright-core/index.mjs'].find(candidate => existsSync(candidate));
  const playwrightPath = process.env.PLAYWRIGHT_CORE || local;
  if (!playwrightPath) throw new Error('playwright-core is required for client tests');
  const playwright = await import(pathToFileURL(path.resolve(playwrightPath)).href);
  const engineName = process.env.BROWSER || 'chromium';
  const engine = playwright[engineName];
  if (!engine) throw new Error(`unknown Playwright engine ${engineName}`);
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://local.test').pathname);
      if (pathname === '/stream-test-worker.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }).end(`
          self.onmessage = event => {
            const { callbackId } = event.data;
            self.postMessage({ callbackId, finalResponse: false, data: new Uint8Array([1, 2]) });
            self.postMessage({ callbackId, finalResponse: true, data: new Uint8Array([3]) });
          };
        `);
        return;
      }
      const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      const body = await readFile(filename);
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  const chromePath = chromiumExecutable();
  browser = await engine.launch({
    executablePath: engineName === 'chromium' ? chromePath : undefined,
    headless: true,
    args: ['--no-first-run', '--disable-background-networking'],
  });
}

export async function stop() {
  try { await browser?.close(); }
  finally {
    if (server?.listening) await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
}
