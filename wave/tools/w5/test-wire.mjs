import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { root, startHost } from '../w2/host.mjs';
import { client, aim } from '../w2/online.mjs';
import { colorCases, canvasBackground } from './test-colors.mjs';

async function until(predicate, description) {
  const end = performance.now() + 10000;
  while (performance.now() < end) {
    if (await predicate()) {
      return;
    }
    await pause(40);
  }
  throw new Error(description);
}

// Native camera interpolation continues between the two mouse bearings. Let
// it settle after a transfer, then retry only the observer's stop precision.
async function stop(entry) {
  let lastError;
  for (let attempt = 0; attempt < 5; ++attempt) {
    await pause(200);
    try {
      await aim(entry);
      return;
    } catch (error) {
      if (!error.message.startsWith('Original stop strength')) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
}

export async function runW5(values) {
  const output = path.resolve(values['output-dir']);
  const nativeDir = path.resolve(values['native-dir']);
  const temporary = await mkdtemp(path.join(tmpdir(), 'wave-w5-wire-'));
  const database = path.join(temporary, 'profiles.sqlite3');
  await mkdir(output, { recursive: true });
  const report = {
    schemaVersion: 1,
    stage: 'W5',
    generatedAt: new Date().toISOString(),
    scope: ['ant-holes', 'standalone-pvp'],
    status: 'failed',
    cases: {},
  };
  const clients = [];
  let browser;
  let host;
  try {
    const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
    const walk = async (directory) => {
      const entries = await readdir(path.join(root, directory), { withFileTypes: true });
      const nested = await Promise.all(
        entries.map((entry) =>
          entry.isDirectory()
            ? walk(path.join(directory, entry.name))
            : [path.join(directory, entry.name)],
        ),
      );
      return nested.flat();
    };
    const directories = await Promise.all(['server', 'cmake', 'tools/w5'].map(walk));
    const files = [
      ...directories.flat(),
      'CMakeLists.txt',
      'package.json',
      'web/local.js',
      'web/index.html',
      'web/reference.css',
      'web/resources-20221030.json',
      'tests/native/w5_scenarios.cpp',
      'tests/scenarios/wire_match.hpp',
      'tools/w2/host.mjs',
      'tools/w2/online.mjs',
      'tools/w2/test-wire.mjs',
      'data/rules/20221030/w5-scenarios.json',
      'data/wire/20221030/w5-backgrounds.json',
    ].sort();
    report.sources = await Promise.all(
      files.map(async (file) => ({ file, sha256: hash(await readFile(path.join(root, file))) })),
    );
    report.sourceSha256 = hash(JSON.stringify(report.sources));
    report.fixtureBinarySha256 = hash(await readFile(path.join(nativeDir, 'wave_host_fixture')));
    const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    report.revision =
      process.env.WAVE_REVISION ?? (revision.status === 0 ? revision.stdout.trim() : null);
    const seed = () =>
      JSON.parse(
        execFileSync(path.join(nativeDir, 'wave_w3_seed'), [database, '--w5'], {
          encoding: 'utf8',
        }),
      );
    const profiles = [seed(), seed(), seed(), seed()];
    assert.ok(profiles.every((profile) => profile.level >= 15));
    host = await startHost({
      snapshot: values.snapshot,
      nativeDir,
      port: 0,
      fixture: true,
      database,
    });
    browser = await chromium.launch({
      executablePath:
        values.browser ??
        process.env.CHROME_PATH ??
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost', '--no-proxy-server'],
    });
    report.browser = browser.version();
    report.snapshot = host.snapshot;
    const state = async () => (await fetch(host.url + 'wave/test/state')).json();
    const step = async (ticks = 1) => {
      const response = await fetch(host.url + `wave/test/step/${ticks}`, { method: 'POST' });
      assert.ok(response.ok);
      const result = await response.json();
      await pause(140);
      return result;
    };
    const scenario = async (action, player) => {
      const response = await fetch(host.url + `wave/test/w5/${action}/${player}`, {
        method: 'POST',
      });
      assert.ok(response.ok, action);
      return response.json();
    };
    const open = async (name, token) => {
      const storage = {
        cookies: [],
        origins: [
          {
            origin: new URL(host.url).origin,
            localStorage: [{ name: 'cp6_player_id', value: token }],
          },
        ],
      };
      const entry = await client(browser, host.url, name, storage);
      clients.push(entry);
      await pause(700);
      await entry.page.mouse.click(460, 335);
      await entry.page.keyboard.type(name);
      return entry;
    };
    const roomOf = (s, mode) => s.rooms.find((room) => room.match && room.mode === mode);
    const playerOf = (room, id) => room.players.find((p) => p.id === id);
    const bodyOf = (room, id) => room.entities.find((e) => e.group === 0 && e.owner === id);
    const picture = async (entry, name) => {
      await pause(300);
      await entry.page.screenshot({ path: path.join(output, name + '.png') });
      return name + '.png';
    };

    console.log('W5: exact original menu and world palette for all four modes');
    await colorCases({ browser, snapshot: values.snapshot, nativeDir, output, report });
    console.log('W5: two original PvP menus, metadata and native scoreboard');
    const a = await open('PVP A', profiles[0].token);
    const b = await open('PVP B', profiles[1].token);
    for (const entry of [a, b]) {
      await entry.page.mouse.click(503, 370);
      await until(() => entry.baseline.get(8198)?.mode === 2, 'Native PvP button selects mode two');
      await pause(700);
      await entry.page.mouse.click(660, 335);
      await pause(250);
      await step();
      await until(() => entry.current?.control, 'Native Ready enters standalone PvP');
    }
    let s = await step();
    let pvp = roomOf(s, 1);
    assert.equal(pvp.members.length, 2);
    const [aid, bid] = pvp.members.map((m) => m.id);
    assert.equal(a.baseline.get(8198).serverLabel, 'wavepvp');
    assert.deepEqual(a.baseline.get(8196).background, [77, 94, 86]);
    assert.ok(!a.baseline.has(8194) && !a.baseline.has(8197));
    assert.equal(a.baseline.get(8195).leaderCount, 2);
    assert.equal(a.baseline.get(8195).flowers, 2);
    assert.ok(a.baseline.get(8195).leaders.includes(8193));
    assert.ok(a.sockets.some((url) => url.endsWith('/wave/socket/pvp')));
    await scenario('pvp-wound', bid);
    s = await step();
    const opponentHealth = () => [...a.baseline.values()].find((entity) => entity.name === 'PVP B');
    await until(
      () => opponentHealth()?.health === 127,
      'The opponent health update reaches the other PvP client',
    );
    assert.equal(opponentHealth().healthFlags & 2, 2);
    assert.equal(
      [...b.baseline.values()].find((entity) => entity.name === 'PVP A').healthFlags & 2,
      2,
    );
    report.cases['W5-PVP-HEALTH'] = {
      status: 'passed',
      health: opponentHealth().health,
      screenshot: await picture(a, 'pvp-opponent-health'),
    };
    await scenario('duel-edge', aid);
    s = await step();
    pvp = roomOf(s, 1);
    await until(
      () => a.baseline.get(8195)?.scores[0] === 300,
      'Native ranking receives victim score',
    );
    await a.page.waitForFunction(() =>
      [...window.waveLabels].some((label) => label.includes('PVP B')),
    );
    report.cases['W5-PVP-ENTRY'] = {
      status: 'passed',
      mode: 2,
      players: 2,
      scores: a.baseline.get(8195).scores.slice(0, 2),
      screenshot: await picture(a, 'pvp-scoreboard'),
    };

    console.log('W5: native movement/attack, kill credit, Basic drop, pickup and departure');
    await stop(b);
    await aim(a, [1, 0]);
    await a.page.mouse.down();
    for (let n = 0; n < 40; n += 1) {
      s = await step();
      pvp = roomOf(s, 1);
      if (playerOf(pvp, bid).state !== 1) {
        break;
      }
    }
    await a.page.mouse.up();
    await stop(a);
    assert.notEqual(playerOf(pvp, bid).state, 1, 'Original player input defeats the opponent');
    const killerControl = a.current.control;
    const atKill = bodyOf(pvp, aid);
    s = await step();
    pvp = roomOf(s, 1);
    const afterKill = bodyOf(pvp, aid);
    assert.ok(
      Math.hypot(afterKill.x - atKill.x, afterKill.y - atKill.y) <= 1.3,
      'The shrinking PvP field cannot accelerate the killer at the old edge',
    );
    assert.ok(pvp.arenaRadius >= Math.hypot(afterKill.x, afterKill.y) + afterKill.radius - 1e-4);
    assert.equal(a.current.control, killerControl, 'The killer retains the same controlled flower');
    await until(
      () =>
        Math.hypot(
          a.baseline.get(8193).cameraX / 5 - afterKill.x,
          a.baseline.get(8193).cameraY / 5 - afterKill.y,
        ) < 0.01,
      'The killer camera stays with its authoritative flower',
    );
    report.cases['W5-PVP-KILL-MOVEMENT'] = {
      status: 'passed',
      before: atKill,
      after: afterKill,
      screenshot: await picture(a, 'pvp-kill-position'),
    };
    assert.ok(playerOf(pvp, aid).score > 10);
    const defeatedScore = playerOf(pvp, aid).score;
    assert.ok(
      pvp.drops.some((drop) => drop.kind === 1),
      'Victim score produces a Basic petal',
    );
    await until(
      () => b.baseline.get(8193)?.killer === 'PVP A',
      'Original death screen receives the player name',
    );
    report.cases['W5-PVP-KILL'] = {
      status: 'passed',
      score: defeatedScore,
      drops: pvp.drops,
      screenshot: await picture(b, 'pvp-defeated'),
    };
    const drop = pvp.drops.find((entry) => entry.kind === 1);
    for (let n = 0; n < 60 && pvp.drops.length; n += 1) {
      const body = bodyOf(pvp, aid);
      const dx = drop.x - body.x,
        dy = drop.y - body.y,
        distance = Math.hypot(dx, dy);
      await aim(
        a,
        distance > 1 ? [dx / distance, dy / distance] : undefined,
        Math.min(200, distance * 50),
      );
      s = await step(2);
      pvp = roomOf(s, 1);
    }
    await stop(a);
    assert.equal(pvp.drops.length, 0, 'Native movement collects the Basic drop');
    await pause(350);
    const after = JSON.parse(
      execFileSync(path.join(nativeDir, 'wave_w3_seed'), [database, profiles[0].token], {
        encoding: 'utf8',
      }),
    );
    const inventoryCount = (profile) =>
      profile.inventory.filter(([kind]) => kind === 1).reduce((sum, [, , count]) => sum + count, 0);
    assert.equal(inventoryCount(after), inventoryCount(profiles[0]) + 1);
    report.cases['W5-PVP-PICKUP'] = {
      status: 'passed',
      inventoryBefore: inventoryCount(profiles[0]),
      inventoryAfter: inventoryCount(after),
      screenshot: await picture(a, 'pvp-picked-up'),
    };

    console.log('W5: walking outward follows the shrinking PvP boundary without oscillation');
    await aim(a, [1, 0]);
    s = await step(20);
    pvp = roomOf(s, 1);
    const resizeSamples = [];
    for (let sample = 0; sample < 8; sample += 1) {
      const previousRadius = pvp.arenaRadius;
      const previousBody = bodyOf(pvp, aid);
      s = await step(4);
      pvp = roomOf(s, 1);
      const body = bodyOf(pvp, aid);
      assert.ok(
        Math.abs(pvp.arenaRadius - (previousRadius - 1)) < 0.001,
        'The field shrinks by ten units per second despite outward movement',
      );
      assert.ok(
        Math.hypot(body.x, body.y) <= Math.hypot(previousBody.x, previousBody.y) + 0.001,
        'Walking outward cannot bounce the flower away from the shrinking edge',
      );
      assert.ok(
        Math.abs(Math.hypot(body.x, body.y) + body.radius - pvp.arenaRadius) < 0.001,
        'The outward-moving flower remains on the current boundary',
      );
      resizeSamples.push({ radius: pvp.arenaRadius, x: body.x, y: body.y });
    }
    await stop(a);
    report.cases['W5-PVP-SMOOTH-RESIZE'] = {
      status: 'passed',
      samples: resizeSamples,
      screenshot: await picture(a, 'pvp-smooth-resize'),
    };

    console.log('W5: death Continue and Ready rejoin the running PvP field without reload');
    const beforeReentry = {
      sockets: b.sockets.length,
      loads: b.documentLoads.length,
      epoch: b.current.epoch,
      life: playerOf(pvp, bid).life,
      match: pvp.match,
    };
    const firstContinue = b.commands.length;
    await b.page.keyboard.press('Enter');
    await until(
      () => !b.baseline.has(8196),
      'PvP Continue leaves the defeated seat and returns to the menu world',
    );
    assert.ok(
      b.commands.slice(firstContinue).some((command) => command.opcode === 34),
      'PvP Continue sends ad completion directly',
    );
    assert.ok(
      !b.commands.slice(firstContinue).some((command) => command.opcode === 21),
      'PvP skips the Waves settlement command',
    );
    await pause(700);
    await b.page.keyboard.press('Enter');
    await until(
      async () => roomOf(await state(), 1)?.members.some((member) => member.id === bid),
      'Ready admits the defeated guest to the running PvP field',
    );
    s = await step();
    pvp = roomOf(s, 1);
    await until(() => b.current?.control, 'Ready supplies a new controlled PvP flower');
    assert.equal(pvp.match, beforeReentry.match, 'The survivor keeps the same public field');
    assert.equal(playerOf(pvp, bid).state, 1);
    assert.ok(playerOf(pvp, bid).life > beforeReentry.life);
    assert.ok(b.current.epoch > beforeReentry.epoch);
    assert.equal(b.sockets.length, beforeReentry.sockets, 'PvP reentry keeps its socket');
    assert.equal(b.documentLoads.length, beforeReentry.loads, 'PvP reentry keeps its page');
    assert.equal(playerOf(pvp, bid).score, 0, 'The new PvP life starts with zero score');
    report.cases['W5-PVP-REENTRY'] = {
      status: 'passed',
      screenshot: await picture(b, 'pvp-rejoined'),
    };

    console.log('W5: native squad, split field/interior visibility and timeout return');
    const c = await open('ANT A', profiles[2].token);
    await c.page.mouse.click(660, 374);
    await until(() => c.baseline.get(8194)?.code, 'Native Squad creates an ant-hole team');
    const code = c.baseline.get(8194).code;
    const storage = {
      cookies: [],
      origins: [
        {
          origin: new URL(host.url).origin,
          localStorage: [{ name: 'cp6_player_id', value: profiles[3].token }],
        },
      ],
    };
    const d = await client(browser, host.url + '#wavelocal-' + code, 'ANT B', storage);
    clients.push(d);
    await pause(700);
    await c.page.mouse.click(660, 220);
    await d.page.mouse.click(660, 220);
    await pause(250);
    await step();
    await until(
      () => c.current?.control && d.current?.control,
      'Both native Ready actions enter the same Garden',
    );
    s = await step();
    let garden = roomOf(s, 0);
    const [cid, did] = garden.members.map((m) => m.id);
    const enter = async (kind) => {
      await scenario(kind, cid);
      for (let n = 0; n < 40; n += 1) {
        await aim(c, [1, 0]);
        garden = roomOf(await step(2), 0);
        if (playerOf(garden, cid).area) {
          break;
        }
      }
      await stop(c);
      assert.ok(playerOf(garden, cid).area, 'Native movement enters the rare hole');
      await pause(400);
      return playerOf(garden, cid).area;
    };
    await stop(d);
    const mainTick = garden.tick;
    const area = await enter('hole');
    assert.equal(playerOf(garden, did).area, 0);
    assert.ok(garden.tick > mainTick);
    assert.deepEqual(c.baseline.get(8196).background, [181, 133, 0]);
    assert.equal(c.baseline.get(8196).arenaRadius, garden.antHoles[0].radius * 5);
    assert.ok(
      ![...c.baseline.values()].some((entity) => entity.mask & 0x20 && entity.name === 'Flower'),
      'The interior snapshot excludes the main-field flower',
    );
    assert.ok(
      ![...d.baseline.values()].some((entity) => entity.mask & 0x20 && entity.name === 'ANT A'),
      'The main snapshot excludes the interior flower',
    );
    assert.ok(
      [...c.baseline.values()].some((entity) => entity.mob === 8),
      'The native interior renders a Queen Ant',
    );
    report.cases['W5-ANT-SPLIT'] = {
      status: 'passed',
      area,
      mainPlayer: did,
      insidePlayer: cid,
      background: await canvasBackground(c.page, true),
      screenshot: await picture(c, 'ant-interior'),
      mainScreenshot: await picture(d, 'ant-main-field'),
    };
    assert.deepEqual(report.cases['W5-ANT-SPLIT'].background, [181, 133, 0]);
    const life = playerOf(garden, cid).life;
    await scenario('clear', cid);
    garden = roomOf(await step(), 0);
    assert.equal(playerOf(garden, cid).area, 0);
    assert.ok(
      playerOf(garden, cid).life > life,
      'The returned control generation rejects pre-transfer inputs',
    );
    await until(
      () =>
        [...c.baseline.values()].some((entity) => entity.mask & 0x20 && entity.name === 'Flower'),
      'Return restores the main-field visible set',
    );
    report.cases['W5-ANT-CLEAR'] = {
      status: 'passed',
      screenshot: await picture(c, 'ant-cleared'),
    };
    await step(40);
    await enter('fire');
    assert.deepEqual(c.baseline.get(8196).background, [181, 45, 0]);
    assert.deepEqual(await canvasBackground(c.page, true), [181, 45, 0]);
    report.cases['W5-FIRE-ENTRY'] = {
      status: 'passed',
      background: c.baseline.get(8196).background,
      screenshot: await picture(c, 'fire-ant-interior'),
    };
    await scenario('timeout', cid);
    garden = roomOf(await step(2), 0);
    assert.equal(playerOf(garden, cid).area, 0);
    report.cases['W5-ANT-TIMEOUT'] = {
      status: 'passed',
      screenshot: await picture(c, 'fire-ant-timeout'),
    };
    assert.equal(roomOf(await state(), 1).match, pvp.match, 'PvP and PvE remain separate matches');
    await a.page.mouse.click(20, 20);
    await until(
      () => !a.current?.control && !a.baseline.has(8195),
      'Native Abandon returns to the PvP menu',
    );
    report.cases['W5-PVP-LEAVE'] = {
      status: 'passed',
      screenshot: await picture(a, 'pvp-returned'),
    };
    for (const entry of clients) {
      assert.deepEqual(entry.errors, [], entry.name);
    }
    report.status = 'passed';
  } catch (error) {
    report.error = error.stack;
    if (host) {
      report.failureState = await (
        await fetch(host.url + 'wave/test/state')
      )
        .json()
        .catch(() => null);
    }
    for (const entry of clients) {
      if (!entry.page.isClosed()) {
        await entry.page
          .screenshot({
            path: path.join(output, 'failure-' + entry.name.replaceAll(' ', '-') + '.png'),
          })
          .catch(() => {});
      }
    }
    throw error;
  } finally {
    report.clients = clients.map((entry) => ({
      name: entry.name,
      errors: entry.errors,
      sockets: entry.sockets,
      commands: entry.commands,
      frames: entry.frames,
    }));
    await browser?.close();
    await host?.stop();
    await writeFile(path.join(output, 'wire.json'), JSON.stringify(report, null, 2) + '\n');
    await rm(temporary, { recursive: true, force: true });
  }
  console.log('W5 original-client ant holes and standalone PvP passed');
}
