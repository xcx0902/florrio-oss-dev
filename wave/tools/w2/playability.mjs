import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { client, aim } from './online.mjs';
import { startHost } from './host.mjs';

const pause = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, description) {
  for (let i = 0; i < 100; ++i) {
    if (await predicate()) {
      return;
    }
    await pause(50);
  }
  assert.fail(description);
}

// Read-only observations of the locked October Wasm. No game state is injected.
async function consumed(entry) {
  return entry.page.evaluate(() => {
    const memory = new DataView(window.Module.asm.Jf.buffer);
    const u = (a) => memory.getUint32(a, true);
    const f = (a) => memory.getFloat32(a, true);
    const world = u(4347728);
    const profile = u(u(world + 2768));
    const body = u(profile + 2360);
    if (!body) {
      return { body: 0 };
    }
    const transform = u(body + 88);
    const flower = u(body + 128);
    const equipment = u(body + 68);
    return {
      body,
      x: f(transform + 40),
      y: f(transform + 64),
      radius: f(u(body + 92) + 8),
      health: memory.getUint8(flower + 10),
      level: memory.getUint8(profile + 8),
      equipment: Array.from({ length: 16 }, (_, i) =>
        memory.getUint16(equipment + 12 + i * 2, true),
      ),
    };
  });
}

function stableConnection(entry, before) {
  assert.equal(entry.sockets.length, before.sockets, 'No reconnect loop');
  assert.equal(entry.navigations.length, before.navigations, 'No page reload');
  assert.deepEqual(entry.errors, []);
}

