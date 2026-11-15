import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startHost } from './host.mjs';
import { aim, client } from './online.mjs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, message) {
  for (let i = 0; i < 120; ++i) {
    if (await predicate()) {
      return;
    }
    await pause(50);
  }
  assert.fail(message);
}

export async function disconnectReentryCase({ browser, snapshot, nativeDir, output, report }) {
  console.log('W2-14: close a solo game, reopen the same guest, Ready and move again');
  report.cases['W2-14'] = { status: 'failed', kind: 'disconnect-reentry', scenarios: [] };
  const temporary = await mkdtemp(path.join(tmpdir(), 'wave-disconnect-reentry-'));
  try {
    for (const saved of [false, true]) {
      const label = saved ? 'saved' : 'guest';
      const host = await startHost({
        snapshot,
        nativeDir,
        port: 0,
        database: saved ? path.join(temporary, 'profiles.sqlite3') : undefined,
      });
      const clients = [];
      const rounds = [];
      let storage;
      try {
        for (let round = 0; round < 3; ++round) {
          const entry = await client(browser, host.url, `reentry-${label}-${round}`, storage);
          clients.push(entry);
          await until(() => entry.baseline.has(8193), 'Reopened client receives its profile');
          assert.equal(entry.guest, clients[0].guest, 'Reopening preserves the same guest');
          assert.ok(
            !entry.current.control && !entry.baseline.has(8196) && !entry.baseline.has(8194),
            'A closed solo match cannot leave the reopened client in its old arena or squad',
          );
          await entry.page.mouse.move(512, 384);
          await entry.page.keyboard.press('Enter');
          await until(() => entry.current?.control, 'Ready after reopening controls a new flower');
          await entry.page.waitForFunction(() => {
            const memory = new DataView(window.Module.asm.Jf.buffer);
            const u = (address) => memory.getUint32(address, true);
            return u(u(u(u(4347728) + 2768)) + 2360) && !memory.getUint8(4350150);
          });
          await pause(800); // Wait for the native menu-to-arena animation.
          await aim(entry, [0, 1]);
          const before = entry.baseline.get(entry.current.control).y;
          await until(
            () => entry.baseline.get(entry.current.control)?.y > before + 5,
            'The reopened native client can move its new flower',
          );
          assert.equal(entry.sockets.length, 1, 'Ready requires no additional reconnect');
          assert.equal(entry.documentLoads.length, 1, 'Ready requires no page reload');
          assert.deepEqual(entry.errors, []);
          rounds.push({ round, control: entry.current.control });
          if (round === 2) {
            await entry.page.screenshot({ path: path.join(output, `W2-14-${label}.png`) });
          }
          storage = await entry.context.storageState();
          // Closing the entire context sends no native Continue or Leave.
          await entry.context.close();
          await pause(250); // Let the production clock apply the last-socket disconnect.
        }
        report.cases['W2-14'].scenarios.push({ label, rounds });
      } finally {
        await Promise.all(clients.map((entry) => entry.context.close()));
        await host.stop();
      }
    }
    report.cases['W2-14'].status = 'passed';
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
