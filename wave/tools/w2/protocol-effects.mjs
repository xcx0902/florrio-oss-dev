import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { client, aim } from './online.mjs';
import { startHost } from './host.mjs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, message) {
  for (let i = 0; i < 500; ++i) {
    if (await predicate()) {
      return;
    }
    await pause(10);
  }
  assert.fail(message);
}

// Read the locked Wasm's final draw transforms, not just incoming wire positions.
// This observer never writes client memory, simulation state, or socket frames.
function rendered(observe = false) {
  if (observe) {
    // A frame trace catches 150 ms effects between server broadcasts.
    window.waveEffectFrames = [];
    window.waveObserveEffects = true;
    const initialPetals = rendered()
      .entities.filter((e) => e.kind === 'petal')
      .map((e) => e.id);
    window.wavePetalBirthFrame = null;
    const read = () => {
      if (!window.waveObserveEffects) {
        return;
      }
      const s = rendered();
      const growing = s.entities.find(
        (e) =>
          e.kind === 'petal' &&
          !e.flags &&
          !initialPetals.includes(e.id) &&
          e.orbitDistance > e.orbitTarget * 0.1 &&
          e.orbitDistance < e.orbitTarget * 0.7,
      );
      if (growing && !window.wavePetalBirthFrame) {
        window.wavePetalBirthFrame = {
          petal: growing,
          png: window.Module.canvas.toDataURL('image/png'),
        };
      }
      window.waveEffectFrames.push({
        now: s.now,
        reload: s.reload,
        widgets: s.widgets,
        petals: s.entities.filter((e) => e.kind === 'petal' && !e.flags),
        effects: s.entities.filter((e) => e.flash || e.flags),
      });
      requestAnimationFrame(read);
    };
    requestAnimationFrame(read);
    return;
  }
  const d = new DataView(window.Module.asm.Jf.buffer);
  const u = (a) => d.getUint32(a, true);
  const f = (a) => d.getFloat32(a, true);
  const F = (a) => d.getFloat64(a, true);
  const world = u(4347728),
    profile = u(u(world + 2768)),
    body = u(profile + 2360);
  const entities = [];
  // The fixed two-player scenario uses fewer than 80 projection slots.
  for (let slot = 16; slot < 128; ++slot) {
    const e = world + 22848 + slot * 376,
      t = u(e + 88),
      g = u(e + 120);
    if (!t || !g) {
      continue;
    }
    entities.push({
      id: u(e + 28),
      kind: u(e + 108) ? 'petal' : u(e + 124) ? 'mob' : 'flower',
      draw: [F(t + 176), F(t + 184)],
      target: [f(t + 40), f(t + 64)],
      previous: [f(t + 44), f(t + 68)],
      poseClock: F(t + 56),
      angle: F(t + 192),
      radius: f(u(e + 92) + 8),
      flags: d.getUint8(g + 8),
      flash: u(g + 76),
      fading: d.getUint8(g + 40),
    });
  }
  const flower = entities.find((e) => e.id === (body ? u(body + 28) : 0));
  if (flower) {
    for (const e of entities.filter((e) => e.kind === 'petal')) {
      e.orbitDistance = Math.hypot(...e.draw.map((v, i) => v - flower.draw[i]));
      e.orbitTarget = Math.hypot(...e.target.map((v, i) => v - flower.target[i]));
    }
  }
  const equipment = body ? u(body + 68) : 0;
  return {
    now: performance.now(),
    control: body ? u(body + 28) : 0,
    entities,
    camera: [f(profile + 2376), f(profile + 2264)],
    reload: equipment
      ? Array.from({ length: 5 }, (_, i) => d.getUint16(equipment + 108 + i * 2, true))
      : [],
    widgets: Array.from({ length: 5 }, (_, i) =>
      u(737568 + i * 4) ? f(u(737568 + i * 4) + 24) : 0,
    ),
    wave: {
      clearing: d.getUint8(world + 820),
      index: u(world + 824),
      biome: u(world + 828),
      counts: Array.from({ length: 216 }, (_, i) => u(world + 832 + i * 4)),
      spawning: d.getUint8(world + 2560),
    },
  };
}