export async function playabilityCases({ browser, snapshot, nativeDir, output, report }) {
  const evidence = { live: [], lifecycle: [] };
  const live = await startHost({ snapshot, nativeDir, port: 0 });
  let entry;
  try {
    console.log('W2-07: production clock, font, health, equipment, directions, orbit and exit');
    entry = await client(browser, live.url, 'playability');
    report.cases['W2-07'] = { status: 'failed', kind: 'production-clock' };
    const before = { sockets: entry.sockets.length, navigations: entry.navigations.length };
    await entry.page.mouse.move(512, 384);
    await entry.page.keyboard.press('Enter');
    await until(() => entry.current?.control, 'Original Ready enters production Garden');
    await pause(450);
    const start = await consumed(entry);
    assert.equal(start.health, 255, 'Original reader consumes full flower health');
    assert.ok(start.radius > 0, 'The original client reads the flower radius');
    assert.equal(start.level, 1);
    assert.deepEqual(start.equipment.slice(0, 5), [1, 1, 1, 1, 1]);
    const font = await entry.page.evaluate(async () => {
      await document.fonts.ready;
      return {
        loaded: document.fonts.check('700 18px Ubuntu', 'Garden'),
        faces: [...document.fonts]
          .filter((f) => f.family === 'Ubuntu')
          .map((f) => ({ weight: f.weight, status: f.status })),
        requests: performance
          .getEntriesByType('resource')
          .filter((r) => r.name.endsWith('.woff2'))
          .map((r) => new URL(r.name).pathname),
      };
    });
    assert.ok(
      font.loaded && font.requests.length > 0 && font.faces.some((f) => f.status === 'loaded'),
    );
    const arenas = [...entry.baseline.values()].filter((e) => e.arenaRadius);
    assert.equal(arenas.length, 1, 'One global arena component, never one per entity');
    assert.deepEqual(arenas[0].background, [30, 167, 97]);
    assert.ok(arenas[0].arenaRadius > start.radius * 10);
    const body = () => entry.baseline.get(entry.current.control);
    const petal = () => [...entry.baseline.values()].find((e) => e.petal);
    const orbit = [];
    for (let i = 0; i < 3; ++i) {
      const flower = body(),
        p = petal();
      assert.ok(flower && p);
      orbit.push({ tick: entry.current.tick, dx: p.x - flower.x, dy: p.y - flower.y });
      await pause(240);
    }
    assert.ok(
      Math.hypot(orbit[2].dx - orbit[0].dx, orbit[2].dy - orbit[0].dy) > 5,
      'Petals orbit across real host ticks',
    );
    assert.ok(
      orbit.every((p) => Math.hypot(p.dx, p.dy) > start.radius),
      'Petals surround the flower',
    );
    const directions = [];
    for (const [name, direction] of [
      ['right', [1, 0]],
      ['left', [-1, 0]],
      ['up', [0, -1]],
      ['down', [0, 1]],
    ]) {
      await aim(entry, direction);
      const from = { ...body() };
      await pause(300);
      const to = { ...body() };
      const rendered = await consumed(entry);
      assert.ok(
        (to.x - from.x) * direction[0] + (to.y - from.y) * direction[1] > 10,
        `Original mouse moves ${name}`,
      );
      assert.equal(to.angle, 0, 'Flower face remains upright');
      directions.push({ name, from, to, rendered });
    }
    const buttonCommands = [];
    for (const button of ['left', 'right']) {
      const first = entry.commands.length;
      await entry.page.mouse.down({ button });
      await until(
        () => entry.commands.slice(first).some((c) => c.opcode === 9 && c.buttons),
        `Original ${button} button input is accepted`,
      );
      await entry.page.mouse.up({ button });
      buttonCommands.push(...entry.commands.slice(first).filter((c) => c.opcode === 9));
    }
    for (const key of ['1', '2', '3', '4', '5', 'Space', 'Shift', 'Escape']) {
      await entry.page.keyboard.press(key);
    }
    stableConnection(entry, before);
    const screenshot = 'W2-07-production.png';
    await entry.page.screenshot({ path: path.join(output, screenshot) });
    evidence.live = entry.frames;
    await entry.page.mouse.click(18, 18);
    await until(
      () => !entry.current.control && ![...entry.baseline.values()].some((e) => e.arenaRadius),
      'Original exit returns to menu',
    );
    await pause(700);
    stableConnection(entry, before);
    assert.ok(
      entry.commands.some((c) => c.opcode === 11) && entry.commands.some((c) => c.opcode === 34),
    );
    await entry.page.keyboard.press('Enter');
    await until(() => entry.current.control, 'Ready works again after exit');
    stableConnection(entry, before);
    Object.assign(report.cases['W2-07'], {
      status: 'passed',
      start,
      font,
      arena: arenas[0],
      orbit,
      directions,
      buttonCommands,
      screenshot,
    });
  } finally {
    if (entry) {
      evidence.live = entry.frames;
      await entry.page.screenshot({ path: path.join(output, 'W2-07-final.png') }).catch(() => {});
      await entry.context.close();
    }
    await live.stop();
    await writeFile(
      path.join(output, 'playability.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    );
  }

  const fixture = await startHost({ snapshot, nativeDir, port: 0, fixture: true });
  entry = undefined;
  try {
    console.log('W2-08: real contact death, Enter Continue, fresh Ready without reload');
    entry = await client(browser, fixture.url, 'continue');
    report.cases['W2-08'] = { status: 'failed', kind: 'original-continue' };
    const before = { sockets: entry.sockets.length, navigations: entry.navigations.length };
    const state = async () => (await fetch(fixture.url + 'wave/test/state')).json();
    const advance = async (n = 1) => {
      const response = await fetch(fixture.url + `wave/test/step/${n}`, { method: 'POST' });
      assert.ok(response.ok);
      const value = await response.json();
      await pause(120);
      return value;
    };
    await entry.page.mouse.move(512, 384);
    await entry.page.keyboard.press('Enter');
    await pause(150);
    let s = await advance();
    await until(() => entry.current?.control, 'Fixture Ready enters Garden');
    const oldControl = entry.current.control;
    const oldEpoch = entry.current.epoch;
    const oldMatch = s.rooms[0].match;
    const target = s.rooms[0].entities.find((e) => e.group === 2);
    for (let i = 0; i < 80 && entry.current.control; ++i) {
      const flower = s.rooms[0].entities.find((e) => e.group === 0);
      if (!flower) {
        break;
      }
      const dx = target.x - flower.x,
        dy = target.y - flower.y,
        distance = Math.hypot(dx, dy);
      await aim(entry, [dx / distance, dy / distance], Math.min(200, distance * 50));
      s = await advance(Math.max(1, Math.min(6, Math.floor(distance / 2))));
    }
    await until(
      () => !entry.current.control,
      'Real W1 contact damage removes the controlled flower',
    );
    assert.equal(s.rooms[0].players[0].state, 2, 'Solo wipe eliminates the last player');
    assert.deepEqual(
      [...entry.baseline.values()].find((e) => e.arenaRadius).background,
      [30, 167, 97],
    );
    await pause(1100);
    const death = 'W2-08-death.png';
    await entry.page.screenshot({ path: path.join(output, death) });
    await entry.page.keyboard.press('Enter');
    await until(
      () => ![...entry.baseline.values()].some((e) => e.arenaRadius),
      'Death Continue leaves the finished match',
    );
    await pause(1900);
    assert.ok(
      entry.commands.some((c) => c.opcode === 21),
      'Original death Enter sends Continue',
    );
    stableConnection(entry, before);
    assert.equal((await state()).rooms.length, 0);
    // $939 has two Continue stages: request settlement (21), then dismiss
    // the result screen and finish the optional ad attempt (34).
    await entry.page.keyboard.press('Enter');
    await until(
      () => entry.commands.some((c) => c.opcode === 34),
      'Second Continue dismisses the original result screen',
    );
    await pause(700);
    const menu = 'W2-08-menu.png';
    await entry.page.screenshot({ path: path.join(output, menu) });
    stableConnection(entry, before);
    await entry.page.keyboard.press('Enter');
    await pause(150);
    await until(
      async () => (await state()).rooms.some((r) => r.match),
      'Ready creates a new match',
    );
    s = await advance();
    await until(() => entry.current.control, 'Enter Ready starts a fresh match after death');
    assert.notEqual(s.rooms[0].match, oldMatch);
    assert.ok(
      entry.current.epoch > oldEpoch,
      'A fresh native world separates the new control from the old dead entity',
    );
    const alive = await consumed(entry);
    assert.equal(alive.health, 255);
    assert.equal(s.rooms[0].players[0].state, 1);
    await pause(700);
    stableConnection(entry, before);
    const screenshot = 'W2-08-rejoined.png';
    await entry.page.screenshot({ path: path.join(output, screenshot) });
    await aim(entry);
    s = await advance(3);
    // Pick a route after both batches spawn so this checks the arena boundary.
    const room = s.rooms[0];
    const flower = room.entities.find((e) => e.group === 0);
    const mobs = room.entities.filter((e) => e.group === 2);
    const bearing = Array.from({ length: 16 }, (_, i) => {
      const angle = (i * Math.PI) / 8;
      const x = Math.cos(angle),
        y = Math.sin(angle);
      const clearance = Math.min(
        ...mobs.map((mob) => {
          const dx = mob.x - flower.x,
            dy = mob.y - flower.y;
          const along = Math.max(0, dx * x + dy * y);
          return Math.hypot(dx - along * x, dy - along * y) - mob.radius - flower.radius;
        }),
      );
      return { direction: [x, y], clearance };
    }).sort((a, b) => b.clearance - a.clearance)[0];
    assert.ok(bearing.clearance > 0, 'Fixture has an unobstructed route to the arena edge');
    await aim(entry, bearing.direction);
    await advance(100);
    await pause(500);
    assert.ok(entry.current.control, 'Flower survives travel to the boundary');
    const atEdge = await consumed(entry);
    const arenaRadius = [...entry.baseline.values()].find((e) => e.arenaRadius).arenaRadius;
    const distance = Math.hypot(atEdge.x, atEdge.y);
    assert.ok(
      distance <= arenaRadius && distance > arenaRadius - atEdge.radius * 2,
      'Original rendered flower reaches and respects the authoritative boundary',
    );
    const boundary = 'W2-08-boundary.png';
    await entry.page.screenshot({ path: path.join(output, boundary) });
    evidence.lifecycle = entry.frames;
    Object.assign(report.cases['W2-08'], {
      status: 'passed',
      oldMatch,
      newMatch: s.rooms[0].match,
      oldControl,
      oldEpoch,
      newEpoch: entry.current.epoch,
      newControl: entry.current.control,
      alive,
      death,
      menu,
      screenshot,
      boundary,
      atEdge,
    });
  } finally {
    if (entry) {
      evidence.lifecycle = entry.frames;
      await entry.page.screenshot({ path: path.join(output, 'W2-08-final.png') }).catch(() => {});
      await entry.context.close();
    }
    await fixture.stop();
    await writeFile(
      path.join(output, 'playability.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    );
  }
}

export async function biomeSelectionCase({ browser, snapshot, nativeDir, output, report }) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'wave-native-biomes-'));
  const database = path.join(temporary, 'profiles.sqlite3');
  let host = await startHost({ snapshot, nativeDir, port: 0, database });
  let entry;
  try {
    console.log('W2-09: native Garden button and server-selected Desert/Ocean rotation');
    report.cases['W2-09'] = { status: 'failed', kind: 'original-mode-selection' };
    entry = await client(browser, host.url, 'mode-recovery');
    await pause(700);
    console.log('W2-10: original squad close leaves without reconnect or reload');
    report.cases['W2-10'] = { status: 'failed', kind: 'original-squad-leave' };
    const menuConnection = { sockets: entry.sockets.length, loads: entry.documentLoads.length };
    for (const request of [1, 2]) {
      await entry.page.mouse.click(660, 408);
      await entry.page.waitForFunction(() => location.hash.startsWith('#wavelocal-'));
      assert.ok(entry.commands.some((c) => c.opcode === 27 && c.value === request));
      await pause(700);
      await entry.page.mouse.click(697, 296);
      await until(
        () =>
          entry.commands.filter((c) => c.opcode === 38).length === request &&
          !entry.baseline.has(8194),
        'Original squad close removes the roster',
      );
      await pause(700);
    }
    assert.equal(entry.sockets.length, menuConnection.sockets);
    assert.equal(
      entry.documentLoads.length,
      menuConnection.loads,
      'Hash changes do not reload the page',
    );
    assert.equal(new URL(entry.page.url()).hash, '');
    assert.deepEqual(entry.errors, []);
    const squad = 'W2-10-squad-left.png';
    await entry.page.screenshot({ path: path.join(output, squad) });
    Object.assign(report.cases['W2-10'], { status: 'passed', screenshot: squad });
    const scenes = [];
    const origin = new URL(host.url).origin;
    const saved = await (await fetch(host.url + `wave/cache/${entry.guest}`)).json();
    async function selectMode(mode) {
      const connections = entry.sockets.length;
      const loads = entry.documentLoads.length;
      await entry.page.mouse.click(mode ? 440 : 375, 406);
      await until(
        () => entry.sockets.length === connections + 1 && entry.baseline.get(8198)?.mode === mode,
        `Native mode ${mode} connects`,
      );
      await pause(700);
      assert.equal(
        new URL(entry.sockets.at(-1)).pathname,
        mode ? '/wave/socket/rotating' : '/wave/socket',
      );
      assert.equal(entry.documentLoads.length, loads, 'Native mode selection keeps the document');
      assert.equal(
        await entry.page.evaluate(() => localStorage.getItem('florrio_gamemode')),
        String(mode),
      );
    }
    async function enterScene(name, biome, rotation, rgb, pool) {
      assert.equal(await entry.page.locator('select').count(), 0, 'No injected biome selector');
      assert.equal(new URL(entry.page.url()).search, '', 'No biome query parameter');
      assert.equal(entry.baseline.get(8198)?.rotation, rotation);
      await entry.page.evaluate(() => window.waveLabels.clear());
      await entry.page.waitForFunction(
        (label) => window.waveLabels.has(label),
        rotation ? 'Ocean' : 'Desert',
      );
      // The rotating button selects mode 1; clicking it again cannot flip its biome.
      const connections = entry.sockets.length;
      if (biome) {
        await entry.page.mouse.click(440, 406);
        await pause(350);
        assert.equal(entry.sockets.length, connections, 'Selected rotation is not a toggle');
      }
      const memory = await entry.page.evaluate(() => {
        const view = new DataView(window.Module.asm.Jf.buffer);
        const world = view.getUint32(4347728, true);
        return { mode: view.getUint8(world + 60), rotation: view.getUint32(world + 76, true) };
      });
      assert.deepEqual(memory, { mode: biome ? 1 : 0, rotation });
      const menu = `W2-09-${name}-menu.png`;
      await entry.page.screenshot({ path: path.join(output, menu) });
      await entry.page.mouse.move(512, 384);
      await entry.page.keyboard.press('Enter');
      await until(
        () => entry.current?.control && entry.baseline.get(8197)?.biome === biome,
        `Original client enters ${name} arena`,
      );
      assert.deepEqual(entry.baseline.get(8196).background, rgb);
      const mobs = [...entry.baseline.values()].filter((e) => e.mob);
      assert.ok(mobs.length && mobs.every((e) => pool.includes(e.mob)), `${name} wave 1 pool`);
      const activeBiome = await entry.page.evaluate(() => {
        const memory = new DataView(window.Module.asm.Jf.buffer);
        return memory.getUint32(memory.getUint32(4347728, true) + 828, true);
      });
      assert.equal(activeBiome, biome);
      await pause(450); // Let the original canvas finish transitioning away from the menu.
      const screenshot = `W2-09-${name}.png`;
      await entry.page.screenshot({ path: path.join(output, screenshot) });
      assert.equal(
        await entry.page.evaluate(() => localStorage.getItem('cp6_player_id')),
        entry.guest,
      );
      const profile = await (await fetch(host.url + `wave/cache/${entry.guest}`)).json();
      assert.equal(profile.equipped, saved.equipped, 'Equipment persists across native modes');
      assert.deepEqual(entry.errors, []);
      scenes.push({
        name, biome, rotation, memory, mobs: mobs.map((mob) => mob.mob), menu, screenshot,
      });
      await entry.page.mouse.click(18, 18);
      await until(() => !entry.current.control && !entry.baseline.has(8197), 'Exit to native menu');
      await pause(700);
    }
    async function inviteRotation(rotation) {
      await entry.page.mouse.click(660, 408);
      await entry.page.waitForFunction(() => location.hash.startsWith('#waverotation-'));
      const invite = entry.page.url();
      const peer = await client(browser, invite, 'fresh-rotation-invite');
      try {
        await until(
          () => entry.baseline.get(8194)?.memberFlags[1] === 1 && peer.baseline.has(8194),
          'Fresh native invite joins the same rotating squad',
        );
        assert.equal(peer.baseline.get(8194).code, entry.baseline.get(8194).code);
        assert.equal(peer.baseline.get(8198).mode, 1);
        assert.equal(peer.baseline.get(8198).rotation, rotation);
        assert.equal(peer.sockets.length, 1, 'Invitation selects the mode on the first connection');
        assert.equal(new URL(peer.sockets.at(-1)).pathname, '/wave/socket/rotating');
        assert.equal(
          await peer.page.evaluate(() => localStorage.getItem('florrio_gamemode')),
          '1',
        );
        assert.ok(peer.requests.every((url) => new URL(url).origin === origin));
        assert.deepEqual(peer.errors, []);
      } finally {
        await peer.context.close();
      }
      await pause(700);
      await entry.page.mouse.click(697, 296);
      await until(() => !entry.baseline.has(8194), 'Close rotating squad');
      await pause(700);
      return new URL(invite).hash;
    }
    await selectMode(1);
    await enterScene('desert', 1, 0, [211, 196, 113], [2, 16, 17, 25]);
    scenes.at(-1).invite = await inviteRotation(0);
    await selectMode(0);
    await enterScene('garden', 0, 0, [30, 167, 97], [1, 3, 4, 5]);
    await selectMode(1);
    const loads = entry.documentLoads.length;
    // Change the host's rotation, retaining the origin, mode-1 cache and saved profile.
    const port = Number(new URL(host.url).port);
    await host.stop();
    host = await startHost({ snapshot, nativeDir, port, database, rotation: 'ocean' });
    await entry.page.reload();
    await until(() => entry.baseline.get(8198)?.rotation === 1, 'Server announces Ocean rotation');
    await pause(700);
    assert.equal(entry.documentLoads.length, loads + 1, 'Only the deliberate host restart reloads');
    assert.equal(await entry.page.evaluate(() => localStorage.getItem('florrio_gamemode')), '1');
    await enterScene('ocean', 2, 1, [53, 140, 195], [26, 28, 33]);
    scenes.at(-1).invite = await inviteRotation(1);
    await selectMode(0);
    assert.equal(entry.baseline.get(8198).rotation, 1, 'Garden also publishes the active rotation');
    await selectMode(1);
    assert.equal(entry.baseline.get(8198).rotation, 1, 'Native Ocean selection survives Garden');
    assert.ok(entry.requests.every((url) => new URL(url).origin === origin));
    assert.deepEqual(entry.errors, []);
    Object.assign(report.cases['W2-09'], { status: 'passed', scenes });
  } finally {
    if (entry) {
      await entry.page.screenshot({ path: path.join(output, 'W2-09-final.png') }).catch(() => {});
      await entry.context.close();
    }
    await host.stop();
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function publicSquadCase({ browser, snapshot, nativeDir, output, report }) {
  console.log('W2-13: original Public, Find Public, squad equipment and green Ready');
  report.cases['W2-13'] = { status: 'failed', kind: 'original-public-squad' };
  const temporary = await mkdtemp(path.join(tmpdir(), 'wave-squad-'));
  const database = path.join(temporary, 'profiles.sqlite3');
  let host;
  const contexts = [];
  const roster = (entry) => entry.baseline.get(8194);
  const open = async (name, token) => {
    const entry = await client(browser, host.url, name, {
      cookies: [],
      origins: [
        {
          origin: new URL(host.url).origin,
          localStorage: [{ name: 'cp6_player_id', value: token }],
        },
      ],
    });
    contexts.push(entry.context);
    await pause(700);
    await entry.page.screenshot({ path: path.join(output, 'W2-13-' + name + '-menu.png') });
    await entry.page.mouse.click(660, 374);
    await entry.page.waitForFunction(() => location.hash.startsWith('#wavelocal-'));
    await pause(700); // Wait for the native panel animation before clicking its controls.
    await entry.page.screenshot({ path: path.join(output, 'W2-13-' + name + '-lobby.png') });
    return entry;
  };
  try {
    const seed = (...args) =>
      JSON.parse(
        execFileSync(path.join(nativeDir, 'wave_w3_seed'), [database, ...args], {
          encoding: 'utf8',
        }),
      );
    const first = seed();
    const second = seed('--behaviors');
    host = await startHost({ snapshot, nativeDir, port: 0, database });
    const a = await open('public-host', first.token);
    let code = roster(a).code;
    assert.equal(roster(a).public, false);
    await a.page.mouse.click(338, 290);
    await until(() => roster(a)?.public, 'The native Public checkbox updates the squad');
    assert.equal(roster(a).code, code);
    await a.page.mouse.click(338, 290);
    await until(() => !roster(a)?.public, 'The native checkbox can make the squad private');
    await a.page.mouse.click(338, 290);
    await until(() => roster(a)?.public, 'The squad is public again');
    await a.page.mouse.click(590, 290);
    await until(() => roster(a)?.code !== code, 'Find Public falls back to a new public squad');
    code = roster(a).code;
    assert.equal(roster(a).public, true);
    await a.page.waitForFunction((code) => location.hash === '#wavelocal-' + code, code);

    const b = await open('public-joiner', second.token);
    await b.page.mouse.click(590, 290);
    await until(
      () => roster(b)?.code === code && roster(a)?.memberFlags[1] === 1,
      'Find Public joins the existing squad on the same connection',
    );
    await b.page.waitForFunction((code) => location.hash === '#wavelocal-' + code, code);
    await pause(700);
    const expected = [
      [1, 1, 1, 1, 1, 5 | (1 << 8), ...Array(10).fill(0)],
      second.slots.map((item) => (item ? item[0] | (item[1] << 8) : 0)),
      Array(16).fill(0),
      Array(16).fill(0),
    ];
    for (const entry of [a, b]) {
      assert.deepEqual(
        roster(entry).squadEquipment,
        expected,
        'All main and reserve petals retain their kinds and rarities',
      );
      const consumed = await entry.page.evaluate(() => {
        const memory = new DataView(window.Module.asm.Jf.buffer);
        const u = (at) => memory.getUint32(at, true);
        const roster = u(u(917864 + 772));
        return Array.from({ length: 4 }, (_, member) =>
          Array.from({ length: 16 }, (_, slot) =>
            memory.getUint16(roster + 248 + 2 * (slot * 4 + member), true),
          ),
        );
      });
      assert.deepEqual(consumed, expected, 'The original Wasm consumes the complete preview');
    }
    await b.page.mouse.click(660, 220);
    await until(() => roster(a)?.memberFlags[1] === 3, 'A sees the second member ready');
    assert.ok(!a.current.control && !b.current.control, 'One ready member does not start a match');
    const screenshot = 'W2-13-public-ready.png';
    await pause(450);
    await a.page.screenshot({ path: path.join(output, screenshot) });
    await a.page.waitForFunction(() => window.waveGreenReadyDraws > 0);
    await b.page.mouse.click(660, 220);
    await until(() => roster(a)?.memberFlags[1] === 1, 'The second seat can cancel Ready');
    assert.deepEqual(
      b.commands.filter((c) => c.opcode === 7).map((c) => c.value),
      [1, 0],
    );
    for (const entry of [a, b]) {
      assert.equal(entry.sockets.length, 1);
      assert.equal(entry.documentLoads.length, 1);
      assert.deepEqual(entry.errors, []);
      assert.equal(await entry.page.locator('#wave-connection').isHidden(), true);
    }
    await b.context.close();
    await until(() => roster(a)?.memberFlags[1] === 0, 'The lost connection frees a lobby seat');
    assert.equal(a.sockets.length, 1);
    Object.assign(report.cases['W2-13'], {
      status: 'passed',
      screenshot,
      equipment: expected,
      readyToggle: [1, 0],
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await host?.stop();
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function connectionRecoveryCase({ browser, snapshot, nativeDir, output, report }) {
  console.log('W2-12: same-guest tabs, stalled cache or socket, and explicit reconnect');
  report.cases['W2-12'] = { status: 'failed', kind: 'connection-recovery' };
  const host = await startHost({ snapshot, nativeDir, port: 0 });
  const contexts = [];
  const banner = (page) => page.locator('#wave-connection');
  try {
    const a = await client(browser, host.url, 'first-tab');
    contexts.push(a.context);
    const b = await client(browser, host.url, 'second-tab', await a.context.storageState());
    contexts.push(b.context);
    assert.equal(a.guest, b.guest);
    await banner(a.page)
      .getByText(/another tab/)
      .waitFor();
    await pause(1100); // The legacy client used to reload 500 ms after a forced disconnect.
    assert.deepEqual([a.documentLoads.length, b.documentLoads.length], [1, 1]);
    assert.deepEqual([a.sockets.length, b.sockets.length], [1, 1]);
    await b.page.keyboard.press('Enter');
    await until(() => b.current?.control, 'Replacement tab can still enter the arena');
    await banner(a.page).getByRole('button', { name: 'Reconnect' }).click();
    await until(
      () => a.sockets.length === 2 && a.baseline.has(8193),
      'The reconnect button hands the same guest back to the first tab',
    );
    assert.equal(await a.page.evaluate(() => localStorage.getItem('cp6_player_id')), a.guest);
    await banner(b.page)
      .getByText(/another tab/)
      .waitFor();
    await pause(600);
    assert.deepEqual([a.documentLoads.length, b.documentLoads.length], [2, 1]);
    assert.deepEqual([...a.errors, ...b.errors], []);

    const faulty = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    contexts.push(faulty);
    let releaseCache;
    const blocked = new Promise((resolve) => {
      releaseCache = resolve;
    });
    await faulty.route('**/wave/cache/**', async (route) => {
      await blocked;
      await route.fulfill({ status: 503, body: 'Profile temporarily unavailable' });
    });
    const page = await faulty.newPage();
    let loads = 0;
    page.on('domcontentloaded', () => ++loads);
    await page.addInitScript(() => {
      // Delay delivery on a real Wave socket, keeping the native upgrade and
      // Origin header intact. Resume with the original frames in order.
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(url, protocols) {
          super(url, protocols);
          if (new URL(url).pathname !== '/wave/socket') {
            return;
          }
          window.waveTestSocket = this;
          let stalled = !sessionStorage.getItem('waveTestResumed');
          const buffered = [];
          this.addEventListener('message', (event) => {
            if (stalled) {
              event.stopImmediatePropagation();
              buffered.push(event.data);
            }
          });
          window.waveTestResume = () => {
            stalled = false;
            sessionStorage.setItem('waveTestResumed', '1');
            for (const data of buffered.splice(0)) {
              this.dispatchEvent(new MessageEvent('message', { data }));
            }
          };
        }
      };
      const draw = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
        if (value === 'Ready') {
          window.waveReadyDrawn = true;
        }
        return draw.call(this, value, ...args);
      };
    });
    await Promise.all([page.waitForRequest('**/wave/cache/**'), page.goto(host.url)]);
    assert.equal(await page.locator('select').count(), 0, 'Page stays responsive without a selector');
    releaseCache();
    const recovery = banner(page);
    await recovery.getByText(/Could not load your saved profile/).waitFor();
    await faulty.unroute('**/wave/cache/**');
    const retry = recovery.getByRole('button', { name: 'Reconnect' });
    await retry.click();
    await recovery.getByText(/No response from the game server/).waitFor({ timeout: 15000 });
    assert.equal(loads, 2, 'A silent socket leaves the page available for recovery');
    await page.evaluate(() => window.waveTestResume());
    await page.waitForFunction(() => window.waveReadyDrawn);
    await recovery.waitFor({ state: 'hidden' });
    assert.equal(loads, 2, 'Traffic can resume without reloading the game');

    const guest = await page.evaluate(() => localStorage.getItem('cp6_player_id'));
    assert.ok(guest);
    await page.evaluate(() => window.waveTestSocket.send(Uint8Array.of(255)));
    await recovery.getByText(/The server ended this session/).waitFor();
    await pause(1100);
    assert.equal(loads, 2, 'The fatal wire reply does not start an automatic reload loop');
    const screenshot = 'W2-12-reconnect.png';
    await page.screenshot({ path: path.join(output, screenshot) });
    await Promise.all([page.waitForEvent('domcontentloaded'), retry.click()]);
    await page.waitForFunction(() => window.waveReadyDrawn);
    assert.equal(await page.evaluate(() => localStorage.getItem('cp6_player_id')), guest);
    assert.equal(loads, 3);
    await recovery.waitFor({ state: 'hidden' });
    Object.assign(report.cases['W2-12'], { status: 'passed', screenshot });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await host.stop();
  }
}
