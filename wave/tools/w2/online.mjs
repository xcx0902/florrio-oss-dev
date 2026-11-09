import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CaptureCodec, readVu } from './codec.mjs';
import { startHost } from './host.mjs';

function reader(bytes, offset = 0) {
  const cursor = { offset };
  const vu = () => readVu(bytes, cursor);
  const byte = () => bytes[cursor.offset++];
  const skip = (n) => {
    cursor.offset += n;
    assert.ok(cursor.offset <= bytes.length);
  };
  const word = () => {
    const n = bytes.readUInt32LE(cursor.offset);
    skip(4);
    return n;
  };
  const real = () => {
    const n = bytes.readFloatLE(cursor.offset);
    skip(4);
    return n;
  };
  const str = () => {
    const end = bytes.indexOf(0, cursor.offset);
    assert.ok(end >= cursor.offset, 'NUL string boundary');
    const s = bytes.toString('utf8', cursor.offset, end);
    cursor.offset = end + 1;
    return s;
  };
  return { cursor, vu, byte, skip, word, real, str };
}

function requests(plain) {
  if (plain[0] !== 1) {
    return [];
  }
  const r = reader(plain, 2),
    result = [];
  while (r.cursor.offset < plain.length) {
    const sequence = r.vu(),
      opcode = r.vu(),
      entry = { sequence, opcode };
    if (opcode === 13) {
      r.byte();
      entry.identity = [r.str(), r.str(), r.str()];
    } else if (opcode === 6) {
      r.skip(r.vu());
    } else if (opcode === 30) {
      entry.name = r.str();
    } else if (opcode === 27 || opcode === 7) {
      entry.value = r.byte();
    } else if (opcode === 4) {
      entry.value = r.byte();
      entry.code = r.str();
    } else if (opcode === 9) {
      entry.buttons = r.vu();
      entry.angle = r.real();
      entry.strength = r.real();
    } else {
      assert.ok([11, 21, 25, 34, 38].includes(opcode), `Unrecognized original command ${opcode}`);
    }
    result.push(entry);
  }
  return result;
}

function world(plain, baseline) {
  if (plain[0] !== 1) {
    return;
  }
  const r = reader(plain, 2),
    tick = r.vu(),
    ack = r.vu(),
    skipLength = r.vu();
  const removalStart = r.cursor.offset;
  const count = r.vu();
  r.byte();
  const removed = Array.from({ length: count }, () => r.word());
  r.byte();
  // The initial golden empty frame predates the length-delimited writer.
  if (skipLength) {
    assert.equal(r.cursor.offset - removalStart, skipLength + 1);
  }
  for (const id of removed) {
    baseline.delete(id);
  }
  let control = 0,
    wave;
  for (;;) {
    const id = r.word();
    if (!id) {
      break;
    }
    const header = r.byte();
    assert.ok([0xcc, 0xc4].includes(header));
    const mask = r.byte() | (r.byte() << 8) | (r.byte() << 16),
      entity = { id, mask };
    if (mask & 1) {
      r.byte();
    }
    if (mask & 0x20) {
      entity.flowerState = [r.byte(), r.byte(), r.byte(), r.byte()];
      if ((header ^ 0xac) & 8) {
        entity.equipment = Array.from({ length: 16 }, () => {
          const type = r.vu();
          return { type, rarity: type ? r.byte() : 0 };
        });
        entity.slotValues = Array.from({ length: 8 }, () => r.vu());
      }
    }
    if (mask & 8) {
      entity.flowers = r.vu();
      r.skip(61);
    }
    if (mask & 16) {
      entity.width = r.vu();
      entity.height = r.vu();
      r.real();
      r.byte();
    }
    if (mask & 0x100) {
      entity.name = r.str();
    }
    if (mask & 0x200) {
      entity.names = Array.from({ length: 4 }, () => r.str());
      r.skip(21);
      entity.code = r.str();
      r.skip(88);
    }
    if (mask & 0x400) {
      entity.angle = r.byte() | (r.byte() << 8);
      entity.x = r.real();
      entity.y = r.real();
    }
    if (mask & 0x800) {
      entity.deadlineProgress = r.byte();
      entity.wave = r.vu() + 1;
      wave = entity.wave;
      entity.biome = r.vu();
      entity.mobCounts = Array.from({ length: 216 }, () => r.vu());
      entity.spawnProgress = r.byte();
    }
    if (mask & 0x1000) {
      entity.radius = r.real();
    }
    if (mask & 0x2000) {
      entity.arenaRadius = r.real();
      entity.background = [r.byte(), r.byte(), r.byte()];
    }
    if (mask & 0x4000) {
      entity.seed = r.byte();
    }
    if (mask & 0x8000) {
      entity.control = plain.readUInt32LE(r.cursor.offset + 323);
      control = entity.control;
      r.skip(607);
    }
    if (mask & 0x10000) {
      entity.petal = r.vu();
      if (entity.petal) {
        entity.rarity = r.byte();
      }
    }
    if (mask & 0x80000) {
      entity.renderFlags = r.byte();
    }
    if (mask & 0x100000) {
      entity.mob = r.byte();
      entity.mobVariant = r.byte();
      entity.rarity = r.byte();
    }
    if (mask & 0x200000) {
      r.byte();
      r.byte();
      entity.health = r.byte();
    }
    if (mask & 0x400000) {
      entity.dropFlags = r.byte();
      entity.dropTarget = r.vu();
      entity.drop = { kind: r.vu(), rarity: r.byte() };
    }
    baseline.set(id, entity);
  }
  const hits = [];
  const arcs = [];
  assert.equal(r.byte(), 0, '$601 delimiter after the u32 entity terminator');
  // The captured initial empty world ends at the delimiter (implicit empty list).
  for (let envelope = r.cursor.offset < plain.length ? r.vu() : 0; envelope; envelope = r.vu()) {
    assert.equal(envelope, 1);
    const opcode = r.vu();
    if (opcode === 33) {
      arcs.push([r.real(), r.real(), r.real(), r.real()]);
    } else {
      assert.equal(opcode, 32, 'Recovered native hit event');
      hits.push({ id: r.word(), strength: r.byte() });
    }
  }
  assert.equal(r.cursor.offset, plain.length);
  return { tick, ack, control, wave, removed, hits, arcs };
}

