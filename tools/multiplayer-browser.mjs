#!/usr/bin/env node
/**
 * M08 real dual-browser acceptance. Every case opens actual Chromium contexts
 * against the online-only dist-multiplayer delivery and a native authoritative
 * server. No fake transport, Worker, WASM or test API is used.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startTestServer } from './lib/test-server.mjs';
import { launchBrowser } from './lib/browser-harness.mjs';
import { startNativeServer } from '../client/tests/support/native-server.mjs';

const root = path.resolve('.');
const http = await startTestServer(path.resolve(process.env.CLIENT_ROOT || 'dist-multiplayer'));
const browser = await launchBrowser();
const cases = [];
const startedAt = new Date().toISOString();

async function player(name, roomId = 'garden', prediction = true, sharedNative = null, closeNative = !sharedNative) {
  const native = sharedNative ?? await startNativeServer(http.origin);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage(), requests = [], errors = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/connection.json', route => route.fulfill({ json: {
    profile: 'network', url: `ws://127.0.0.1:${native.port}/ws`, roomId, prediction } }));
  await page.addInitScript(() => {
    window.Worker = class { constructor() { throw new Error('Online entry constructed a Worker'); } };
  });
  await page.goto(http.origin + '/?test=1&cheat=1');
  await page.waitForFunction(() => document.querySelector('#menu-controls input'));
  await page.evaluate(async () => {
    window.__observedApp = (await import('/main.js')).app;
    window.__observedApp.menuControls.keyboardMovement = true;
  });
  await page.locator('#menu-controls input').fill(name);
  await page.mouse.move(640, 360);
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__observedApp?.session.phase === 'playing', undefined, { timeout: 15000 });
  await page.waitForFunction(() => window.__observedApp.world.playerEntity()?.handle > 0);
  return { native, context, page, requests, errors, closeNative };
}
async function state(client) {
  return client.page.evaluate(() => {
    const app = window.__observedApp, self = app.world.selfState;
    return { phase: app.session.phase, dead: app.session.dead, mode: app.transport.mode, playerId: app.world.controlledPlayerId,
      handle: app.world.playerEntity()?.handle ?? 0, lifeEpoch: self.lifeEpoch, life: self.life, tick: app.network.serverTick,
      sequence: app.world.lastSequence, baseline: app.network.decoder.baselineId,
      roomEpoch: Array.from(app.network.welcome?.roomEpoch ?? []), errors: window.__pageErrors ?? [],
      players: [...app.world.entitiesOfKind(1)].map(entity => ({ owner: entity.ownerPlayerId, handle: entity.handle, name: entity.nickname,
        x: entity.x, y: entity.y, health: entity.health })),
      petals: [...app.world.entitiesOfKind(3)].length, drops: [...app.world.entitiesOfKind(4)].length,
      rows: (app.renderer.resources.panelSurface?.rows ?? []).map(row => row[0]),
      chat: [...app.world.chat], hasDiagnostics: !!window.__florr || !!document.querySelector('#florr-cheat-panel') };
  });
}
async function close(players) { for (const client of players.filter(Boolean)) { await client.context.close(); if (client.closeNative) await client.native.close(); } }
async function pair(a, b, count = 2) {
  for (const client of [a, b]) {
    await client.page.waitForFunction(expected => window.__observedApp.world.entitiesOfKind(1).length === expected, count, { timeout: 30000 });
    await client.page.waitForFunction(() => window.__observedApp.network.clock.sampleCount > 0);
  }
}
async function run(name, fn) {
  const started = Date.now();
  let players = [];
  try {
    await fn(players);
    cases.push({ name, passed: true, durationMs: Date.now() - started });
    console.log(`ok ${cases.length} - ${name}`);
  } catch (error) {
    cases.push({ name, passed: false, durationMs: Date.now() - started, error: error.stack ?? error.message });
    console.error(`not ok ${cases.length} - ${name}: ${error.message}`);
  } finally { /* each case owns its contexts; long-lived pairs close at the end */ }
}
async function meet(a, b) {
  await a.page.keyboard.down('KeyD'); await b.page.keyboard.down('KeyA');
  await a.page.waitForTimeout(3000);
  await a.page.keyboard.up('KeyD'); await b.page.keyboard.up('KeyA');
}
async function openPair(roomA = 'garden', roomB = 'garden', predictionA = true, predictionB = true) {
  const native = await startNativeServer(http.origin);
  const a = await player('Alice', roomA, predictionA, native, false);
  const b = await player('Bob', roomB, predictionB, native, false);
  a.closeNative = true;
  return [a, b];
}

