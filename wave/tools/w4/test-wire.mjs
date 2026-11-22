import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { startHost } from '../w2/host.mjs';
import { client } from '../w2/online.mjs';

const roster = (entry) => entry.baseline.get(8194);
const notices = (entry) => entry.snapshots.flatMap((snapshot) => snapshot.notices);
const noRoom = "Squad doesn't exist";
const full = 'Squad is full';
const lobbyLabels = ['Ready', 'Connecting...'];

async function until(predicate, description) {
  const end = performance.now() + 8000;
  while (performance.now() < end) {
    if (await predicate()) {
      return;
    }
    await pause(30);
  }
  throw new Error(description);
}

async function openSquad(entry, buttonY = 402) {
  await pause(650);
  await entry.page.mouse.click(660, buttonY);
  await until(() => roster(entry)?.code, 'Native Squad button opens a private lobby');
  await pause(650);
}

async function drawNotice(entry, notice) {
  await entry.page.waitForFunction((text) => window.waveLabels.has(text), notice);
  assert.deepEqual(notices(entry), [notice], 'The socket sends one notice per attempt');
  assert.equal(entry.sockets.length, 1);
  assert.equal(entry.documentLoads.length, 1);
  assert.ok(await entry.page.locator('#wave-connection').isHidden());
}

