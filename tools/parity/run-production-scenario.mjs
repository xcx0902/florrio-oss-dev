#!/usr/bin/env node
/**
 * Record the actual browser/worker/wasm/decoder/world/renderer/camera path.
 * No synthetic state, camera override or worker replacement is used. Worker
 * messages and WorldState apply calls are observed and delegated unchanged.
 *
 * node tools/parity/run-production-scenario.mjs --all
 * Options: --root client/public|dist-next, --out DIR, --scenario NAME,
 * --profile desktop|retina|touch. Partial runs are marked incomplete.
 * --diagnostic marks the report ineligible for acceptance, even if all cases pass.
 * This is production integration evidence, never original-client pixel parity.
 */
import http from 'node:http';
import path from 'node:path';
import { readFile, writeFile, mkdir, open, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromiumExecutable } from '../lib/chromium.mjs';
import { evidence, newRunId, sameEvidence, treeIdentity, completeCoverage, scenarioNames } from '../verification-evidence.mjs';
import { atomicJson, assertVerificationOwner } from '../verification/io.mjs';
import { scenarios, BOOT_FRAMES, scenarioByName } from './scenarios.mjs';
import { productionProfiles, productionChecks, productionDamageChecks, damageContactInput } from './production-checks.mjs';
import { readProductionState as readState } from './production-state.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.lastIndexOf(name);
  if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith('--'))) throw new Error(`${name} requires a value`);
  return index < 0 ? fallback : args[index + 1];
};
for (const name of ['--root', '--out', '--scenario', '--profile']) option(name);
const options = name => args.filter((value, index) => index > 0 && args[index - 1] === name);
const root = path.resolve(option('--root', 'client/public'));
const output = path.resolve(option('--out', 'tests/parity/production'));
const selected = options('--scenario').length ? options('--scenario').map(scenarioByName) : scenarios;
const profiles = options('--profile').length ? options('--profile').map(name => {
  const profile = productionProfiles.find(item => item.name === name);
  if (!profile) throw new Error(`Unknown profile ${name}`);
  return profile;
}) : productionProfiles;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const stripExports = text => text.replace(/^export /gm, '');
await assertVerificationOwner();
await mkdir(output, { recursive: true });
const lock = await open(path.join(output, '.production.lock'), 'wx');
const runId = process.env.VERIFY_RUN_ID ?? newRunId();
let browser, initialEvidence, target;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local.test').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch { response.writeHead(404).end(); }
});
let origin;
const report = { schema: 1, kind: 'production-integration', equivalence: false, runId,
  reportOnly: args.includes('--diagnostic'),
  generatedAt: new Date().toISOString(), evidence: null, root: path.relative(process.cwd(), root),
  stable: false, changedDuringRun: false, sourceMatchesDelivery: false, status: 'running',
  timeline: { frameMs: 16, bootFrames: BOOT_FRAMES,
    scheduler: 'Advance one page frame, drain real worker messages, then sample. Worker code and C++ simulation are unchanged.',
    differences: ['Mouse coordinates are scaled proportionally from the 1280x720 scenario to each viewport.',
      'After damage scenario-final, bounded decoded-target navigation may add actual mouse/touch movement and defend input until player health loss and its event-11 flash are observed.',
      'Equip adds real discard/drag input after the original scenario; death adds opcode-3 suicide only if original movement did not kill the player, then actual Enter returns to the menu and a second Enter sends opcode6 to spawn a new body.',
      'Multiple checkpoints and one later animation window are recorded; no original-client screenshot equivalence is claimed.'] },
  profiles, scenarios: [], passed: false };

