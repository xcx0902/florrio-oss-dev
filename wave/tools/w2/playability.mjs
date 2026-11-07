import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
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
    assert.equal(start.radius, 25, 'Locally calibrated flower body and collision radius');
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
    assert.notEqual(
      entry.current.control,
      oldControl,
      'Old dead entity cannot become the new control',
    );
    const alive = await consumed(entry);
    assert.equal(alive.health, 255);
    assert.equal(s.rooms[0].players[0].state, 1);
    await pause(700);
    stableConnection(entry, before);
    const screenshot = 'W2-08-rejoined.png';
    await entry.page.screenshot({ path: path.join(output, screenshot) });
    // Travel along an empty bearing to the actual W1 circular boundary.
    await aim(entry, [-1 / Math.hypot(1, 0.3), -0.3 / Math.hypot(1, 0.3)]);
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

export async function modeRecoveryCase({ browser, snapshot, nativeDir, output, report }) {
  const host = await startHost({ snapshot, nativeDir, port: 0 });
  let entry;
  try {
    console.log('W2-09: unavailable scene discovery, explicit Garden recovery');
    report.cases['W2-09'] = { status: 'failed', kind: 'original-mode-selection' };
    entry = await client(browser, host.url, 'mode-recovery');
    await pause(700);
    console.log('W2-10: original squad close leaves without reconnect or reload');
    report.cases['W2-10'] = { status: 'failed', kind: 'original-squad-leave' };
    const menuConnection = { sockets: entry.sockets.length, loads: entry.documentLoads.length };
    await entry.page.mouse.click(660, 408);
    await entry.page.waitForFunction(() => location.hash.startsWith('#wavelocal-'));
    await pause(700);
    await entry.page.mouse.click(697, 296);
    await until(
      () => entry.commands.some((c) => c.opcode === 38) && !entry.baseline.has(8194),
      'Original squad close removes the roster',
    );
    await pause(700);
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
    const before = {
      sockets: entry.sockets.length,
      navigations: entry.navigations.length,
      requests: entry.requests.length,
    };
    await entry.page.mouse.click(440, 406); // Original Desert button.
    const notice = entry.page.getByRole('dialog');
    await notice.waitFor({ state: 'visible' });
    assert.match(await notice.textContent(), /Desert and PvP are not available yet/);
    await pause(5500); // Longer than the original failed-discovery retry interval.
    stableConnection(entry, before);
    assert.equal(entry.requests.length, before.requests, 'Unavailable discovery is suspended');
    assert.ok(entry.requests.every((url) => new URL(url).origin === new URL(host.url).origin));
    const unavailable = 'W2-09-unavailable.png';
    await entry.page.screenshot({ path: path.join(output, unavailable) });
    await entry.page.getByRole('button', { name: 'Return to Garden' }).click();
    await until(
      () => entry.sockets.length === before.sockets + 1 && entry.baseline.has(8193),
      'Explicit recovery reconnects Garden once',
    );
    assert.equal(await entry.page.evaluate(() => localStorage.getItem('florrio_gamemode')), '0');
    assert.equal(
      await entry.page.evaluate(() => localStorage.getItem('cp6_player_id')),
      entry.guest,
    );
    await pause(700);
    await entry.page.keyboard.press('Enter');
    await until(() => entry.current?.control, 'Ready works after scene recovery');
    await pause(700);
    assert.equal((await consumed(entry)).health, 255);
    assert.equal(
      entry.navigations.length,
      before.navigations + 1,
      'Only the user-requested recovery navigates',
    );
    assert.equal(entry.sockets.length, before.sockets + 1);
    assert.deepEqual(entry.errors, []);
    const screenshot = 'W2-09-recovered.png';
    await entry.page.screenshot({ path: path.join(output, screenshot) });
    Object.assign(report.cases['W2-09'], {
      status: 'passed',
      unavailable,
      screenshot,
      navigations: entry.navigations,
      requests: entry.requests,
    });
  } finally {
    if (entry) {
      await entry.page.screenshot({ path: path.join(output, 'W2-09-final.png') }).catch(() => {});
      await entry.context.close();
    }
    await host.stop();
  }
}
