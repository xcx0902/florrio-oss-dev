import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { defaultNative, root, startHost } from '../w2/host.mjs';
import { CaptureCodec, readVu } from '../w2/codec.mjs';
import { squadCase, realtimeReadyCase, abandonReentryCase } from './squad.mjs';
const hash = (b) => createHash('sha256').update(b).digest('hex');
export async function runW3(values) {
  const output = path.resolve(values['output-dir']);
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(tmpdir(), 'wave-w3-wire-'));
  const native = values['native-dir'] ?? defaultNative;
  const report = {
    schemaVersion: 1,
    stage: 'W3',
    status: 'failed',
    startedAt: new Date().toISOString(),
    node: process.version,
    cases: {},
    fixtures: [],
  };
  let browser, host;
  const seed = (database, token) =>
    JSON.parse(
      execFileSync(path.join(native, 'wave_w3_seed'), [database, ...(token ? [token] : [])], {
        encoding: 'utf8',
      }),
    );
  async function client(token, label) {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      locale: 'en-US',
    });
    await context.addInitScript((token) => {
      if (token) {
        localStorage.setItem('cp6_player_id', token);
      }
      window.waveLabels = new Set();
      window.waveDraws = [];
      const draw = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, ...args) {
        const m = this.getTransform(),
          r = this.canvas.getBoundingClientRect();
        window.waveLabels.add(String(t));
        window.waveDraws.push({
          t: String(t),
          x: r.x + ((m.a * args[0] + m.c * args[1] + m.e) * r.width) / this.canvas.width,
          y: r.y + ((m.b * args[0] + m.d * args[1] + m.f) * r.height) / this.canvas.height,
        });
        if (window.waveDraws.length > 10000) {
          window.waveDraws.splice(0, 5000);
        }
        return draw.call(this, t, ...args);
      };
    }, token);
    const page = await context.newPage(),
      frames = [],
      requests = [],
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('websocket', (socket) => {
      const codecs = { sent: new CaptureCodec(true), received: new CaptureCodec() };
      for (const [event, direction] of [
        ['framesent', 'sent'],
        ['framereceived', 'received'],
      ]) {
        socket.on(event, ({ payload }) => {
          const bytes = Buffer.from(payload);
          const plain = codecs[direction].decode(bytes);
          frames.push({ direction, hex: bytes.toString('hex'), plain: plain.toString('hex') });
          if (direction === 'sent' && plain[0] === 1) {
            const c = { offset: 1 };
            const epoch = readVu(plain, c),
              sequence = readVu(plain, c),
              opcode = readVu(plain, c);
            requests.push({ epoch, sequence, opcode, data: [...plain.subarray(c.offset)] });
          }
        });
      }
    });
    await page.goto(host.url);
    await page.waitForFunction(() => window.waveLabels.has('Ready'), null, { timeout: 10000 });
    await page.waitForTimeout(600);
    report.fixtures.push({ label, frames, requests, errors });
    return { page, context, frames, requests, errors };
  }
  async function profile(page) {
    return page.evaluate(() => {
      const d = new DataView(window.Module.asm.Jf.buffer),
        u = (a) => d.getUint32(a, true),
        w = u(4347728),
        p = u(u(w + 2768));
      return {
        level: d.getUint8(p + 8),
        flags: d.getUint8(p + 9),
        visionScale: d.getFloat32(p + 2316, true),
        progress: d.getUint16(p + 4608, true),
        inventory: Array.from({ length: 276 }, (_, i) => u(p + 2400 + i * 4)),
        gallery: Array.from(new Uint8Array(d.buffer, p + 2288, 27)),
        equipped: Array.from(new Uint8Array(d.buffer, 864186, 32)),
        cooldown:
          u(p + 2360) && u(u(p + 2360) + 68)
            ? Array.from({ length: 8 }, (_, i) =>
                d.getUint16(u(u(p + 2360) + 68) + 108 + 2 * i, true),
              )
            : [],
        token: localStorage.getItem('cp6_player_id'),
      };
    });
  }
  async function screenshot(c, name) {
    await c.page.screenshot({ path: path.join(output, name + '.png') });
  }
  async function clickText(c, text) {
    const point = await c.page.evaluate(
      (text) =>
        [...window.waveDraws]
          .reverse()
          .find((d) => d.t === text && d.x > 0 && d.x < innerWidth && d.y > 0 && d.y < innerHeight),
      text,
    );
    assert.ok(point, `Original text visible: ${text}`);
    await c.page.mouse.click(point.x, point.y - 3);
  }
  async function craftMenu(c) {
    await c.page.mouse.click(35, c.page.viewportSize().height - 88);
    await c.page.waitForTimeout(600);
    await screenshot(c, 'craft-menu');
  }
  // Selection uses actual original canvas hit targets, never writes Wasm memory.
  async function clickPetal(c, kind, rarity, select = true) {
    const names = { 12: 'Faster', 6: 'Stinger', 5: 'Rose', 44: 'Peas', 20: 'Web' };
    // Locate original canvas labels, then confirm the tooltip's dated identity/rarity.
    const rarityNames = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic'];
    await c.page.mouse.move(1000, 10);
    await c.page.evaluate(() => {
      window.waveDraws = [];
      window.waveLabels.clear();
    });
    await c.page.waitForTimeout(120);
    const cells = await c.page.evaluate((name) => {
      const craft = [...window.waveDraws].reverse().find((d) => d.t === 'Craft');
      const inventory = [...window.waveDraws].reverse().find((d) => d.t === 'Inventory');
      const minY = craft ? craft.y + 130 : (inventory?.y ?? 0) + 60;
      return [
        ...new Map(
          window.waveDraws
            .filter((d) => d.t === name && d.x > 85 && d.x < 420 && d.y > minY)
            .map((d) => [`${Math.round(d.x)},${Math.round(d.y)}`, { x: d.x, y: d.y - 17 }]),
        ).values(),
      ];
    }, names[kind]);
    for (const { x, y } of cells) {
      await c.page.evaluate(() => window.waveLabels.clear());
      await c.page.mouse.move(x, y);
      await c.page.waitForTimeout(90);
      const labels = await c.page.evaluate(() => [...window.waveLabels]);
      if (
        labels.includes(names[kind]) &&
        labels.includes(rarityNames[rarity]) &&
        (kind !== 5 ||
          labels.includes('Its healing properties are amazing. Not so good at combat though'))
      ) {
        if (select) {
          await c.page.mouse.click(x, y);
          await c.page.waitForTimeout(200);
        }
        return { x, y, labels };
      }
    }
    throw new Error(`Original crafting item not found ${kind}/${rarity}`);
  }
  function galleryBits(discoveries) {
    const bytes = Array(27).fill(0);
    for (const [kind, rarity] of discoveries) {
      const bit = kind * 6 + rarity;
      bytes[bit >> 3] |= 1 << (bit & 7);
    }
    return bytes;
  }
  async function equipmentCase(c, database, token) {
    await c.page.mouse.click(35, 680); // Close crafting.
    await c.page.mouse.click(35, 733);
    await c.page.waitForTimeout(500);
    const saved = seed(database, token),
      gallery = await profile(c.page);
    assert.deepEqual(gallery.gallery, galleryBits(saved.discoveries));
    report.cases.gallery = {
      status: 'passed',
      discoveries: saved.discoveries,
      bytes: gallery.gallery,
      labels: await c.page.evaluate(() => [...window.waveLabels]),
    };
    await screenshot(c, 'gallery');
    await c.page.mouse.click(35, 733);
    await c.page.mouse.click(35, 626);
    await c.page.waitForTimeout(500);
    const before = await profile(c.page),
      tooltips = [];
    for (const [kind, rarity, x] of [
      [6, 2, 512],
      [44, 1, 576],
      [5, 1, null],
    ]) {
      if (x) {
        await c.page.mouse.click(x, 475);
        await c.page.waitForTimeout(300);
      }
      const cell = await clickPetal(c, kind, rarity);
      tooltips.push({ kind, rarity, labels: cell.labels });
      await c.page.waitForTimeout(500);
    }
    await screenshot(c, 'equipment-menu');
    let equipped = seed(database, token);
    assert.deepEqual(equipped.slots[2], [6, 2]);
    assert.deepEqual(equipped.slots[3], [44, 1]);
    assert.deepEqual(equipped.slots[9], [5, 1]);
    assert.deepEqual((await profile(c.page)).inventory, before.inventory);
    await screenshot(c, 'equipment-menu');
    await c.page.mouse.click(35, 626);
    await c.page.waitForTimeout(300);
    const advance = async (n) => {
      const response = await fetch(host.url + `wave/test/step/${n}`, { method: 'POST' });
      assert.ok(response.ok);
      await c.page.waitForTimeout(300);
      return response.json();
    };
    await clickText(c, 'Ready');
    await c.page.waitForTimeout(150);
    await advance(1);
    await c.page.waitForFunction(
      () => {
        const d = new DataView(window.Module.asm.Jf.buffer),
          u = (a) => d.getUint32(a, true);
        return u(u(u(u(4347728) + 2768)) + 2360) !== 0;
      },
      null,
      { timeout: 6000 },
    );
    const ready = await profile(c.page);
    assert.equal(ready.cooldown[3], 65535);
    await c.page.mouse.move(512, 384);
    await c.page.mouse.down();
    await c.page.waitForTimeout(120);
    const launchedState = await advance(25),
      reloading = await profile(c.page);
    await c.page.mouse.up();
    await c.page.waitForTimeout(120);
    assert.ok(reloading.cooldown[3] >= 0 && reloading.cooldown[3] < 65535);
    await screenshot(c, 'cooldown');
    await advance(45);
    const recharged = await profile(c.page);
    assert.equal(recharged.cooldown[3], 65535);
    const swapStart = c.requests.length;
    await c.page.keyboard.down('Digit2');
    await c.page.waitForTimeout(150);
    await c.page.keyboard.up('Digit2');
    await c.page.waitForTimeout(500);
    assert.ok(
      c.requests.slice(swapStart).some((r) => r.opcode === 28),
      'Original live swap request',
    );
    equipped = seed(database, token);
    assert.deepEqual(equipped.slots[1], [5, 1]);
    assert.deepEqual(equipped.slots[9], [1, 0]);
    report.cases.equipment = {
      status: 'passed',
      tooltips,
      slots: equipped.slots,
      requests: c.requests.filter((r) => r.opcode === 12 || r.opcode === 28),
    };
    report.cases.cooldown = {
      status: 'passed',
      ready: ready.cooldown,
      reloading: reloading.cooldown,
      recharged: recharged.cooldown,
      state: launchedState,
    };
    await screenshot(c, 'live-swap');
    await c.page.mouse.click(24, 24);
    await c.page.waitForTimeout(600);
    // A new world repeats startup sequences. A changed Equip must still commit
    // under its own epoch, and subsequent mouse/keyboard input must remain live.
    await screenshot(c, 'post-abandon-menu');
    await c.page.mouse.click(35, 626);
    await c.page.waitForTimeout(500);
    await screenshot(c, 'post-abandon-inventory');
    await c.page.mouse.click(512, 475, { delay: 80 });
    await c.page.waitForTimeout(150); // Let the native frame consume the slot click before moving.
    await clickPetal(c, 12, 0);
    await c.page.waitForTimeout(500);
    assert.deepEqual(seed(database, token).slots[2], [12, 0]);
    await c.page.mouse.click(35, 626);
    await c.page.waitForTimeout(300);
    await c.page.keyboard.press('Enter');
    await c.page.waitForTimeout(200);
    await advance(1);
    await c.page.waitForFunction(() => {
      const d = new DataView(Module.asm.Jf.buffer),
        u = (a) => d.getUint32(a, true);
      return u(u(u(u(4347728) + 2768)) + 2360) && !d.getUint8(4350150);
    });
    await c.page.keyboard.press('Digit2', { delay: 150 });
    await c.page.waitForTimeout(500);
    assert.deepEqual(seed(database, token).slots[1], [1, 0]);
    assert.ok(c.requests.some((r) => r.epoch === 1 && r.opcode === 12));
    report.cases.postAbandonEquipment = { status: 'passed', slots: seed(database, token).slots };
    await c.page.mouse.click(24, 24);
    await c.page.waitForTimeout(600);
  }
  try {
    report.revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    report.sourceState = execFileSync('git', ['status', '--porcelain', '--', 'wave'], {
      cwd: path.resolve(root, '..'),
      encoding: 'utf8',
    }).trim()
      ? 'working-tree'
      : 'committed';
    const project = path.resolve(root, '..');
    const files = (mode) =>
      execFileSync('git', ['ls-files', '-z', ...mode, '--', 'wave'], {
        cwd: project,
        encoding: 'utf8',
      })
        .split('\0')
        .filter(Boolean);
    const deleted = new Set(files(['--deleted']));
    const sources = [...new Set(files(['--cached', '--others', '--exclude-standard']))]
      .filter((file) => !deleted.has(file))
      .sort();
    report.sources = await Promise.all(
      sources.map(async (file) => ({
        file,
        sha256: hash(await readFile(path.join(project, file))),
      })),
    );
    report.native = await Promise.all(
      ['wave_host', 'wave_host_fixture', 'wave_w3_seed'].map(async (file) => ({
        file,
        sha256: hash(await readFile(path.join(native, file))),
      })),
    );
    browser = await chromium.launch({
      headless: true,
      executablePath:
        values.browser ??
        process.env.CHROME_PATH ??
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost', '--no-proxy-server'],
    });
    report.browser = browser.version();
    report.catalog = JSON.parse(
      await readFile(path.join(root, 'data/catalogs/20221030/catalog.json')),
    ).version;
    report.catalogSha256 = hash(
      await readFile(path.join(root, 'data/catalogs/20221030/catalog.json')),
    );
    for (const [scenario, roll] of [
      ['success', 1000000],
      ['failure', 1999999],
    ]) {
      const database = path.join(temporary, scenario + '.sqlite3'),
        initial = seed(database);
      report.sqliteVersion = initial.sqliteVersion;
      host = await startHost({
        snapshot: values.snapshot,
        nativeDir: native,
        port: 0,
        fixture: true,
        database,
        craftRoll: roll,
      });
      report.snapshot = host.snapshot;
      const c = await client(initial.token, scenario),
        before = await profile(c.page);
      assert.equal(before.token, initial.token);
      assert.equal(before.level, initial.level);
      assert.equal(before.inventory[30], 40);
      assert.equal(before.inventory[31], 20);
      assert.deepEqual(before.gallery, galleryBits(initial.discoveries));
      assert.ok(before.progress > 0);
      assert.deepEqual(before.equipped.slice(0, 10), [1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
      assert.deepEqual(before.equipped.slice(10, 12), [5, 1]);
      await screenshot(c, scenario + '-restored');
      await craftMenu(c);
      await clickPetal(c, 5, 0);
      await screenshot(c, scenario + '-selected');
      await clickText(c, 'Craft');
      await c.page.waitForFunction(
        (before) => {
          const d = new DataView(window.Module.asm.Jf.buffer),
            u = (a) => d.getUint32(a, true),
            p = u(u(u(4347728) + 2768));
          return u(p + 2400 + 30 * 4) < before;
        },
        40,
        { timeout: 6000 },
      );
      await c.page.waitForTimeout(1800);
      await screenshot(c, scenario + '-result');
      const after = await profile(c.page),
        saved = seed(database, initial.token);
      assert.ok(c.requests.some((r) => r.opcode === 5));
      if (scenario === 'success') {
        assert.equal(after.inventory[30], 35);
        assert.equal(after.inventory[31], 21);
      } else {
        assert.equal(after.inventory[30], 36);
        assert.equal(after.inventory[31], 20);
      }
      assert.equal(saved.inventory.find(([k, r]) => k === 5 && r === 0)[2], after.inventory[30]);
      assert.deepEqual(c.errors, []);
      report.cases[scenario] = {
        status: 'passed',
        before,
        after,
        saved,
        request: c.requests.find((r) => r.opcode === 5),
      };
      // Shift-all follows the same original request, with the leading boolean set.
      if (scenario === 'success') {
        await c.page.waitForTimeout(2000);
        await clickPetal(c, 12, 0);
        const insufficientBefore = await profile(c.page),
          requestCount = c.requests.filter((r) => r.opcode === 5).length;
        await clickText(c, 'Craft');
        await c.page.waitForTimeout(600);
        assert.equal(c.requests.filter((r) => r.opcode === 5).length, requestCount);
        assert.deepEqual((await profile(c.page)).inventory, insufficientBefore.inventory);
        report.cases.insufficient = {
          status: 'passed',
          quantity: 4,
          labels: await c.page.evaluate(() => [...window.waveLabels]),
        };
        await screenshot(c, 'insufficient');
        await clickPetal(c, 5, 0);
        await c.page.keyboard.down('Shift');
        await c.page.waitForTimeout(120);
        await clickText(c, 'Craft');
        await c.page.waitForTimeout(120);
        await c.page.keyboard.up('Shift');
        await c.page.waitForTimeout(2400);
        const batch = await profile(c.page);
        assert.ok(c.requests.some((r) => r.opcode === 5 && r.data[0] === 1));
        assert.ok(batch.inventory[30] < 35);
        report.cases.batch = { status: 'passed', after: batch };
        await screenshot(c, 'batch-result');
        await equipmentCase(c, database, initial.token);
      }
      const expectedProfile = await profile(c.page);
      await c.context.close();
      await host.stop();
      host = null;
      // Restart and use a new browser context with ONLY the guest token.
      host = await startHost({
        snapshot: values.snapshot,
        nativeDir: native,
        port: 0,
        fixture: true,
        database,
        craftRoll: roll,
      });
      const recovered = await client(initial.token, scenario + '-restart');
      const restored = await profile(recovered.page),
        committed = seed(database, initial.token);
      for (const [kind, rarity, count] of committed.inventory) {
        assert.equal(restored.inventory[kind * 6 + rarity], count);
      }
      assert.equal(restored.level, committed.level);
      assert.deepEqual(restored.equipped, expectedProfile.equipped);
      assert.equal(restored.progress, expectedProfile.progress);
      assert.deepEqual(restored.gallery, galleryBits(committed.discoveries));
      await screenshot(recovered, scenario + '-restart');
      const stranger = await client(null, scenario + '-stranger'),
        other = await profile(stranger.page);
      assert.notEqual(other.token, initial.token);
      assert.equal(other.inventory[30], 0);
      assert.deepEqual(other.gallery, Array(27).fill(0));
      assert.equal(other.progress, 0);
      report.cases[scenario + '-recovery'] = { status: 'passed', restored, committed, other };
      await stranger.context.close();
      await recovered.context.close();
      await host.stop();
      host = null;
    }
    const database = path.join(temporary, 'auto.sqlite3'),
      initial = seed(database, '--auto');
    host = await startHost({
      snapshot: values.snapshot,
      nativeDir: native,
      port: 0,
      fixture: true,
      database,
      craftRoll: 1000000,
    });
    const c = await client(initial.token, 'auto'),
      before = await profile(c.page);
    await craftMenu(c);
    const start = c.requests.length;
    await clickText(c, 'Autocraft');
    await c.page.waitForTimeout(6500);
    const after = await profile(c.page),
      requests = c.requests.slice(start).filter((r) => r.opcode === 5);
    assert.ok(requests.length > 0 && requests.every((r) => r.data[0] === 1));
    assert.ok(after.inventory[30] < before.inventory[30]);
    assert.equal(after.inventory[35], 2);
    assert.deepEqual(after.equipped, before.equipped);
    report.cases.auto = {
      status: 'passed',
      before,
      after,
      requests,
      saved: seed(database, initial.token),
    };
    await screenshot(c, 'auto-result');
    await c.context.close();
    await host.stop();
    host = null;
    // Mixed new effects pass through the original reader with ordinary Ready/input.
    // Offline seeding is restricted to the acceptance executable.
    const behaviorDatabase = path.join(temporary, 'behaviors.sqlite3');
    const behaviorSeed = seed(behaviorDatabase, '--behaviors');
    host = await startHost({
      snapshot: values.snapshot,
      nativeDir: native,
      port: 0,
      fixture: true,
      database: behaviorDatabase,
    });
    const mixed = await client(behaviorSeed.token, 'new-behaviors');
    const restoredMixed = await profile(mixed.page);
    assert.equal(restoredMixed.level, 45);
    for (const [kind, rarity, count] of behaviorSeed.inventory) {
      assert.equal(restoredMixed.inventory[kind * 6 + rarity], count);
    }
    await mixed.page.mouse.move(512, 384);
    await clickText(mixed, 'Ready');
    await mixed.page.waitForTimeout(150);
    assert.ok((await fetch(host.url + 'wave/test/step/1', { method: 'POST' })).ok);
    await mixed.page.waitForFunction(() => {
      const d = new DataView(window.Module.asm.Jf.buffer),
        u = (a) => d.getUint32(a, true);
      const p = u(u(u(4347728) + 2768));
      return u(p + 2360) !== 0 && Math.abs(d.getFloat32(p + 2316, true) - 2 / 3) < 1e-6;
    });
    const activeMixed = await profile(mixed.page);
    assert.deepEqual(activeMixed.equipped.slice(0, 16), behaviorSeed.slots.slice(0, 8).flat());
    assert.deepEqual(activeMixed.cooldown, Array(8).fill(65535));
    await mixed.page.mouse.down();
    await mixed.page.waitForTimeout(120);
    assert.ok((await fetch(host.url + 'wave/test/step/25', { method: 'POST' })).ok);
    await mixed.page.mouse.up();
    await mixed.page.waitForTimeout(500);
    assert.ok(
      mixed.requests.some((r) => r.opcode === 9),
      'Original attack reaches server',
    );
    assert.deepEqual(mixed.errors, []);
    const deployedMixed = await profile(mixed.page);
    assert.ok(deployedMixed.cooldown[5] < 65535, 'Mythic Pollen deployment enters slot recharge');
    await screenshot(mixed, 'new-behaviors');
    report.cases.newBehaviors = {
      status: 'passed',
      inventoryVariants: behaviorSeed.inventory.length,
      slots: behaviorSeed.slots,
      restored: restoredMixed,
      active: activeMixed,
      deployed: deployedMixed,
      screenshot: 'new-behaviors.png',
      scope:
        'Original reader: all 270 inventory entries; mixed eight slots, three hidden passives, Antennae view scale and Pollen recharge. Other effect behavior is covered natively.',
    };
    await mixed.context.close();
    await host.stop();
    host = null;
    await squadCase({
      browser,
      snapshot: values.snapshot,
      nativeDir: native,
      temporary,
      output,
      report,
      seed,
    });
    await abandonReentryCase({
      browser,
      snapshot: values.snapshot,
      nativeDir: native,
      temporary,
      output,
      report,
      seed,
    });
    await realtimeReadyCase({
      browser,
      snapshot: values.snapshot,
      nativeDir: native,
      temporary,
      report,
      seed,
    });
    report.status = 'passed';
  } catch (error) {
    report.error = error.stack;
    console.error(error);
    report.failurePages = [];
    for (const context of browser?.contexts() ?? []) {
      for (const page of context.pages()) {
        const name = `failure-${report.failurePages.length}.png`;
        report.failurePages.push({
          url: page.url(),
          frames: page.frames().map((f) => f.url()),
          screenshot: name,
        });
        await page.screenshot({ path: path.join(output, name) }).catch(() => {});
      }
    }
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await host?.stop();
    await writeFile(path.join(output, 'wire.json'), JSON.stringify(report, null, 2) + '\n');
    await rm(temporary, { recursive: true, force: true });
  }
  if (report.status === 'passed') {
    console.log(
      'W3 original-client crafting, batch, durable identity, inventory, equipment and privacy passed',
    );
  }
}