function installWorkerObserver() {
  const NativeWorker = window.Worker;
  const pending = new Set();
  const state = window.__productionProbe = {
    workers: [], requests: [], responses: [], workerErrors: [], forbiddenCalls: [],
    applies: { full: 0, partial: 0 }, events: {}, hitFlashObserved: 0, hitClockSamples: [], snapshotSamples: [],
    responsePackets: 0, completedThinks: 0, wireBytes: 0, lastPacket: null,
  };
  const callbackFunctions = new Map();
  let nextWorker = 0;
  class ObservedWorker extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      const workerId = nextWorker++;
      this.__productionWorkerId = workerId;
      state.workers.push(String(url));
      this.addEventListener('error', event => state.workerErrors.push(String(event.message || event)));
      this.addEventListener('message', event => {
        const data = event.data ?? {};
        const key = `${workerId}:${data.callbackId}`;
        const bytes = data.data && typeof data.data !== 'number' ? new Uint8Array(data.data.buffer ?? data.data, data.data.byteOffset ?? 0, data.data.byteLength) : null;
        if (bytes?.length) {
          let digest = 2166136261;
          for (const byte of bytes) digest = Math.imul(digest ^ byte, 16777619) >>> 0;
          state.responsePackets++; state.wireBytes += bytes.length;
          state.lastPacket = Array.from(bytes);
          state.responses.push({ at: performance.now(), callbackId: data.callbackId, bytes: bytes.length, digest: digest.toString(16) });
        }
        if (data.error) state.workerErrors.push(String(data.error));
        if (data.finalResponse) {
          if (callbackFunctions.get(key) === 'sp_server_think') state.completedThinks++;
          pending.delete(key); callbackFunctions.delete(key);
        }
      });
    }
    postMessage(message, transfer) {
      const key = `${this.__productionWorkerId}:${message.callbackId}`;
      pending.add(key); callbackFunctions.set(key, message.funcName);
      state.requests.push({ at: performance.now(), callbackId: message.callbackId, funcName: message.funcName,
        bytes: message.data ? Array.from(message.data) : null });
      return super.postMessage(message, transfer);
    }
  }
  window.Worker = ObservedWorker;
  window.__productionDrain = () => new Promise((resolve, reject) => {
    let attempts = 0;
    const poll = () => {
      if (!pending.size) { resolve(); return; }
      if (++attempts > 3000) { reject(new Error(`Worker drain timeout (${pending.size} callbacks)`)); return; }
      window.__realSetTimeout(poll, 1);
    };
    poll();
  });
}

async function observeWorldAndGuardFixtures() {
  window.__productionLoadout = await import('/state/loadout.js');
  const florr = window.__florr;
  const state = window.__productionProbe;
  for (const name of ['setSnapshot', 'setSnapshotAt', 'setCamera', 'setRenderCamera', 'freeze', 'resume', 'setAnimationTime', 'clearCameraOverride']) {
    if (typeof florr[name] === 'function') florr[name] = () => {
      state.forbiddenCalls.push(name); throw new Error(`Production recording forbids fixture hook ${name}`);
    };
  }
  florr.camera.setCamera = () => { state.forbiddenCalls.push('camera.setCamera'); throw new Error('Camera injection forbidden'); };
  for (const [name, category] of [['apply', 'full'], ['applyPartial', 'partial']]) {
    const original = florr.world[name];
    florr.world[name] = function(snapshot, now) {
      const result = original.call(this, snapshot, now);
      state.applies[category]++;
      for (const event of snapshot.events ?? []) {
        state.events[event.opcode] = (state.events[event.opcode] ?? 0) + 1;
        if (event.opcode === 11) {
          const hitAt = this.hitTime(event.handle);
          const flash = this.hitFlash(event.handle, now);
          state.hitClockSamples.push({ handle: event.handle, at: now, hitAt, flash });
          if (hitAt === now && Number.isFinite(flash) && flash > 0) state.hitFlashObserved++;
        }
      }
      state.snapshotSamples.push({ at: now, sequence: snapshot.sequence, entities: snapshot.entities.length,
        events: snapshot.events ?? [], count: this.count, decoderPath: category });
      return result;
    };
  }
}

