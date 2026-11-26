import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { defaultNative, root, startHost } from '../w2/host.mjs';

const { values } = parseArgs({
  options: {
    snapshot: { type: 'string', default: process.env.WAVE_SNAPSHOT },
    'native-dir': { type: 'string', default: process.env.WAVE_NATIVE_DIR ?? defaultNative },
    browser: {
      type: 'string',
      default:
        process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    'output-dir': { type: 'string', default: path.resolve(root, '../reports/wave/DEV') },
  },
});
const output = path.resolve(values['output-dir']);
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'wave-dev-'));
const database = path.join(temporary, 'save.sqlite3');
const report = {
  status: 'failed',
  cases: {},
  node: process.version,
  startedAt: new Date().toISOString(),
};
let host;
let browser;
try {
  execFileSync(
    'cmake',
    [
      '--build',
      values['native-dir'],
      '--target',
      'wave_host_dev',
      'wave_host',
      'wave_w3_seed',
      '--parallel',
    ],
    { stdio: 'inherit' },
  );
  const seeded = JSON.parse(
    execFileSync(path.join(values['native-dir'], 'wave_w3_seed'), [database], { encoding: 'utf8' }),
  );
  host = await startHost({
    snapshot: values.snapshot,
    nativeDir: values['native-dir'],
    port: 0,
    database,
    development: true,
  });
  browser = await chromium.launch({
    executablePath: values.browser,
    headless: true,
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost', '--no-proxy-server'],
  });
  report.browser = browser.version();
  report.snapshot = host.snapshot;
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.addInitScript(
    (token) => localStorage.setItem('cp6_player_id', token),
    seeded.token,
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(host.url);
  await page.waitForFunction(() => window.Module?.asm?.Jf);
  await page.getByRole('button', { name: '存档调试 · DEV' }).click();
  const panel = page.getByRole('dialog');
  const save = panel.getByRole('button', { name: '保存并刷新' });
  await save.waitFor();
  await page.waitForFunction(() => !document.querySelector('#wave-dev [type="submit"]').disabled);
  assert.equal(await panel.locator('select[name="kind"] option').count(), 45);
  const api = '/wave/dev/inventory/' + seeded.token;
  const progressApi = '/wave/dev/progress/' + seeded.token;
  const current = () => page.evaluate(async (api) => (await fetch(api)).json(), api);
  const initial = await current();
  const bad = await page.evaluate(
    async ({ api, version }) => {
      const post = async (params, origin) => {
        const response = await fetch(api, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(origin ? { Origin: origin } : {}),
          },
          body: new URLSearchParams(params),
        });
        return response.status;
      };
      const params = { kind: '5', rarity: '0', count: '10', version, key: 'invalid' };
      return {
        negative: await post({ ...params, count: '-1' }),
        overflow: await post({ ...params, count: '4294967296' }),
        unknownKind: await post({ ...params, kind: '46' }),
        unknownRarity: await post({ ...params, rarity: '6' }),
        stale: await post({ ...params, version: '0' }),
      };
    },
    { api, version: initial.version },
  );
  assert.deepEqual(bad, {
    negative: 400,
    overflow: 400,
    unknownKind: 400,
    unknownRarity: 400,
    stale: 409,
  });
  assert.deepEqual(await current(), initial);
  const forbidden = await fetch(host.url + api.slice(1), {
    method: 'POST',
    headers: {
      Origin: 'https://example.invalid',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'kind=5&rarity=0&count=10&version=0&key=forbidden',
  });
  assert.equal(forbidden.status, 403);
  report.cases.validation = { status: 'passed', ...bad, foreignOrigin: forbidden.status };
  const badProgress = await page.evaluate(
    async ({ api, version }) => {
      const params = {
        xp: '100',
        level: '2',
        garden: '3',
        desert: '4',
        ocean: '5',
        version,
        key: 'bad-progress',
      };
      const post = async (changes) =>
        (
          await fetch(api, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ ...params, ...changes }),
          })
        ).status;
      return {
        negative: await post({ xp: '-1' }),
        overflow: await post({ xp: '9223372036854775808' }),
        mismatch: await post({ level: '1' }),
        levelCap: await post({ level: '256' }),
        waveOverflow: await post({ ocean: '2147483648' }),
        stale: await post({ version: '0' }),
      };
    },
    { api: progressApi, version: initial.version },
  );
  assert.deepEqual(badProgress, {
    negative: 400,
    overflow: 400,
    mismatch: 400,
    levelCap: 400,
    waveOverflow: 400,
    stale: 409,
  });
  assert.deepEqual(await current(), initial);
  const forbiddenProgress = await fetch(host.url + progressApi.slice(1), {
    method: 'POST',
    headers: {
      Origin: 'https://example.invalid',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'xp=0&level=1&garden=0&desert=0&ocean=0&version=0&key=forbidden',
  });
  assert.equal(forbiddenProgress.status, 403);
  report.cases.progressValidation = {
    status: 'passed',
    ...badProgress,
    foreignOrigin: forbiddenProgress.status,
  };

  async function edit(kind, rarity, count) {
    await panel.locator('[name="kind"]').selectOption(String(kind));
    await panel.locator('[name="rarity"]').selectOption(String(rarity));
    const input = panel.locator('[name="count"]');
    await input.click();
    await input.press('ControlOrMeta+A');
    await input.pressSequentially(String(count));
    assert.equal(await input.inputValue(), String(count));
    await Promise.all([page.waitForEvent('load'), save.click()]);
    await page.waitForFunction(() => window.Module?.asm?.Jf);
    await page.waitForFunction(() => !document.querySelector('#wave-dev [type="submit"]').disabled);
  }
  await edit(5, 5, 500);
  let saved = await current();
  assert.equal(saved.inventory.find(([k, r]) => k === 5 && r === 5)[2], '500');
  await page.waitForFunction(() => {
    try {
      const d = new DataView(window.Module.asm.Jf.buffer),
        u = (a) => d.getUint32(a, true);
      const profile = u(u(u(4347728) + 2768));
      return u(profile + 2400 + (5 * 6 + 5) * 4) === 500;
    } catch {
      return false;
    }
  });
  const originalCount = await page.evaluate(() => {
    const d = new DataView(window.Module.asm.Jf.buffer),
      u = (a) => d.getUint32(a, true);
    const profile = u(u(u(4347728) + 2768));
    return u(profile + 2400 + (5 * 6 + 5) * 4);
  });
  assert.equal(originalCount, 500);
  report.cases.add = { status: 'passed', originalCount };
  await page.screenshot({ path: path.join(output, 'inventory-added.png') });
  await edit(1, 0, 2);
  saved = await current();
  assert.equal(saved.slots.filter((s) => s && s[0] === 1 && s[1] === 0).length, 2);
  await page.waitForFunction(() => {
    try {
      const d = new DataView(window.Module.asm.Jf.buffer),
        u = (a) => d.getUint32(a, true);
      return u(u(u(u(4347728) + 2768)) + 2400 + 6 * 4) === 2;
    } catch {
      return false;
    }
  });
  const equipped = await page.evaluate(() =>
    Array.from(new Uint8Array(window.Module.asm.Jf.buffer, 864186, 10)),
  );
  assert.deepEqual(equipped, [1, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  report.cases.reduceEquipped = { status: 'passed', equipped };
  await panel.getByRole('button', { name: '编辑 Mythic Rose', exact: true }).click();
  await panel.getByRole('button', { name: '数量设为 0' }).click();
  await Promise.all([page.waitForEvent('load'), save.click()]);
  await page.waitForFunction(() => !document.querySelector('#wave-dev [type="submit"]').disabled);
  assert.ok(!(await current()).inventory.some(([k, r]) => k === 5 && r === 5));
  report.cases.remove = { status: 'passed' };
  const final = JSON.parse(
    execFileSync(path.join(values['native-dir'], 'wave_w3_seed'), [database, seeded.token], {
      encoding: 'utf8',
    }),
  );
  assert.equal(final.xp, seeded.xp);
  assert.equal(final.highestWave, seeded.highestWave);
  assert.deepEqual(final.discoveries, seeded.discoveries);
  assert.equal(final.token, seeded.token);
  const inventoryBeforeProgress = (await current()).inventory;
  const progressForm = panel.locator('[data-progress]');
  async function saveProgress() {
    await Promise.all([
      page.waitForEvent('load'),
      progressForm.getByRole('button', { name: '保存进度并刷新' }).click(),
    ]);
    await page.waitForFunction(() => window.Module?.asm?.Jf);
    await page.waitForFunction(
      () => !document.querySelector('[data-progress] [type="submit"]').disabled,
    );
  }
  await progressForm.locator('[name="xp"]').fill('900');
  assert.equal(await progressForm.locator('[name="level"]').inputValue(), '4');
  await progressForm.locator('[name="garden"]').fill('12');
  await progressForm.locator('[name="desert"]').fill('33');
  await progressForm.locator('[name="ocean"]').fill('61');
  await saveProgress();
  saved = await current();
  assert.equal(saved.xp, '900');
  assert.equal(saved.level, 4);
  assert.deepEqual(saved.highestWaves, [12, 33, 61]);
  assert.deepEqual(saved.inventory, inventoryBeforeProgress);
  await progressForm.locator('[name="level"]').fill('15');
  assert.equal(await progressForm.locator('[name="xp"]').inputValue(), '19600');
  await saveProgress();
  assert.equal((await current()).level, 15);
  assert.equal((await current()).xp, '19600');
  const maximumXp = '9223372036854775807';
  await progressForm.locator('[name="xp"]').fill(maximumXp);
  assert.equal(await progressForm.locator('[name="level"]').inputValue(), '255');
  await saveProgress();
  assert.equal((await current()).xp, maximumXp);
  assert.equal(await progressForm.locator('[name="xp"]').inputValue(), maximumXp);
  await progressForm.locator('[name="level"]').fill('1');
  assert.equal(await progressForm.locator('[name="xp"]').inputValue(), '0');
  await progressForm.locator('[name="garden"]').fill('0');
  await progressForm.locator('[name="desert"]').fill('2');
  await progressForm.locator('[name="ocean"]').fill('1');
  await saveProgress();
  saved = await current();
  assert.equal(saved.xp, '0');
  assert.equal(saved.level, 1);
  assert.deepEqual(saved.highestWaves, [0, 2, 1]);
  const finalProgress = JSON.parse(
    execFileSync(path.join(values['native-dir'], 'wave_w3_seed'), [database, seeded.token], {
      encoding: 'utf8',
    }),
  );
  assert.equal(finalProgress.xp, 0);
  assert.equal(finalProgress.level, 1);
  assert.equal(finalProgress.highestWave, 2);
  assert.deepEqual(finalProgress.highestWaves, [0, 2, 1]);
  assert.deepEqual(finalProgress.inventory, final.inventory);
  assert.deepEqual(finalProgress.discoveries, final.discoveries);
  report.cases.progress = {
    status: 'passed',
    xp: saved.xp,
    level: saved.level,
    highestWaves: saved.highestWaves,
    maximumXp,
  };
  await page.screenshot({ path: path.join(output, 'progress-final.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'progress-mobile.png') });
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'inventory-final.png') });
  await context.close();
  await host.stop();
  host = await startHost({
    snapshot: values.snapshot,
    nativeDir: values['native-dir'],
    port: 0,
    database,
  });
  const html = await (await fetch(host.url)).text();
  assert.ok(!html.includes('src="dev.js"'));
  assert.ok(!html.includes('href="dev.css"'));
  for (const path of ['dev.js', 'dev.css', api.slice(1), progressApi.slice(1)]) {
    assert.equal((await fetch(host.url + path)).status, 404);
  }
  assert.equal((await fetch(host.url + api.slice(1), { method: 'POST' })).status, 400);
  assert.equal((await fetch(host.url + progressApi.slice(1), { method: 'POST' })).status, 400);
  report.cases.productionIsolation = { status: 'passed' };
  report.native = await Promise.all(
    ['wave_host', 'wave_host_dev'].map(async (file) => ({
      file,
      sha256: createHash('sha256')
        .update(await readFile(path.join(values['native-dir'], file)))
        .digest('hex'),
    })),
  );
  report.status = 'passed';
  console.log(
    'PASS development profile: inventory, XP/level sync, biome records, durable save and production isolation',
  );
} catch (error) {
  report.error = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await host?.stop();
  await writeFile(path.join(output, 'dev.json'), JSON.stringify(report, null, 2) + '\n');
  await rm(temporary, { recursive: true, force: true });
}