export async function client(browser, url, name, storageState) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    locale: 'en-US',
    storageState,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const started = performance.now();
  const result = {
    context,
    page,
    name,
    frames: [],
    commands: [],
    snapshots: [],
    errors: [],
    navigations: [],
    documentLoads: [],
    requests: [],
    baseline: new Map(),
  };
  await page.addInitScript(() => {
    window.waveLabels = new Set();
    window.waveLabelTimes = {};
    for (const prototype of [
      CanvasRenderingContext2D.prototype,
      globalThis.OffscreenCanvasRenderingContext2D?.prototype,
    ].filter(Boolean)) {
      for (const method of ['fillText', 'strokeText']) {
        const draw = prototype[method];
        prototype[method] = function (text, ...args) {
          window.waveLabels.add(String(text));
          window.waveLabelTimes[String(text)] = performance.now();
          return draw.call(this, text, ...args);
        };
      }
    }
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      result.navigations.push(frame.url());
    }
  });
  page.on('pageerror', (error) => result.errors.push(error.message));
  page.on('domcontentloaded', () => result.documentLoads.push(page.url()));
  page.on('request', (request) => result.requests.push(request.url()));
  page.on('websocket', (socket) => {
    const receive = new CaptureCodec(),
      send = new CaptureCodec(true);
    result.sockets ??= [];
    result.sockets.push(socket.url());
    result.baseline.clear();
    for (const [event, direction] of [
      ['framesent', 'client-to-server'],
      ['framereceived', 'server-to-client'],
    ]) {
      socket.on(event, ({ payload }) => {
        const bytes = Buffer.from(payload);
        result.frames.push({
          kind: 'captured',
          sequence: result.frames.length + 1,
          relativeMs: Math.round(performance.now() - started),
          direction,
          length: bytes.length,
          hex: bytes.toString('hex'),
        });
        try {
          if (event === 'framesent') {
            if (bytes[0] !== 48) {
              for (const command of requests(send.decode(bytes))) {
                result.commands.push(command);
                if (command.opcode === 9) {
                  result.move = command;
                }
              }
            }
          } else {
            const snapshot = world(receive.decode(bytes), result.baseline);
            if (snapshot) {
              result.current = snapshot;
              result.snapshots.push(snapshot);
            }
          }
        } catch (error) {
          result.errors.push(`Capture decoder: ${error.message}`);
        }
      });
    }
  });
  await page.goto(url);
  await page.waitForFunction(
    () =>
      localStorage.getItem('cp6_player_id') &&
      (window.waveLabels.has('Ready') || window.waveLabels.has('Wave 3')),
    null,
    { timeout: 8000 },
  );
  result.guest = await page.evaluate(() => localStorage.getItem('cp6_player_id'));
  return result;
}