const allStarted = Date.now();
let movementPair;
try {
  await run('01 dual real browser contexts join the same room', async () => {
    movementPair = await openPair();
    const [a, b] = movementPair;
    await meet(a, b);
    const [sa, sb] = [await state(a), await state(b)];
    assert.equal(sa.phase, 'playing'); assert.equal(sb.phase, 'playing');
    assert.equal(sa.mode, 'network'); assert.equal(sb.mode, 'network');
    assert.equal(sa.hasDiagnostics, false); assert.equal(sb.hasDiagnostics, false);
  });
  await run('02 players have unique authoritative identities in one room epoch', async () => {
    const [a, b] = movementPair; const [sa, sb] = [await state(a), await state(b)];
    assert.notEqual(sa.playerId, sb.playerId); assert.notEqual(sa.handle, sb.handle);
    assert.deepEqual(sa.roomEpoch, sb.roomEpoch); assert.ok(sa.roomEpoch.some(byte => byte !== 0));
  });
  await run('03 each client sees both room identities and its own petals', async () => {
    const [a, b] = movementPair;
    for (const client of [a, b]) await client.page.waitForFunction(() => (window.__observedApp.renderer.resources.panelSurface?.rows ?? []).length === 2, undefined, { timeout: 10000 });
    const [sa, sb] = [await state(a), await state(b)];
    assert.deepEqual(sa.rows.sort(), ['Alice', 'Bob']);
    assert.deepEqual(sb.rows.sort(), ['Alice', 'Bob']);
    assert.ok(sa.players.length >= 1 && sb.players.length >= 1);
    assert.ok(sa.players.every(p => p.health > 0)); assert.ok(sa.petals >= 2);
  });
  await run('04 movement on one client is observed by the other', async () => {
    const [a, b] = movementPair; const aState = await state(a);
    const before = (await state(b)).players.find(p => p.owner === aState.playerId);
    await a.page.keyboard.down('KeyA');
    await b.page.waitForFunction(({ owner, x }) => {
      const target = [...window.__observedApp.world.entitiesOfKind(1)].find(entity => entity.ownerPlayerId === owner);
      return target && target.x < x - 25;
    }, { owner: before.owner, x: before.x }, { timeout: 10000 });
    await a.page.keyboard.up('KeyA');
    const after = (await state(b)).players.find(p => p.owner === before.owner);
    assert.ok(after.x < before.x - 25);
  });
  await run('05 real contact combat reduces the opponent health', async () => {
    const [a, b] = movementPair;
    const target = await state(b); const bob = target.players.find(p => p.owner === target.playerId);
    await a.page.keyboard.down('Space');
    const held = new Set(), deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const current = await state(a), opponent = current.players.find(p => p.owner === target.playerId);
      const own = current.players.find(p => p.owner === current.playerId);
      if (!opponent || opponent.health <= 0) break;
      const keys = new Set();
      if (own && opponent.x - own.x > 85) keys.add('KeyD'); else if (own && opponent.x - own.x < 55) keys.add('KeyA');
      if (own && opponent.y - own.y > 12) keys.add('KeyS'); else if (own && opponent.y - own.y < -12) keys.add('KeyW');
      for (const key of held) if (!keys.has(key)) { await a.page.keyboard.up(key); held.delete(key); }
      for (const key of keys) if (!held.has(key)) { await a.page.keyboard.down(key); held.add(key); }
      await a.page.waitForTimeout(50);
    }
    for (const key of held) await a.page.keyboard.up(key);
    await a.page.keyboard.up('Space');
    const after = await state(b), opponent = after.players.find(p => p.owner === after.playerId);
    assert.ok(after.dead || (opponent && opponent.health < bob.health), `Bob health ${bob?.health} -> ${opponent?.health}, dead=${after.dead}`);
  });
  await run('06 death publishes real drops and preserves player identity', async () => {
    const [a, b] = movementPair;
    await b.page.waitForFunction(() => window.__observedApp.session.dead, undefined, { timeout: 10000 });
    const [sa, sb] = [await state(a), await state(b)];
    assert.equal(sb.dead, true); assert.equal(sb.playerId, (await state(b)).playerId);
    assert.ok(sa.drops > 0 || sb.drops > 0, `drops A=${sa.drops} B=${sb.drops}`);
    assert.ok(sb.errors.filter(error => /Worker|wasm/i.test(error)).length === 0);
  });
  await run('07 respawn creates a new handle and life epoch for the same player', async () => {
    const [a, b] = movementPair; const before = await state(b);
    await b.page.waitForFunction(() => { const app = window.__observedApp; return app.world.selfState.life === 3 && app.network.serverTick >= app.world.selfState.nextSpawnTick; });
    await b.page.keyboard.press('Enter');
    await b.page.waitForFunction(() => window.__observedApp.session.phase === 'menu');
    await b.page.keyboard.press('Enter');
    await b.page.waitForFunction(handle => { const app = window.__observedApp;
      return app.session.phase === 'playing' && app.world.playerEntity()?.handle !== handle; }, before.handle, { timeout: 15000 });
    const after = await state(b);
    assert.equal(after.playerId, before.playerId); assert.notEqual(after.handle, before.handle); assert.equal(after.lifeEpoch, 2);
    assert.ok((await state(a)).rows.includes('Bob'));
  });
  await run('08 leaderboard renders both room players on both clients', async () => {
    const [a, b] = movementPair; const [sa, sb] = [await state(a), await state(b)];
    assert.deepEqual(sa.rows.sort(), ['Alice', 'Bob']); assert.deepEqual(sb.rows.sort(), ['Alice', 'Bob']);
  });
  await run('09 chat is delivered only inside the room, not to the other room', async () => {
    const [a, b] = movementPair;
    await a.page.evaluate(async () => window.__observedApp.transport.sendCommand({ kind: 5, text: 'garden-acceptance' }));
    await b.page.waitForFunction(() => window.__observedApp.world.chat.some(line => line.includes('garden-acceptance')));
    const other = await player('Carol', 'other', true, movementPair[0].native, false);
    try {
      const otherState = await state(other), aState = await state(a);
      assert.equal(otherState.chat.some(line => line.includes('garden-acceptance')), false);
      assert.notDeepEqual(otherState.roomEpoch, aState.roomEpoch);
      assert.equal(otherState.players.length, 1);
      await other.page.evaluate(async () => window.__observedApp.transport.sendCommand({ kind: 5, text: 'other-acceptance' }));
      await other.page.waitForFunction(() => window.__observedApp.world.chat.some(line => line.includes('other-acceptance')));
      assert.equal((await state(a)).chat.some(line => line.includes('other-acceptance')), false);
    } finally { await other.context.close(); }
  });
  await run('10 leaving removes the player from the peer view', async () => {
    const [a, b] = await openPair(); const bId = (await state(b)).playerId;
    try {
      await meet(a, b);
      await a.page.waitForFunction(() => (window.__observedApp.renderer.resources.panelSurface?.rows ?? []).some(row => row[0] === 'Bob'), undefined, { timeout: 10000 });
      await b.page.evaluate(async () => window.__observedApp.session.returnToNetworkMenu());
      await a.page.waitForFunction(() => !(window.__observedApp.renderer.resources.panelSurface?.rows ?? []).some(row => row[0] === 'Bob'), undefined, { timeout: 25000 });
      const after = await state(a); assert.equal(after.rows.includes('Bob'), false);
    } finally { await close([a, b]); }
  });
  await run('11 online-only delivery never loads wasm, worker or dev modules', async () => {
    const a = await player('OnlineOnly');
    try {
      const forbidden = a.requests.filter(url => /server\.wasm|server-worker\.js|worker\.js|local-worker\.js|dev\/|wasm\//.test(url));
      assert.deepEqual(forbidden, []);
      assert.equal((await state(a)).mode, 'network');
      assert.equal(a.errors.filter(error => /Worker|wasm/i.test(error)).length, 0);
    } finally { await a.context.close(); await a.native.close(); }
  });
  await run('12 snapshot sequence is monotonic and baseline-bound across both clients', async () => {
    const [a, b] = await openPair(); await meet(a, b);
    try {
      const first = await state(a); await a.page.waitForTimeout(1200); const second = await state(a);
      const firstB = await state(b); await b.page.waitForTimeout(1200); const secondB = await state(b);
      assert.ok(second.sequence > first.sequence); assert.ok(secondB.sequence > firstB.sequence);
      assert.equal(second.baseline, first.baseline); assert.equal(secondB.baseline, firstB.baseline);
      assert.ok(second.tick > first.tick); assert.ok(secondB.tick > firstB.tick);
    } finally { await close([a, b]); }
  });
} finally {
  await close(movementPair ?? []);
  await browser.close(); await http.close();
  const report = { schema: 1, startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - allStarted,
    delivery: process.env.CLIENT_ROOT || 'dist-multiplayer', total: cases.length,
    passed: cases.length === 12 && cases.every(entry => entry.passed), cases };
  await mkdir('reports/multiplayer', { recursive: true });
  await writeFile('reports/multiplayer/browser-pvp.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, total: report.total, cases: cases.map(({ name, passed, durationMs, error }) => ({ name, passed, durationMs, error })) }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
