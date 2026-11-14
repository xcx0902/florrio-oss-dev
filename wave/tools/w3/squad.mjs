import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { client, aim } from '../w2/online.mjs';
import { startHost } from '../w2/host.mjs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function bounded(promise) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Squad client stopped responding')), 6000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

// Observe the actual native canvas loop and control pointer across admission,
// Ready, mixed effects and reconnects. No client memory or socket writes.
async function healthy(c) {
  const before = await bounded(c.page.evaluate(() => {
    if (window.waveSquadDraws === undefined) {
      window.waveSquadDraws = 0;
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (this.canvas === window.Module.canvas) ++window.waveSquadDraws;
        return draw.apply(this, args);
      };
    }
    return window.waveSquadDraws;
  }));
  await pause(200);
  const state = await bounded(c.page.evaluate(() => {
    const d = new DataView(window.Module.asm.Jf.buffer);
    const u = (address) => d.getUint32(address, true);
    const profile = u(u(u(4347728) + 2768));
    const body = u(profile + 2360);
    return {
      control: body ? u(body + 28) : 0,
      exitLatch: d.getUint8(4350150),
      draws: window.waveSquadDraws,
      recoveryHidden: document.querySelector('#wave-connection').hidden,
    };
  }));
  assert.ok(state.recoveryHidden, `${c.name}: connection remains active`);
  assert.ok(state.draws > before, `${c.name}: original renderer keeps drawing`);
  if (state.control) assert.equal(state.exitLatch, 0, `${c.name}: live game UI is active`);
  assert.deepEqual(c.errors, [], `${c.name}: native reader and capture remain valid`);
  return state;
}

export async function squadCase({ browser, snapshot, nativeDir, temporary, output, report, seed }) {
  const scenarios = [];
  for (const mode of ['--squad', '--behaviors']) {
    const label = mode.slice(2);
    console.log(`W3 squad: Basic + ${label}, Ready, attack and repeated refresh`);
    const database = path.join(temporary, `${label}-multiplayer.sqlite3`);
    const mixed = seed(database, mode), basic = seed(database);
    const host = await startHost({ snapshot, nativeDir, port: 0, fixture: true, database });
    const clients = [];
    const state = async () => (await fetch(host.url + 'wave/test/state')).json();
    const advance = async (ticks) => {
      const response = await fetch(host.url + `wave/test/step/${ticks}`, { method: 'POST' });
      assert.ok(response.ok);
      await pause(250);
      return response.json();
    };
    const storage = (token) => ({ cookies: [], origins: [{
      origin: new URL(host.url).origin,
      localStorage: [{ name: 'cp6_player_id', value: token }],
    }] });
    try {
      const a = await client(browser, host.url, `${label}-mixed`, storage(mixed.token));
      clients.push(a);
      await pause(600);
      await a.page.mouse.click(670, 373);
      await a.page.waitForFunction(() => location.hash.startsWith('#wavelocal-'));
      const invite = new URL(a.page.url()).hash;
      const b = await client(browser, host.url + invite, `${label}-basic`, storage(basic.token));
      clients.push(b);
      await pause(600);
      await a.page.mouse.click(660, 220);
      await b.page.mouse.click(660, 220);
      await pause(250);
      const ready = (await state()).rooms[0];
      assert.ok(ready.match);
      assert.equal(ready.members.length, 2);

      // Reload before the first simulated tick, while startup has no life ACK.
      await a.page.reload();
      await pause(400);
      await healthy(a);
      const started = (await advance(1)).rooms[0];
      const lives = started.players.map(({ id, life }) => [id, life]);
      for (const c of clients) {
        assert.ok((await healthy(c)).control, `${c.name}: Ready controls a live flower`);
        await aim(c);
      }
      await a.page.mouse.down();
      for (let i = 0; i < 6; ++i) {
        await advance(25);
        for (const c of clients) assert.ok((await healthy(c)).control);
      }
      await a.page.mouse.up();
      const before = (await state()).rooms[0];
      assert.deepEqual(before.players.map(({ id, life }) => [id, life]), lives);
      // Both identities recover the same match and life, including repeated and
      // simultaneous refreshes after the original startup Equip has been ACKed.
      for (const group of [[a], [b], [a, b]]) {
        await Promise.all(group.map((c) => c.page.reload()));
        await pause(500);
        for (const c of clients) assert.ok((await healthy(c)).control);
      }
      const recovered = (await state()).rooms[0];
      assert.equal(recovered.match, ready.match);
      assert.equal(recovered.tick, before.tick);
      assert.deepEqual(recovered.players.map(({ id, life }) => [id, life]), lives);
      assert.ok(recovered.members.every((m) => m.connected));
      assert.deepEqual(clients.map((c) => c.sockets.length), [4, 3]);
      assert.deepEqual(clients.map((c) => c.documentLoads.length), [4, 3]);
      for (const c of clients) await aim(c, [0, 1]);
      const resumed = (await advance(2)).rooms[0];
      for (const body of recovered.entities.filter((e) => e.group === 0)) {
        const moved = resumed.entities.find((e) => e.group === 0 && e.owner === body.owner);
        assert.ok(moved && moved.y > body.y, 'Reconnected players can still move');
      }
      for (const c of clients) await healthy(c);
      const screenshot = `squad-${label}.png`;
      await a.page.screenshot({ path: path.join(output, screenshot) });
      scenarios.push({
        label, status: 'passed', mixedSlots: mixed.slots, lives,
        tick: resumed.tick, screenshot,
        sockets: clients.map((c) => c.sockets.length),
      });
    } finally {
      await Promise.all(clients.map((c) => c.context.close()));
      await host.stop();
    }
  }
  report.cases.squadReadyReconnect = { status: 'passed', scenarios };
}