async function runScenario(scenario, profile) {
  const page = await browser.newPage({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor,
    hasTouch: profile.hasTouch, isMobile: profile.isMobile ?? false, userAgent: profile.userAgent,
    locale: 'en-US', timezoneId: 'UTC' });
  const directory = path.join(output, profile.name, scenario.name);
  await mkdir(directory, { recursive: true });
  const record = { name: scenario.name, description: scenario.description, profile, errors: [], samples: [], checkpoints: [], actions: [], deviations: [] };
  page.on('pageerror', error => record.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') record.errors.push(message.text()); });
  await page.addInitScript({ content: stripExports(await readFile(new URL('./deterministic-entropy.js', import.meta.url), 'utf8')) + '\ninstallDeterministicEntropy();' });
  await page.addInitScript({ content: stripExports(await readFile(new URL('./virtual-clock.js', import.meta.url), 'utf8')) + '\ninstallVirtualClock({frameMs:16});' });
  await page.addInitScript({ content: stripExports(await readFile(new URL('./canvas-trace.js', import.meta.url), 'utf8')) + '\ninstallCanvasTrace({captureFrames:3});' });
  await page.addInitScript(installWorkerObserver);
  async function advance(frames) {
    // Batches keep the browser RPC cost low while every frame still drains the
    // actual Worker before the next virtual 16ms is allowed to run.
    const samples = await page.evaluate(async ({ frames, readStateSource }) => {
      const read = (0, eval)(`(${readStateSource})`);
      const samples = [];
      for (let index = 0; index < frames; index++) {
        await window.__virtualClock.advance(16);
        await window.__productionDrain();
        samples.push(read());
      }
      return samples;
    }, { frames, readStateSource: readState.toString() });
    record.samples.push(...samples);
  }
  async function key(code) { await page.keyboard.press(code); }
  async function capture(label) {
    const state = await page.evaluate(readState);
    const canvas = await page.evaluate(({ name, profile }) => window.__canvasTrace.export({ scenario: name,
      viewport: profile.viewport, frameMs: 16, frames: 3 }), { name: scenario.name, profile });
    const screenshot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, ...profile.viewport } });
    const framebuffer = await page.locator('#canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
    const entry = { label, state, canvasDigest: canvas.frameDigests.at(-1)?.digest ?? null, framebuffer, screenshotSha256: sha256(screenshot),
      canvasPath: `${profile.name}/${scenario.name}/${label}.canvas.json`, screenshotPath: `${profile.name}/${scenario.name}/${label}.png` };
    if (scenario.name === 'spawn') {
      const workers = page.workers().filter(worker => worker.url().includes('server-worker.js'));
      if (workers.length !== 1) throw new Error('Population observation requires the one live production Worker');
      // Read the existing instance; do not instantiate a second engine or
      // replace the peer-filtered snapshot with a full-world fixture.
      entry.population = await workers[0].evaluate(async () => {
        const exports = await modulePromise;
        const rawPlayer = exports.sp_server_player_handle();
        return { source: 'live-worker-wasm', count: exports.sp_server_state_count(),
          mobs: exports.sp_server_debug_kind_count(2),
          // EntityHandle::to_wire rotates the native 14-bit slot handle.
          player: ((rawPlayer >>> 14) | (rawPlayer << 18)) >>> 0, rawPlayer };
      });
    }
    record.checkpoints.push(entry);
    await writeFile(path.join(directory, `${label}.canvas.json`), JSON.stringify(canvas) + '\n');
    await writeFile(path.join(directory, `${label}.png`), screenshot);
  }
  try {
    await page.goto(origin + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__florr && document.getElementById('status') === null, null, { polling: 50, timeout: 30000 });
    record.environment = await page.evaluate(() => ({ userAgent: navigator.userAgent,
      mobileUiFromUserAgent: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
      maxTouchPoints: navigator.maxTouchPoints, innerWidth, innerHeight, devicePixelRatio }));
    await page.evaluate(observeWorldAndGuardFixtures);
    await advance(BOOT_FRAMES);
    await capture('boot');
    let movementStart = null;
    for (const step of scenario.steps) {
      if (step.key) await key(step.key);
      if (step.mouseMove) {
        movementStart ??= await page.evaluate(readState);
        await page.mouse.move(step.mouseMove.x * profile.viewport.width / 1280, step.mouseMove.y * profile.viewport.height / 720);
      }
      if (step.mouseDown) await page.mouse.down({ button: step.mouseDown });
      if (step.mouseUp) await page.mouse.up({ button: step.mouseUp });
      if (step.reset) await page.evaluate(() => window.__canvasTrace.reset({ captureFrames: 3 }));
      if (step.advance) await advance(step.advance);
    }
    await capture('scenario-final');
    if (movementStart?.player) {
      const current = await page.evaluate(readState);
      record.actions.push({ name: 'movement', start: movementStart.player, end: current.player,
        distance: current.player ? Math.hypot(current.player.x - movementStart.player.x, current.player.y - movementStart.player.y) : 0 });
    }
    if (scenario.name === 'damage') {
      const damageChecks = async () => productionDamageChecks({ samples: record.samples,
        summary: await page.evaluate(() => ({ events: window.__productionProbe.events,
          hitFlashObserved: window.__productionProbe.hitFlashObserved,
          hitClockSamples: window.__productionProbe.hitClockSamples })) });
      let observed = await damageChecks();
      if (!observed.healthChanged || !observed.hitEventDecoded) {
        record.deviations.push('After the unchanged scenario-final, follow a live decoded mob using trusted mouse/touch input while defending. No entity, camera or worker state is injected. Stop only on actual player health loss plus that player\'s event-11 clock/flash, or the 720-frame budget.');
        const action = { name: 'damage-contact-navigation', start: await page.evaluate(readState),
          beforeChecks: observed, frameBudget: 720, framesPerStep: 4, steps: [] };
        record.actions.push(action);
        let session, targetHandle;
        const touchOrigin = { x: 70, y: profile.viewport.height * 0.55 };
        await page.evaluate(() => {
          window.__productionDamageInputs = [];
          const canvas = document.getElementById('canvas');
          for (const type of ['mousemove', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend'])
            canvas.addEventListener(type, event => window.__productionDamageInputs.push({
              type, trusted: event.isTrusted, at: performance.now() }));
        });
        try {
          await page.mouse.move(profile.viewport.width / 2, profile.viewport.height / 2);
          await page.mouse.down({ button: 'right' });
          if (profile.hasTouch) {
            session = await page.context().newCDPSession(page);
            await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchOrigin] });
          }
          for (let step = 0; step < action.frameBudget / action.framesPerStep; step++) {
            const state = await page.evaluate(readState);
            const mobs = await page.evaluate(() => [...window.__florr.world.all()]
              .filter(entity => (entity.kind ?? entity.typeId) === 2)
              .map(({ handle, kind, typeId, speciesId, x, y, health }) => ({ handle, kind, typeId, speciesId, x, y, health })));
            const input = damageContactInput(state, mobs, profile.viewport, targetHandle);
            if (!input) { action.stopped = 'no-live-player-or-mob'; break; }
            targetHandle = input.target.handle;
            action.steps.push({ at: state.time, player: state.player, ...input,
              input: session ? 'trusted-touch' : 'trusted-mouse' });
            if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
              x: touchOrigin.x + input.touch.x * 48, y: touchOrigin.y + input.touch.y * 48 }] });
            else await page.mouse.move(input.mouse.x, input.mouse.y);
            await advance(action.framesPerStep);
            observed = await damageChecks();
            if (observed.healthChanged && observed.hitEventDecoded) { action.stopped = 'observed-player-hit'; break; }
          }
          action.stopped ??= 'frame-budget-exhausted';
        } finally {
          if (session) {
            try { await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
            finally { await session.detach(); }
          }
          await page.mouse.up({ button: 'right' });
          action.inputs = await page.evaluate(() => window.__productionDamageInputs);
          action.end = await page.evaluate(readState);
          action.afterChecks = await damageChecks();
        }
        await capture('damage-contact-observed');
      }
    }
    if (scenario.name === 'equip') {
      record.deviations.push('The original KeyI/Digit1 steps select a panel but do not send equip. After the scenario-final checkpoint a discard and empty-slot drag exercise real opcode8/10 and decoded loadout changes.');
      await key('Escape'); await advance(4);
      const layout = await page.evaluate(async () => {
        const { getHudLayout } = await import('/render/ui.js');
        const entity = [...window.__florr.world.all()].find(item => (item.kind ?? item.typeId) === 1);
        return getHudLayout(innerWidth, innerHeight, entity?.level ?? 1,
          /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
      });
      const hotbar = slot => ({ x: (layout.equippedX + slot * 90) * layout.scale, y: layout.equippedY * layout.scale });
      const discard = { x: (layout.storageX + 8 * 65) * layout.scale, y: layout.storageY * layout.scale };
      const drag = async (source, target) => {
        await page.mouse.move(source.x, source.y);
        await page.mouse.down({ button: 'left' });
        try {
          await advance(5);
          await page.mouse.move(target.x, target.y, { steps: 8 });
          await advance(5);
        } finally { await page.mouse.up({ button: 'left' }); }
        await advance(8);
      };
      record.actions.push({ name: 'equip-geometry', layout, discard, source: hotbar(0), target: hotbar(2) });
      const preDiscard = await page.evaluate(readState);
      await drag(hotbar(2), discard);
      const before = await page.evaluate(readState);
      record.actions.push({ name: 'discard', slot: 2, beforeSlots: preDiscard.slots, afterSlots: before.slots });
      await drag(hotbar(0), hotbar(2));
      const after = await page.evaluate(readState);
      record.actions.push({ name: 'equip', source: 0, target: 2, beforeSlots: before.slots, afterSlots: after.slots });
      await capture('equip-roundtrip');
    }
    if (scenario.name === 'death') {
      let state = await page.evaluate(readState);
      const previousPlayer = state.player?.health > 0 ? state.player
        : record.samples.filter(sample => sample.player?.health > 0).at(-1)?.player;
      if (state.player) {
        record.deviations.push('Original movement did not guarantee death; appended the existing suicide diagnostic command, which sends real opcode3 through the production Worker.');
        await page.evaluate(() => window.__florr.suicide());
        // The original controlled body and its owned corpses remain for
        // 1000 ms. Observe their actual removal before testing Enter to menu.
        for (let frames = 0; frames < 96 && state.player; frames += 4) {
          await advance(4);
          state = await page.evaluate(readState);
        }
        // Drain occurs after rAF; let the next production frame display the
        // just-received removal before capturing the death UI.
        if (!state.player) await advance(1);
      }
      await capture('death-observed');
      record.deviations.push('After the unchanged scenario-final and observed death, append a real keyboard Enter and capture menu-return with no player, !started and !dead. Append a second real Enter, retain the 12-frame advance, and allow at most 96 additional frames for a healthy body with a different handle. Both entries use production opcode6; no start/restart hook or state injection is used.');
      await key('Enter'); await advance(12);
      state = await page.evaluate(readState);
      record.actions.push({ name: 'menu-return', key: 'Enter',
        returned: state.player === null && state.ui.started === false && state.ui.dead === false });
      await capture('menu-return');
      await key('Enter'); await advance(12);
      state = await page.evaluate(readState);
      const restored = () => previousPlayer !== undefined && state.player !== null
        && state.player.handle !== previousPlayer.handle && state.player.health > 0
        && state.ui.started === true && state.ui.dead === false;
      for (let frames = 0; frames < 96 && !restored(); frames += 4) {
        await advance(4);
        state = await page.evaluate(readState);
      }
      record.actions.push({ name: 'restart', key: 'Enter', beforeHandle: previousPlayer?.handle ?? null,
        afterHandle: state.player?.handle ?? null, restored: restored() });
      await capture('restart-observed');
    }
    if (profile.hasTouch && scenario.name === 'move') {
      const before = await page.evaluate(readState);
      await page.evaluate(() => {
        const canvas = document.getElementById('canvas');
        window.__productionTouchEvents = [];
        for (const type of ['touchstart', 'touchmove', 'touchend']) canvas.addEventListener(type,
          event => window.__productionTouchEvents.push({ type, trusted: event.isTrusted }));
      });
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 60, y: 480 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60, y: 432 }] });
      await advance(20);
      const after = await page.evaluate(readState);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
      const events = await page.evaluate(() => window.__productionTouchEvents);
      record.actions.push({ name: 'touch-movement', events, start: before.player, end: after.player,
        trusted: ['touchstart', 'touchmove', 'touchend'].every(type => events.some(event => event.type === type && event.trusted)),
        deltaY: before.player && after.player ? after.player.y - before.player.y : null,
        distance: before.player && after.player ? Math.hypot(after.player.x - before.player.x, after.player.y - before.player.y) : 0 });
      await capture('touch-observed');
    }
    await page.evaluate(() => window.__canvasTrace.reset({ captureFrames: 3 }));
    await advance(16);
    await capture('later-animation');
  } catch (error) {
    record.errors.push(String(error.stack || error)); record.passed = false;
  } finally {
    try {
      const summary = await page.evaluate(async () => {
        const { PACKET_XOR_KEY } = await import('/schema/packet-key.js');
        const state = window.__productionProbe;
        const opcodes = {}, buttons = [];
        for (const request of state.requests) {
          if (request.funcName !== 'sp_server_send' || !request.bytes) continue;
          const bytes = request.bytes.map((byte, index) => byte ^ PACKET_XOR_KEY[index % PACKET_XOR_KEY.length]);
          let at = 0;
          const varint = () => { let value = 0, shift = 0; while (at < bytes.length) { const byte = bytes[at++]; value |= (byte & 127) << shift; if (!(byte & 128)) return value >>> 0; shift += 7; } return null; };
          varint(); const opcode = varint(); opcodes[opcode] = (opcodes[opcode] ?? 0) + 1;
          if (opcode === 12) buttons.push(varint());
        }
        return { ...state, opcodes, buttons };
      });
      await writeFile(path.join(directory, 'worker.json'), JSON.stringify({ requests: summary.requests, responses: summary.responses,
        lastEncodedSnapshot: summary.lastPacket, snapshotSamples: summary.snapshotSamples }, null, 2) + '\n');
      const entities = await page.evaluate(() => [...window.__florr.world.all()]);
      await writeFile(path.join(directory, 'world.json'), JSON.stringify(entities) + '\n');
      delete summary.requests; delete summary.responses; delete summary.lastPacket; delete summary.snapshotSamples;
      record.summary = summary;
      record.checks = productionChecks(record);
      record.passed = Object.values(record.checks).every(Boolean);
    } catch (error) {
      record.errors.push(`Diagnostic collection failed: ${error.stack || error}`); record.passed = false;
    }
    await writeFile(path.join(directory, 'record.json'), JSON.stringify(record, null, 2) + '\n');
    await page.close();
  }
  return record;
}