export async function aim(entry, direction, strength = 200) {
  // Recover the rendered body center from two real mouse bearings. This reads
  // original outbound commands and never writes Wasm memory or socket data.
  const bearings = [];
  for (const point of [
    [850, 384],
    [512, 680],
  ]) {
    await entry.page.mouse.move(...point);
    await new Promise((resolve) => setTimeout(resolve, 65));
    assert.ok(entry.move && Number.isFinite(entry.move.angle));
    bearings.push({ point, angle: entry.move.angle });
  }
  const [a, b] = bearings;
  const u = [Math.cos(a.angle), Math.sin(a.angle)],
    v = [Math.cos(b.angle), Math.sin(b.angle)];
  const delta = [b.point[0] - a.point[0], b.point[1] - a.point[1]];
  const cross = u[0] * v[1] - u[1] * v[0];
  assert.ok(Math.abs(cross) > 0.2, 'Original mouse bearings intersect');
  const distance = (delta[0] * v[1] - delta[1] * v[0]) / cross;
  const center = [a.point[0] + distance * u[0], a.point[1] + distance * u[1]];
  assert.ok(center.every(Number.isFinite));
  await entry.page.mouse.move(
    center[0] + (direction ? strength * direction[0] : 0),
    center[1] + (direction ? strength * direction[1] : 0),
  );
  await new Promise((resolve) => setTimeout(resolve, 65));
  if (!direction) {
    assert.ok(entry.move.strength < 2, `Original stop strength ${entry.move.strength}`);
  }
  return center;
}