export async function realtimeReadyCase({ browser, snapshot, nativeDir, temporary, report, seed }) {
  console.log('W3 Ready: solo admission with Basic and mixed equipment on the production clock');
  const database = path.join(temporary, 'realtime-ready.sqlite3');
  seed(database);
  const host = await startHost({ snapshot, nativeDir, port: 0, database });
  const rounds = [];
  try {
    for (const mode of [undefined, '--squad']) {
      const profile = seed(database, mode);
      const storage = { cookies: [], origins: [{
        origin: new URL(host.url).origin,
        localStorage: [{ name: 'cp6_player_id', value: profile.token }],
      }] };
      const c = await client(browser, host.url, `realtime-ready-${rounds.length}`, storage);
      try {
        await c.page.keyboard.press('Enter');
        await c.page.waitForFunction(() => {
          const d = new DataView(window.Module.asm.Jf.buffer);
          const u = (address) => d.getUint32(address, true);
          return u(u(u(u(4347728) + 2768)) + 2360) !== 0;
        });
        const state = await healthy(c);
        assert.ok(state.control, 'Real-time Ready controls a live flower');
        assert.equal(c.sockets.length, 1, 'Ready needs no reconnect or page refresh');
        rounds.push({ round: rounds.length + 1, control: state.control, mixed: Boolean(mode) });
      } finally {
        await c.context.close();
      }
      // Let the production clock apply the actual socket disconnect.
      await pause(60);
    }
  } finally {
    await host.stop();
  }
  report.cases.realtimeReady = { status: 'passed', rounds };
}