try {
  // Publish a nonpassing record before reading inputs or starting the browser.
  await atomicJson(path.join(output, 'report.json'), report);
  initialEvidence = { ...await evidence(), runId };
  target = await treeIdentity('.', [report.root]);
  const manifestPath = path.join(root, 'build-manifest.json');
  const manifest = existsSync(manifestPath) ? await readFile(manifestPath) : null;
  Object.assign(report, { evidence: initialEvidence, target: { sha256: target.sha256 },
    rootWasmSha256: sha256(await readFile(path.join(root, 'server.wasm'))),
    rootManifestSha256: manifest ? sha256(manifest) : null,
    sourceMatchesDelivery: !!manifest && JSON.parse(manifest).inputs?.sha256 === initialEvidence.source.sha256 });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  const local = ['node_modules/playwright-core/index.mjs', 'node_modules/playwright/node_modules/playwright-core/index.mjs'].find(candidate => existsSync(candidate));
  const playwrightPath = process.env.PLAYWRIGHT_CORE || local;
  if (!playwrightPath) throw new Error('playwright-core is required');
  const { chromium } = await import(pathToFileURL(path.resolve(playwrightPath)).href);
  browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true,
    args: ['--no-first-run', '--disable-background-networking'] });
  for (const scenario of selected) {
    const recordings = [];
    const row = { name: scenario.name, passed: false, profiles: recordings };
    report.scenarios.push(row);
    for (const profile of profiles) {
      const record = await runScenario(scenario, profile);
      recordings.push({ profile: profile.name, passed: record.passed, checks: record.checks ?? {}, errors: record.errors,
        events: record.summary?.events ?? {}, deviations: record.deviations, artifacts: `${profile.name}/${scenario.name}/record.json` });
      console.log(`${scenario.name}/${profile.name}: ${record.passed ? 'pass' : 'FAIL'} ${JSON.stringify(record.checks ?? record.errors)}`);
      await atomicJson(path.join(output, 'report.json'), report);
    }
    row.passed = recordings.every(item => item.passed);
  }
  report.coverage = { scenarios: completeCoverage(report.scenarios),
    profiles: profiles.length === productionProfiles.length && productionProfiles.every(profile => profiles.some(item => item.name === profile.name)),
    events: [...new Set(report.scenarios.flatMap(scene => scene.profiles.flatMap(profile => Object.keys(profile.events))))].map(Number),
    expectedScenarios: scenarioNames, expectedProfiles: productionProfiles.map(profile => profile.name) };
  report.integrationPassed = report.scenarios.every(item => item.passed);
  report.completeCoverage = report.coverage.scenarios && report.coverage.profiles;
  report.passed = report.integrationPassed && report.completeCoverage;
  report.changedDuringRun = !sameEvidence(initialEvidence, await evidence())
    || target.sha256 !== (await treeIdentity('.', [report.root])).sha256;
  report.stable = !report.changedDuringRun;
  report.passed &&= report.stable && (report.root !== 'dist-next' || report.sourceMatchesDelivery);
  report.status = report.passed ? 'pass' : 'fail';
} catch (error) {
  report.passed = false; report.status = 'fail'; report.error = String(error.stack || error);
  console.error(report.error);
} finally {
  try {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    report.generatedAt = new Date().toISOString();
    await atomicJson(path.join(output, 'report.json'), report);
  } finally {
    await lock.close(); await rm(path.join(output, '.production.lock'), { force: true });
  }
}
if (!report.passed) process.exitCode = 1;