export async function runW4(values) {
  const output = path.resolve(values['output-dir']);
  const nativeDir = path.resolve(values['native-dir']);
  const temporary = await mkdtemp(path.join(tmpdir(), 'wave-w4-wire-'));
  const database = path.join(temporary, 'profiles.sqlite3');
  await mkdir(output, { recursive: true });
  const report = { stage: 'W4', status: 'failed', cases: {} };
  const clients = [];
  let host;
  let browser;
  try {
    report.native = execFileSync(
      'ctest',
      ['--test-dir', nativeDir, '--output-on-failure', '--no-tests=error', '-L', '^w4$'],
      { encoding: 'utf8' },
    );
    const seed = (highest) =>
      JSON.parse(
        execFileSync(path.join(nativeDir, 'wave_w3_seed'), [database, `--garden-wave=${highest}`], {
          encoding: 'utf8',
        }),
      ).token;
    const hostTokens = [6, 12, 17].map(seed);
    const joinerToken = seed(10);
    host = await startHost({
      snapshot: values.snapshot,
      nativeDir,
      port: 0,
      fixture: true,
      database,
    });
    browser = await chromium.launch({
      executablePath: values.browser,
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost', '--no-proxy-server'],
    });
    report.browser = browser.version();
    report.snapshot = host.snapshot;
    const state = async () => (await fetch(host.url + 'wave/test/state')).json();
    const step = async (ticks = 1) => {
      const response = await fetch(host.url + `wave/test/step/${ticks}`, { method: 'POST' });
      assert.ok(response.ok);
      return response.json();
    };
    const open = async (name, { suffix = '', token, labels } = {}) => {
      const storage = token
        ? {
            cookies: [],
            origins: [
              {
                origin: new URL(host.url).origin,
                localStorage: [{ name: 'cp6_player_id', value: token }],
              },
            ],
          }
        : undefined;
      const entry = await client(browser, host.url + suffix, name, storage, labels);
      clients.push(entry);
      return entry;
    };

    console.log('W4: native invitations, fourth-seat race and lobby feedback');
    const a = await open('host');
    await openSquad(a);
    const code = roster(a).code;
    const invite = '#wavelocal-' + code;
    const b = await open('second', { suffix: invite });
    const c = await open('third', { suffix: invite });
    const contenders = await Promise.all(
      ['fourth', 'fifth'].map((name) => open(name, { suffix: invite, labels: lobbyLabels })),
    );
    await until(
      () =>
        contenders.every((entry) => roster(entry)?.code === code || notices(entry).includes(full)),
      'Both concurrent invites get a result',
    );
    const admitted = contenders.filter((entry) => roster(entry)?.code === code);
    assert.equal(admitted.length, 1);
    const denied = contenders.find((entry) => entry !== admitted[0]);
    await drawNotice(denied, full);
    await until(() => roster(a)?.memberFlags.every((flag) => flag === 1), 'Four occupied seats');
    await denied.page.screenshot({ path: path.join(output, 'squad-full.png') });
    await a.page.screenshot({ path: path.join(output, 'four-seats.png') });
    const invalid = await open('wrong-code', { suffix: '#wavelocal-invalid', labels: lobbyLabels });
    await drawNotice(invalid, noRoom);
    await invalid.page.screenshot({ path: path.join(output, 'squad-missing.png') });
    report.cases['W4-01'] = {
      memberFlags: roster(a).memberFlags,
      code,
      failures: [denied, invalid].map((entry) => ({
        actions: entry.commands.filter((command) => command.opcode === 4),
        notices: notices(entry),
      })),
    };
    await admitted[0].context.close();
    await until(() => roster(a)?.memberFlags[3] === 0, 'Lobby departure opens fourth seat');
    const retry = await open('retry', { suffix: invite, token: denied.guest });
    await until(() => roster(retry)?.code === code, 'Rejected guest can retry into the freed seat');
    report.cases['W4-03'] = { admitted: admitted[0].name, denied: denied.name, retry: retry.name };
    const squad = [a, b, c, retry];
    await pause(700);
    for (const entry of squad) {
      await entry.page.mouse.click(660, 256);
    }
    await until(
      async () => (await state()).rooms[0]?.match,
      'Four native Ready actions start one match',
    );
    await step();
    await until(
      () => squad.every((entry) => entry.current?.control),
      'All four seats control flowers',
    );
    await Promise.all(
      squad.map((entry) => entry.page.waitForFunction(() => window.waveLabels.has('Wave 1'))),
    );
    report.cases['W4-01'].controlledPlayers = new Set(
      squad.map((entry) => entry.current.control),
    ).size;
    assert.equal(report.cases['W4-01'].controlledPlayers, 4);
    await a.page.screenshot({ path: path.join(output, 'four-flowers.png') });
    for (const entry of [...squad, denied, invalid]) {
      await entry.context.close();
    }
    await host.stop();
    host = await startHost({
      snapshot: values.snapshot,
      nativeDir,
      port: 0,
      fixture: true,
      database,
    });

    console.log('W4: native Ready matchmaking, Find Public lobbies, reconnect and Abandon');
    const candidates = [];
    for (const token of hostTokens) {
      const captain = await open('public-host-' + candidates.length, { token });
      await pause(650);
      assert.equal(roster(captain), undefined);
      await captain.page.mouse.click(660, 335);
      await until(
        async () =>
          roster(captain)?.public &&
          (await state()).rooms.some((room) => room.code === roster(captain).code && room.match),
        'Ready without a squad starts a public match when no running match is eligible',
      );
      candidates.push(captain);
    }
    const initial = await step();
    assert.deepEqual(
      initial.rooms.map((room) => room.wave).sort((a, b) => a - b),
      [4, 8, 11],
    );
    const running = candidates[1];
    await until(
      () => candidates.every((entry) => entry.current?.control),
      'All hosts have control',
    );
    const late = await open('late-joiner', { token: joinerToken });
    await openSquad(late, 374);
    const before = initial.rooms.find((room) => room.wave === 8);
    const privateCode = roster(late).code;
    await late.page.mouse.click(590, 290);
    await until(
      async () =>
        roster(late)?.public &&
        roster(late).code !== privateCode &&
        (await state()).rooms.some((room) => room.code === roster(late).code && !room.match),
      'Find Public creates a waiting lobby while eligible matches are running',
    );
    const waitingCode = roster(late).code;
    assert.ok(!late.current.control);
    await late.page.mouse.click(697, 260);
    await until(() => !roster(late), 'Closing the squad panel returns the guest to the menu');
    await pause(650);
    await late.page.mouse.click(660, 335);
    await until(
      () => late.current?.control && roster(late)?.code === before.code,
      'Ready without a squad yields immediate control without a simulation step',
    );
    assert.equal(late.current.wave, 8);
    assert.equal(late.current.wave, before.wave);
    await late.page.waitForFunction(() => window.waveLabels.has('Wave 8'));
    assert.ok(late.baseline.has(running.current.control), 'Late join receives existing entities');
    const atJoin = await state();
    const joined = atJoin.rooms.find((room) => room.match === before.match);
    assert.equal(joined.tick, before.tick);
    const lateId = joined.members[1].id;
    const body = (room) =>
      room.entities.find((entity) => entity.group === 0 && entity.owner === lateId);
    await late.page.mouse.move(770, 384);
    await until(
      async () => (await state()).acceptedInputs > atJoin.acceptedInputs && late.move?.strength > 2,
      'Native mouse sends a live movement command',
    );
    const moved = (await step(2)).rooms.find((room) => room.match === before.match);
    assert.notEqual(body(moved).x, body(joined).x);
    await late.page.screenshot({ path: path.join(output, 'late-join.png') });
    report.cases['W4-02'] = {
      candidates: [4, 8, 11],
      action: 'Ready without a squad',
      selectedWave: late.current.wave,
      room: before.code,
      findPublicWaitingRoom: waitingCode,
    };

    const life = joined.players.find((player) => player.id === lateId).life;
    await late.context.close();
    await until(
      async () =>
        !(await state()).rooms
          .find((room) => room.match === before.match)
          .members.find((member) => member.id === lateId).connected,
      'Running seat reserved on disconnect',
    );
    const resumed = await open('reconnected', { token: joinerToken, labels: lobbyLabels });
    await until(() => resumed.current?.control, 'Original client resumes the controlled flower');
    await resumed.page.waitForFunction(() => window.waveLabels.has('Wave 8'));
    const restored = (await state()).rooms.find((room) => room.match === before.match);
    assert.equal(restored.players.find((player) => player.id === lateId).life, life);
    assert.equal(roster(resumed).code, before.code);
    report.cases['W4-04'] = { wave: before.wave, joinTick: joined.tick, life, resumed: true };

    await resumed.page.mouse.move(18, 18);
    await resumed.page.waitForFunction(() => window.waveLabels.has('Abandon game'));
    await resumed.page.mouse.click(18, 18, { delay: 80 });
    await until(
      () => resumed.current?.epoch === 1 && !roster(resumed) && !resumed.current.control,
      'Native Abandon returns to a fresh lobby world',
    );
    await step();
    assert.equal(
      (await state()).rooms.find((room) => room.match === before.match).members.length,
      1,
    );
    await openSquad(resumed, 374);
    const newSquad = roster(resumed).code;
    assert.equal(roster(resumed).public, false);
    await resumed.page.mouse.click(660, 220);
    const oldMatches = new Set(initial.rooms.map((room) => room.match));
    await until(
      async () =>
        (await state()).rooms.some(
          (room) => room.code === newSquad && room.match && !oldMatches.has(room.match),
        ),
      'Ready in a new private squad starts its own match on the same socket',
    );
    report.cases['W4-06'] = { abandon: true, newMatch: true };

    for (const entry of clients) {
      assert.equal(entry.sockets.length, 1, entry.name);
      assert.equal(entry.documentLoads.length, 1, entry.name);
      assert.deepEqual(entry.errors, [], entry.name);
    }
    report.status = 'passed';
  } catch (error) {
    report.error = error.stack;
    for (const entry of clients) {
      if (!entry.page.isClosed()) {
        await entry.page
          .screenshot({ path: path.join(output, `failure-${entry.name}.png`) })
          .catch(() => {});
      }
    }
    throw error;
  } finally {
    await browser?.close();
    await host?.stop();
    await writeFile(path.join(output, 'wire.json'), JSON.stringify(report, null, 2) + '\n');
    await rm(temporary, { recursive: true, force: true });
  }
  console.log('W4 original-client squads and matchmaking passed');
}