function orbit(sample, handles) {
  const body = sample.entities.find((e) => e.id === sample.control);
  assert.ok(body, 'Controlled flower is actually drawn');
  const petals = sample.entities.filter((e) => handles.includes(e.id));
  assert.equal(petals.length, 5);
  const vectors = petals.map((e) => e.draw.map((value, i) => value - body.draw[i]));
  return { vectors, radius: vectors.reduce((sum, v) => sum + Math.hypot(...v), 0) / 5 };
}

export async function protocolEffectsCase({ browser, snapshot, nativeDir, output, report }) {
  console.log('W2-11: final draw camera/orbits, wave HUD, native hit/fade/recharge animation');
  const host = await startHost({ snapshot, nativeDir, port: 0, fixture: true });
  const clients = [],
    states = [],
    screenshots = [];
  report.cases['W2-11'] = { status: 'failed', kind: 'original-rendering' };
  const photograph = async (entry, name) => {
    const file = `W2-11-${name}.png`;
    await entry.page.screenshot({ path: path.join(output, file) });
    screenshots.push(file);
  };
  let frames = [];
  try {
    const a = await client(browser, host.url, 'effects-A');
    clients.push(a);
    await pause(600);
    await a.page.mouse.click(660, 408);
    await a.page.waitForFunction(() => location.hash.startsWith('#wavelocal-'));
    const b = await client(browser, host.url + new URL(a.page.url()).hash, 'effects-B');
    clients.push(b);
    await pause(700);
    await a.page.mouse.click(660, 256);
    await b.page.mouse.click(660, 256);
    await pause(200);
    const before = clients.map((e) => ({
      sockets: e.sockets.length,
      loads: e.documentLoads.length,
    }));
    let bid;
    const advance = async (n = 1, settle = 350) => {
      const response = await fetch(host.url + `wave/test/step/${n}`, { method: 'POST' });
      assert.ok(response.ok);
      const s = await response.json();
      states.push(s);
      bid ??= s.rooms[0].members[1].id;
      // Test stepping does not publish. Wait for the next real 100 ms broadcast
      // by matching its new petal pose, then allow the original interpolation.
      const petal = s.rooms[0].entities.find((e) => e.group === 1 && e.owner === bid);
      if (petal) {
        await until(
          () =>
            [...b.baseline.values()].some(
              (e) => e.petal && Math.hypot(e.x - petal.x * 5, e.y - petal.y * 5) < 0.001,
            ),
          'Original client receives the stepped pose',
        );
      }
      await pause(settle);
      for (const e of clients) {
        assert.deepEqual(e.errors, []);
      }
      return s;
    };
    let s = await advance();
    await pause(450);
    assert.ok(a.current.control && b.current.control);
    await aim(a);
    await aim(b);
    const sample = () => b.page.evaluate(rendered);
    const first = await sample();
    assert.equal(first.wave.spawning, 85, 'Blue advances with the first 2 of 6 spawns');
    assert.equal(first.wave.clearing, 0, 'Red stays empty while spawns are pending');
    await photograph(b, 'wave-spawning');
    const body = first.entities.find((e) => e.id === first.control);
    assert.equal(body.radius, 10, 'Fixture body radius is distinct from production radius 25');
    const handles = [...b.baseline.values()].filter((e) => e.petal === 1).map((e) => e.id);
    const idle = orbit(first, handles);
    assert.ok(Math.abs(idle.radius - 40) < 0.5);
    s = await advance(4);
    const spawned = await sample();
    assert.equal(spawned.wave.spawning, 255, 'Blue fills after the last spawn batch');
    assert.equal(spawned.wave.clearing, 0, 'Red starts at the end of spawning');
    const rotated = orbit(await sample(), handles);
    assert.ok(
      Math.hypot(...rotated.vectors[0].map((v, i) => v - idle.vectors[0][i])) > 8,
      'Original final draw coordinates orbit the flower',
    );

    const modes = [];
    for (const [button, mask, expected] of [
      ['left', 1, 72],
      ['right', 2, 24],
    ]) {
      await b.page.mouse.down({ button });
      await until(() => b.move.buttons === mask, `Original ${button} button reaches the wire`);
      s = await advance();
      const actual = orbit(await sample(), handles);
      assert.ok(
        Math.abs(actual.radius - expected) < 0.6,
        `${button} changes the final rendered orbit`,
      );
      modes.push({ button, expected, ...actual });
      await photograph(b, button === 'left' ? 'attack' : 'defend');
      await b.page.mouse.up({ button });
      await until(() => b.move.buttons === 0, 'Original button release reaches the wire');
    }
    s = await advance();
    assert.ok(Math.abs(orbit(await sample(), handles).radius - 40) < 0.6);
    // Only time after the final spawn advances the red clearing timer.
    s = await advance(4000);
    const hud = await sample();
    assert.equal(hud.wave.biome, 0);
    assert.equal(hud.wave.spawning, 255);
    assert.ok(hud.wave.clearing >= 50 && hud.wave.clearing <= 52);
    assert.equal(
      hud.wave.counts.reduce((a, b) => a + b, 0),
      6,
    );
    await photograph(b, 'wave-catalog');

    const target = s.rooms[0].entities.find((e) => e.group === 2);
    for (let i = 0; i < 60; ++i) {
      const flower = s.rooms[0].entities.find((e) => e.group === 0 && e.owner === bid);
      const delta = [target.x - flower.x, target.y - flower.y],
        distance = Math.hypot(...delta);
      if (distance < 15) {
        break;
      }
      await aim(
        b,
        delta.map((v) => v / distance),
        Math.min(100, (distance - 14) * 50),
      );
      s = await advance(Math.max(1, Math.min(4, Math.floor((distance - 14) / 2))));
    }
    const center = await aim(b);
    assert.ok(
      Math.hypot(center[0] - 512, center[1] - 384) < 3,
      'Real mouse bearings locate the flower at screen center away from the origin',
    );
    const moved = await sample();
    const movedBody = moved.entities.find((e) => e.id === moved.control);
    assert.ok(Math.hypot(...movedBody.draw) > 100);
    assert.ok(Math.hypot(...moved.camera.map((v, i) => v - movedBody.draw[i])) < 0.5);
    assert.equal(movedBody.angle, 0);
    await photograph(b, 'camera');

    await b.page.evaluate(rendered, true);
    await b.page.mouse.down({ button: 'left' });
    await until(() => b.move.buttons === 1, 'Original attack input');
    let broken = false,
      killed = false;
    for (let i = 0; i < 80; ++i) {
      s = await advance(1, 20);
      const draw = await sample();
      if (!broken && draw.reload.some((v) => v === 0)) {
        broken = true;
        await photograph(b, 'petal-fade');
      }
      if (draw.reload.some((v) => v === 32767) && !screenshots.includes('W2-11-recharge.png')) {
        await photograph(b, 'recharge');
      }
      if (s.rooms[0].defeated) {
        killed = true;
        await photograph(b, 'mob-fade');
        // Stop further collisions while the petal completes its real reload.
        await b.page.mouse.up({ button: 'left' });
        await b.page.mouse.down({ button: 'right' });
        await until(() => b.move.buttons === 2, 'Original defend input');
        await advance(3);
        break;
      }
    }
    assert.ok(broken && killed, 'Real W1 petal damage and mob death occurred');
    await pause(550);
    frames = await b.page.evaluate(() => {
      window.waveObserveEffects = false;
      return window.waveEffectFrames;
    });
    for (const kind of ['petal', 'mob']) {
      const flash = frames.flatMap((f) => f.effects).find((e) => e.kind === kind && e.flash);
      assert.ok(flash, `${kind}: native hit vector is consumed by the renderer`);
      const fade = frames
        .flatMap((f) => f.effects)
        .find((e) => e.kind === kind && e.flags === 1 && e.fading);
      assert.ok(fade, `${kind}: native death clock actually starts drawing the fade`);
      assert.ok(!b.baseline.has(fade.id), `${kind}: only removed after native fade completes`);
    }
    const slot = frames.find((f) => f.reload.includes(0)).reload.indexOf(0);
    assert.ok(frames.some((f) => f.reload[slot] === 32767));
    assert.ok(
      frames.some((f) => f.widgets[slot] > 0.1 && f.widgets[slot] < 0.9),
      'Original recharge widget interpolates between broken and ready',
    );
    assert.ok(frames.at(-1).widgets[slot] > 0.99);
    const reborn = frames
      .flatMap((f) => f.petals)
      .find(
        (e) =>
          !handles.includes(e.id) &&
          e.orbitDistance > e.orbitTarget * 0.1 &&
          e.orbitDistance < e.orbitTarget * 0.7,
      );
    assert.ok(reborn, 'Recharged petal is actually drawn between the flower and its orbit');
    const growth = frames.flatMap((f) => f.petals).filter((e) => e.id === reborn.id);
    const arrived = growth.at(-1);
    assert.ok(
      Math.abs(arrived.orbitDistance - arrived.orbitTarget) < 0.5,
      'Reappearing petal reaches the authoritative orbit',
    );
    assert.ok(growth.some((e) => e.orbitDistance > reborn.orbitDistance + 2));
    const birthFrame = await b.page.evaluate(() => window.wavePetalBirthFrame);
    assert.ok(birthFrame, 'Capture the original canvas during the petal appearance animation');
    const birthFile = 'W2-11-petal-appear.png';
    await writeFile(
      path.join(output, birthFile),
      Buffer.from(birthFrame.png.split(',')[1], 'base64'),
    );
    screenshots.push(birthFile);
    const final = await sample();
    assert.equal(final.wave.spawning, 255, 'Kills do not restart or advance the blue bar');
    assert.equal(
      final.wave.counts.reduce((a, b) => a + b, 0),
      5,
      'Fading mob is absent from live catalog',
    );
    const hits = clients.map((e) => e.snapshots.flatMap((s) => s.hits));
    assert.ok(hits[0].length >= 3, 'Both mob hits and the broken petal are broadcast');
    assert.equal(
      hits[0].length,
      hits[1].length,
      'Each socket independently consumes the hit journal',
    );
    for (let i = 0; i < clients.length; ++i) {
      assert.deepEqual(clients[i].errors, []);
      assert.equal(clients[i].sockets.length, before[i].sockets);
      assert.equal(clients[i].documentLoads.length, before[i].loads);
    }
    await photograph(b, 'complete');
    Object.assign(report.cases['W2-11'], {
      status: 'passed',
      idle,
      rotated,
      modes,
      center,
      camera: moved.camera,
      flower: movedBody,
      waveBefore: hud.wave,
      waveSpawning: first.wave,
      waveAfter: final.wave,
      reappearingPetal: { first: reborn, captured: birthFrame.petal, arrived },
      frames: frames.length,
      screenshots,
    });
  } finally {
    await writeFile(
      path.join(output, 'protocol-effects.json'),
      JSON.stringify(
        {
          frames,
          states,
          clients: clients.map((e) => ({ name: e.name, errors: e.errors, frames: e.frames })),
        },
        null,
        2,
      ) + '\n',
    );
    for (const entry of clients) {
      await entry.context.close();
    }
    await host.stop();
  }
}