export async function onlineCases({ browser, snapshot, nativeDir, output, report }) {
  const host = await startHost({ snapshot, nativeDir, port: 0, fixture: true });
  const clients = [];
  const states = [];
  const state = async () => (await fetch(host.url + 'wave/test/state')).json();
  const advance = async (ticks = 1) => {
    const response = await fetch(host.url + `wave/test/step/${ticks}`, { method: 'POST' });
    assert.ok(response.ok);
    const value = await response.json();
    states.push(value);
    return value;
  };
  const settle = async () => new Promise((resolve) => setTimeout(resolve, 350));
  const photograph = async (entry, name) => {
    await entry.page.screenshot({ path: path.join(output, name) });
    return name;
  };
  const roomOf = (s) => s.rooms.find((room) => room.match);
  const bodyOf = (s, id) => roomOf(s).entities.find((e) => e.group === 0 && e.owner === id);
  async function travel(entry, id, target, stop = 0.5) {
    for (let attempt = 0; attempt < 80; ++attempt) {
      const s = await state(),
        body = bodyOf(s, id);
      if (!body) {
        return s;
      }
      const dx = target.x - body.x,
        dy = target.y - body.y,
        distance = Math.hypot(dx, dy);
      if (distance <= stop) {
        await aim(entry);
        return s;
      }
      // Use the original analog mouse distance to brake within one W1 step.
      await aim(entry, [dx / distance, dy / distance], Math.min(200, 50 * distance));
      await advance(Math.max(1, Math.min(6, Math.floor((distance - stop) / 2))));
      await settle();
    }
    throw new Error(`Original controls did not reach ${JSON.stringify(target)}`);
  }
  try {
    console.log('W2-02: original invitation, shared room, Ready');
    const a = await client(browser, host.url, 'A');
    clients.push(a);
    await settle();
    await a.page.mouse.click(412, 373);
    await a.page.keyboard.type('Wave A');
    await a.page.mouse.click(632, 402);
    await a.page.waitForFunction(() => location.hash.startsWith('#wavelocal-'));
    const invite = new URL(a.page.url()).hash;
    const b = await client(browser, host.url + invite, 'B');
    clients.push(b);
    assert.notEqual(a.guest, b.guest);
    await b.page.waitForFunction(() => window.waveLabels.has('Wave A'));
    // Joining animates the original menu upward before the nickname field
    // reaches its squad position. Wait for that transition before clicking.
    await new Promise((resolve) => setTimeout(resolve, 700));
    await b.page.mouse.click(450, 256);
    await b.page.keyboard.type('Wave B');
    await a.page.waitForFunction(() => window.waveLabels.has('Wave B'));
    report.cases['W2-02'] = {
      status: 'failed',
      kind: 'real-websocket',
      invite,
      lobby: await photograph(a, 'W2-02-lobby.png'),
    };
    await a.page.mouse.click(660, 256);
    await b.page.mouse.click(660, 256);
    await settle();
    let s = await state();
    assert.equal(s.rooms.length, 1);
    assert.equal(s.rooms[0].members.length, 2);
    assert.ok(s.rooms[0].match);
    const [aid, bid] = s.rooms[0].members.map((m) => m.id);
    s = await advance();
    await settle();
    assert.equal(roomOf(s).tick, 1, 'Exactly one authoritative update per room');
    assert.equal(roomOf(s).spawned, 2);
    assert.equal(roomOf(s).pending, 4);
    await Promise.all(
      clients.map((c) => c.page.waitForFunction(() => window.waveLabels.has('Wave 1'))),
    );
    assert.ok(a.current.control && b.current.control);
    assert.notEqual(a.current.control, b.current.control);
    assert.ok([...a.baseline.values()].some((e) => e.mob));
    assert.ok([...a.baseline.values()].some((e) => e.petal));
    await aim(a, [1, 0]);
    s = await advance(2);
    await settle();
    assert.ok(s.acceptedInputs > 0);
    assert.ok(bodyOf(s, aid).x > -12, 'Real original input moves A in W1');
    assert.equal(roomOf(s).tick, 3);
    Object.assign(report.cases['W2-02'], {
      status: 'passed',
      match: roomOf(s).match,
      a: { player: aid, control: a.current.control },
      b: { player: bid, control: b.current.control },
      screenshot: await photograph(a, 'W2-02-playing.png'),
    });

    console.log('W2-03/04: batched spawning, contact death, survivor clear, respawn');
    await aim(a);
    await aim(b);
    s = await advance();
    await settle();
    assert.equal(roomOf(s).spawned, 6);
    assert.equal(roomOf(s).pending, 0);
    report.cases['W2-03'] = { status: 'failed', firstBatch: 2, secondBatch: 4 };
    report.cases['W2-04'] = { status: 'failed' };
    const oldLife = roomOf(s).players.find((p) => p.id === aid).life;
    const oldControl = a.current.control;
    const target = roomOf(s)
      .entities.filter((e) => e.group === 2)
      .sort(
        (x, y) =>
          Math.hypot(x.x - bodyOf(s, aid).x, x.y - bodyOf(s, aid).y) -
          Math.hypot(y.x - bodyOf(s, aid).x, y.y - bodyOf(s, aid).y),
      )[0];
    s = await travel(a, aid, target);
    assert.equal(
      roomOf(s).players.find((p) => p.id === aid).state,
      0,
      'A waits after real W1 contact damage',
    );
    await settle();
    assert.equal(a.current.control, 0);
    report.cases['W2-04'].death = await photograph(a, 'W2-04-death.png');
    const beforeDenied = s.rejectedInputs;
    await a.page.mouse.move(900, 384);
    await settle();
    // The original stops emitting input when dead. Native session tests cover
    // delayed old-life commands at the ACK/connection boundary as well.
    for (let kill = 0; kill < 6; ++kill) {
      s = await state();
      if (roomOf(s).wave !== 1) {
        break;
      }
      const body = bodyOf(s, bid);
      const mob = roomOf(s)
        .entities.filter((e) => e.group === 2)
        .sort(
          (x, y) => Math.hypot(x.x - body.x, x.y - body.y) - Math.hypot(y.x - body.x, y.y - body.y),
        )[0];
      const length = Math.hypot(body.x - mob.x, body.y - mob.y);
      await travel(
        b,
        bid,
        { x: mob.x + ((body.x - mob.x) * 8) / length, y: mob.y + ((body.y - mob.y) * 8) / length },
        0.6,
      );
      await aim(b);
      for (let n = 0; n < 40; ++n) {
        s = await advance();
        if (
          roomOf(s).wave !== 1 ||
          !roomOf(s).entities.some((e) => e.slot === mob.slot && e.generation === mob.generation)
        ) {
          break;
        }
      }
      await settle();
      assert.ok(bodyOf(s, bid), 'B survives the petal clear');
    }
    s = await advance();
    await settle();
    assert.equal(roomOf(s).wave, 2);
    assert.equal(s.transitions.filter((t) => t.from === 1 && t.to === 2).length, 1);
    assert.equal(roomOf(s).tick, s.steps, 'Two sockets do not multiply room steps');
    await Promise.all(
      clients.map((c) => c.page.waitForFunction(() => window.waveLabels.has('Wave 2'))),
    );
    const respawn = roomOf(s).players.find((p) => p.id === aid);
    assert.equal(respawn.state, 1);
    assert.ok(respawn.life > oldLife);
    assert.ok(a.current.control && a.current.control !== oldControl);
    assert.ok(
      !a.baseline.has(oldControl),
      'Old controlled entity removed from original-client baseline',
    );
    Object.assign(report.cases['W2-03'], {
      status: 'passed',
      transitions: s.transitions,
      screenshot: await photograph(b, 'W2-03-wave-2.png'),
    });
    Object.assign(report.cases['W2-04'], {
      status: 'passed',
      oldLife,
      newLife: respawn.life,
      oldControl,
      newControl: a.current.control,
      beforeDenied,
      screenshot: await photograph(a, 'W2-04-respawn.png'),
    });
    await aim(a);

    console.log('W2-05: disconnect B, cross a wave, reconnect original identity');
    const storage = await b.context.storageState();
    await b.context.close();
    await settle();
    s = await advance();
    assert.equal(roomOf(s).players.find((p) => p.id === bid).connected, 0);
    // With A carrying Rose petals, this checkpoint uses W1's configured deadline
    // to cross the next wave while B is offline. No entity/health injection.
    const remaining = roomOf(s).deadlineTick + 2 - roomOf(s).tick;
    for (let ticks = remaining; ticks > 0;) {
      const n = Math.min(4096, ticks);
      s = await advance(n);
      ticks -= n;
    }
    assert.equal(roomOf(s).wave, 3);
    await a.page.waitForFunction(() => window.waveLabels.has('Wave 3'));
    const restored = await client(browser, host.url + invite, 'B-reconnected', storage);
    clients.push(restored);
    assert.equal(restored.guest, b.guest);
    s = await advance();
    await settle();
    assert.equal(roomOf(s).players.find((p) => p.id === bid).connected, 1);
    assert.equal(roomOf(s).players.find((p) => p.id === bid).id, bid);
    await restored.page.waitForFunction(() => window.waveLabels.has('Wave 3'));
    assert.ok(restored.current.control);
    assert.ok(restored.baseline.has(restored.current.control));
    assert.equal(restored.baseline.get(restored.current.control).name, 'Wave B');
    assert.equal(
      [...restored.baseline.values()].filter((e) => e.mob).length,
      roomOf(s).entities.filter((e) => e.group === 2).length,
    );
    report.cases['W2-05'] = {
      status: 'passed',
      player: bid,
      wave: 3,
      control: restored.current.control,
      screenshot: await photograph(restored, 'W2-05-reconnected.png'),
    };
    for (const c of clients) {
      assert.deepEqual(c.errors, [], `${c.name} original-client errors`);
    }
  } finally {
    for (const c of clients) {
      if (!c.page.isClosed()) {
        c.labels = await c.page.evaluate(() => [...window.waveLabels]).catch(() => []);
        await photograph(c, `W2-final-${c.name}.png`).catch(() => {});
      }
    }
    const captures = clients.map(
      ({ name, guest, frames, commands, snapshots, errors, labels }) => ({
        name,
        guest,
        frames,
        commands,
        snapshots,
        errors,
        labels,
      }),
    );
    await writeFile(
      path.join(output, 'online.json'),
      JSON.stringify(
        {
          fixture: 'w2-wire-fixture.1',
          seed: 20221030,
          clock: 'manual W1 steps; real socket and original RAF',
          loadouts: ['5 Common Rose', '5 Common Basic'],
          states,
          clients: captures,
        },
        null,
        2,
      ) + '\n',
    );
    await Promise.all(clients.map((c) => c.context.close().catch(() => {})));
    await host.stop();
  }
}