export async function abandonReentryCase({ browser, snapshot, nativeDir, temporary, output, report, seed }) {
  const scenarios = [];
  const wait = async (predicate, message) => {
    for (let i = 0; i < 240; ++i) {
      if (predicate()) return;
      await pause(25);
    }
    assert.ok(predicate(), message);
  };
  for (const [label, mode, size] of [
    ['solo-mixed', '--squad', 1], ['squad-effects', '--behaviors', 2],
  ]) {
    console.log(`W3 Abandon: ${label}, enter and reenter without refresh`);
    const database = path.join(temporary, `${label}-reentry.sqlite3`);
    const profiles = [seed(database, mode)];
    if (size === 2) profiles.push(seed(database));
    const host = await startHost({ snapshot, nativeDir, port: 0, fixture: true, database });
    const clients = [], rounds = [];
    const state = async () => (await fetch(host.url + 'wave/test/state')).json();
    try {
      for (const [index, profile] of profiles.entries()) {
        clients.push(await client(browser, host.url, `${label}-${index}`, {
          cookies: [], origins: [{ origin: new URL(host.url).origin,
            localStorage: [{ name: 'cp6_player_id', value: profile.token }] }],
        }));
      }
      for (let round = 0; round < 2; ++round) {
        await pause(600);
        if (size === 2) {
          const a = clients[0], b = clients[1];
          for (const c of clients) await c.page.mouse.click(670, 373);
          await wait(() => clients.every((c) => c.baseline.get(8194)?.code),
            'Both players open the squad panel');
          const code = a.baseline.get(8194).code;
          await pause(700); // Wait for the native panel controls to finish animating.
          await a.page.mouse.click(338, 290);
          await wait(() => a.baseline.get(8194)?.public, 'The new squad is public');
          await b.page.mouse.click(590, 290);
          await wait(() => b.baseline.get(8194)?.code === code &&
            a.baseline.get(8194)?.memberFlags[1] === 1,
          'Find Public joins the new squad without a refresh');
          await pause(650);
          for (const c of clients) await c.page.mouse.click(660, 220, { delay: 80 });
        } else {
          await clients[0].page.keyboard.press('Enter');
        }
        await pause(350);
        const ready = (await state()).rooms.find((r) => r.match && r.members.length === size);
        assert.ok(ready, 'All players enter the same new match');
        await fetch(host.url + 'wave/test/step/1', { method: 'POST' });
        await pause(250);
        for (const c of clients) {
          await c.page.waitForFunction(() => {
            const d = new DataView(Module.asm.Jf.buffer), u = (a) => d.getUint32(a, true);
            return u(u(u(u(4347728) + 2768)) + 2360) && !d.getUint8(4350150);
          });
          assert.ok((await healthy(c)).control);
        }
        for (const c of clients) {
          await c.page.mouse.move(512, 550);
          await wait(() => c.move?.epoch === round && Math.sin(c.move.angle) > 0.9 &&
            c.move.strength > 20, `${c.name}: fresh native mouse input reaches the server`);
          await c.page.mouse.down();
          await wait(() => c.move?.buttons & 1, `${c.name}: native attack input works`);
          await c.page.mouse.up();
        }
        const before = (await state()).rooms.find((r) => r.match === ready.match);
        await fetch(host.url + 'wave/test/step/2', { method: 'POST' });
        const after = (await state()).rooms.find((r) => r.match === ready.match);
        for (const body of before.entities.filter((e) => e.group === 0)) {
          assert.ok(after.entities.find((e) => e.group === 0 && e.owner === body.owner).y > body.y,
            'Visible players move after each reentry');
        }
        // Actual native Abandon clicks also prove the game screen accepts UI input.
        const leaving = clients[round % size];
        const staying = clients.find((c) => c !== leaving);
        const departedId = before.members[clients.indexOf(leaving)].id;
        const oldControl = leaving.current.control;
        await leaving.page.mouse.click(18, 18, { delay: 80 });
        await wait(() => leaving.current?.epoch === round + 1 && !leaving.current.control,
          `${leaving.name}: Abandon publishes a fresh lobby world`);
        assert.ok(!leaving.baseline.has(8196) && !leaving.baseline.has(8197) &&
          !leaving.baseline.has(8194), 'Departing viewer has no old arena, wave or squad');
        if (staying) {
          await fetch(host.url + 'wave/test/step/1', { method: 'POST' });
          const remaining = (await state()).rooms.find((r) => r.match === ready.match);
          assert.equal(remaining.members.length, 1);
          assert.ok(remaining.players.every((p) => p.id !== departedId));
          assert.ok(remaining.entities.every((e) => e.owner !== departedId),
            'Abandon removes all owned bodies, petals, projectiles and summons from the arena');
          await wait(() => !staying.baseline.has(oldControl), 'Teammate sees departed flower removed');
          assert.ok(staying.baseline.has(8196) && (await healthy(staying)).control,
            'The remaining teammate keeps its arena and control');
          assert.equal(staying.current.epoch, round);
          await staying.page.mouse.click(18, 18, { delay: 80 });
        }
        for (const c of clients) {
          await wait(() => c.current?.epoch === round + 1 && !c.current.control,
            `${c.name}: Abandon publishes a fresh lobby world`);
          assert.equal(c.sockets.length, 1);
          assert.equal(c.documentLoads.length, 1);
          await healthy(c);
        }
        assert.ok((await state()).rooms.every((r) => r.members.length === 0),
          'Abandon releases the old squad');
        rounds.push({ round: round + 1, match: ready.match, epoch: clients[0].current.epoch });
      }
      scenarios.push({ label, status: 'passed', rounds });
    } catch (error) {
      await writeFile(path.join(output, `reentry-failed-${label}.json`), JSON.stringify({
        error: error.stack, rounds, state: await state(),
        clients: await Promise.all(clients.map(async (c) => ({
          name: c.name, url: c.page.url(), current: c.current, errors: c.errors,
          baseline: [...c.baseline], commands: c.commands.slice(-30),
        }))),
      }, null, 2));
      for (const c of clients) await c.page.screenshot({
        path: path.join(output, `reentry-failed-${c.name}.png`),
      }).catch(() => {});
      throw error;
    } finally {
      await Promise.all(clients.map((c) => c.context.close()));
      await host.stop();
    }
  }
  report.cases.abandonReentry = { status: 'passed', scenarios };
}
