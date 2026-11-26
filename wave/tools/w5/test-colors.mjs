import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startHost, root } from '../w2/host.mjs';
import { client } from '../w2/online.mjs';

export async function canvasBackground(page, central = false) {
  return page.evaluate((central) => {
    const canvas = document.querySelector('canvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const counts = new Map();
    const left = central ? Math.floor(canvas.width * 0.35) : 5;
    const right = central ? Math.floor(canvas.width * 0.65) : 150;
    for (let y = 70; y < canvas.height - 70; y += 2) {
      for (let x = left; x < right; x += 2) {
        const i = (y * canvas.width + x) * 4;
        const rgb = [...pixels.subarray(i, i + 3)].join(',');
        counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
      }
    }
    return [...counts]
      .sort((a, b) => b[1] - a[1])[0][0]
      .split(',')
      .map(Number);
  }, central);
}

export async function colorCases({ browser, snapshot, nativeDir, output, report, only }) {
  const frozen = JSON.parse(
    await readFile(path.join(root, 'data/wire/20221030/w5-backgrounds.json')),
  );
  const temporary = await mkdtemp(path.join(tmpdir(), 'wave-w5-colors-'));
  const database = path.join(temporary, 'profiles.sqlite3');
  const seed = () =>
    JSON.parse(
      execFileSync(path.join(nativeDir, 'wave_w3_seed'), [database, '--w5'], { encoding: 'utf8' }),
    );
  const profiles = [seed(), seed(), seed(), seed()];
  const results = {};
  let index = 0;
  try {
    for (const rotation of ['desert', 'ocean']) {
      const host = await startHost({
        snapshot,
        nativeDir,
        database,
        port: 0,
        fixture: true,
        rotation,
      });
      try {
        for (const [name, mode] of rotation === 'desert'
          ? [
              ['garden', 0],
              ['desert', 1],
              ['pvp', 2],
            ]
          : [['ocean', 1]]) {
          if (only && name !== only) {
            continue;
          }
          const storage = {
            cookies: [],
            origins: [
              {
                origin: new URL(host.url).origin,
                localStorage: [
                  { name: 'cp6_player_id', value: profiles[index++].token },
                  { name: 'florrio_gamemode', value: String(mode) },
                ],
              },
            ],
          };
          const entry = await client(browser, host.url, name, storage, ['Ready']);
          try {
            await entry.page.waitForTimeout(1400);
            const menu = await canvasBackground(entry.page);
            assert.deepEqual(menu, frozen.colors[name], `${name} original idle menu palette`);
            await entry.page.screenshot({ path: path.join(output, `menu-${name}.png`) });
            await entry.page.mouse.click(660, 335);
            await entry.page.waitForTimeout(200);
            assert.ok((await fetch(host.url + 'wave/test/step/1', { method: 'POST' })).ok);
            const end = Date.now() + 6000;
            while (!entry.current?.control && Date.now() < end) {
              await entry.page.waitForTimeout(50);
            }
            assert.ok(entry.current?.control, `${name} Ready produces a controllable flower`);
            await entry.page.waitForTimeout(700);
            await entry.page.screenshot({ path: path.join(output, `field-${name}.png`) });
            const wire = entry.baseline.get(8196).background;
            const drawn = await canvasBackground(entry.page);
            assert.deepEqual(wire, menu, `${name} arena wire RGB matches its original menu`);
            assert.deepEqual(drawn, menu, `${name} original world renderer displays that RGB`);
            assert.deepEqual(entry.errors, []);
            results[name] = { menu, wire, drawn, screenshot: `field-${name}.png` };
            await entry.page.screenshot({ path: path.join(output, `field-${name}.png`) });
          } finally {
            await entry.context.close();
          }
        }
      } finally {
        await host.stop();
      }
    }
    report.cases['W5-COLORS'] = {
      status: 'passed',
      originalClientSha256: frozen.snapshotSha256,
      modes: results,
    };
    await writeFile(path.join(output, 'menu-colors.json'), JSON.stringify(results, null, 2) + '\n');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
