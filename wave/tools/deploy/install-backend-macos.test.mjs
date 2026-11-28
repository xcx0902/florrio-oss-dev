import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { installRelease } from './install-backend-macos.mjs';

const sql = (file, statement) => {
  const result = spawnSync('/usr/bin/sqlite3', [file, statement], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "wave-deploy-test-quote'-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = path.join(directory, 'runtime');
  const web = path.join(directory, 'new-web');
  const binary = path.join(directory, 'new-wave_host');
  const plist = path.join(directory, 'agent.plist');
  for (const dir of ['bin', 'web', 'saves']) {
    await mkdir(path.join(destination, dir), { recursive: true });
  }
  await mkdir(web);
  await writeFile(binary, 'new binary');
  await writeFile(path.join(web, 'index.html'), 'new web');
  await writeFile(path.join(destination, 'bin/wave_host'), 'old binary');
  await writeFile(path.join(destination, 'bin/caddy'), 'proxy untouched');
  await writeFile(path.join(destination, 'web/index.html'), 'old web');
  await writeFile(path.join(destination, 'web/stale.js'), 'stale asset');
  await writeFile(path.join(destination, 'release.json'), 'old metadata');
  await writeFile(plist, 'existing custom plist');
  const database = path.join(destination, 'saves/profiles.sqlite3');
  sql(database, "CREATE TABLE saves (value TEXT); INSERT INTO saves VALUES ('saved progress');");
  const calls = [];
  const service = {
    stop: async () => {
      calls.push('stop');
    },
    start: async () => {
      calls.push('start');
    },
  };
  return { destination, binary, web, plist, database, calls, service, metadata: 'new metadata' };
}

test('publishes a complete release, backs up SQLite and retains custom service config', async (t) => {
  const f = await fixture(t);
  const backup = await installRelease(f);
  assert.deepEqual(f.calls, ['stop', 'start']);
  assert.equal(await readFile(path.join(f.destination, 'bin/wave_host'), 'utf8'), 'new binary');
  assert.equal(await readFile(path.join(f.destination, 'web/index.html'), 'utf8'), 'new web');
  assert.equal(await readFile(path.join(f.destination, 'bin/caddy'), 'utf8'), 'proxy untouched');
  assert.equal(await readFile(f.plist, 'utf8'), 'existing custom plist');
  assert.equal(await readFile(path.join(backup, 'wave_host'), 'utf8'), 'old binary');
  assert.equal(
    sql(path.join(backup, 'profiles.sqlite3'), 'SELECT value FROM saves;'),
    'saved progress',
  );
  assert.equal(sql(f.database, 'SELECT value FROM saves;'), 'saved progress');
  await assert.rejects(access(path.join(f.destination, 'web/stale.js')), { code: 'ENOENT' });
  await assert.rejects(access(path.join(f.destination, '.deploy.lock')), { code: 'ENOENT' });
});

test('unhealthy release restores old binary, web, metadata and service without rewinding saves', async (t) => {
  const f = await fixture(t);
  let starts = 0;
  f.service.start = async () => {
    f.calls.push('start');
    if (++starts === 1) {
      sql(f.database, "INSERT INTO saves VALUES ('committed during restart');");
      throw new Error('unhealthy');
    }
    assert.equal(await readFile(path.join(f.destination, 'bin/wave_host'), 'utf8'), 'old binary');
  };
  await assert.rejects(installRelease(f), /unhealthy/);
  assert.deepEqual(f.calls, ['stop', 'start', 'stop', 'start']);
  assert.equal(await readFile(path.join(f.destination, 'web/index.html'), 'utf8'), 'old web');
  assert.equal(await readFile(path.join(f.destination, 'release.json'), 'utf8'), 'old metadata');
  assert.equal(await readFile(f.plist, 'utf8'), 'existing custom plist');
  assert.equal(sql(f.database, 'SELECT COUNT(*) FROM saves;'), '2');
});

test('missing build input fails before stopping the service', async (t) => {
  const f = await fixture(t);
  await rm(f.binary);
  await assert.rejects(installRelease(f), { code: 'ENOENT' });
  assert.deepEqual(f.calls, []);
  assert.equal(await readFile(path.join(f.destination, 'bin/wave_host'), 'utf8'), 'old binary');
});

test('backup failure restarts the old service before changing runtime files', async (t) => {
  const f = await fixture(t);
  await writeFile(f.database, 'invalid SQLite database');
  await assert.rejects(installRelease(f), /database|SQLite/i);
  assert.deepEqual(f.calls, ['stop', 'start']);
  assert.equal(await readFile(path.join(f.destination, 'bin/wave_host'), 'utf8'), 'old binary');
});

test('another deployment lock is preserved and no service is stopped', async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.destination, '.deploy.lock'));
  await assert.rejects(installRelease(f), { code: 'EEXIST' });
  assert.deepEqual(f.calls, []);
  await access(path.join(f.destination, '.deploy.lock'));
});

test('a failed first installation removes partial runtime files', async (t) => {
  const f = await fixture(t);
  await rm(f.plist);
  await rm(path.join(f.destination, 'bin/wave_host'));
  await rm(path.join(f.destination, 'web'), { recursive: true });
  await rm(path.join(f.destination, 'release.json'));
  f.service.start = async () => {
    throw new Error('cannot start');
  };
  await assert.rejects(installRelease(f), /cannot start/);
  assert.deepEqual(await readdir(path.join(f.destination, 'bin')), ['caddy']);
  await assert.rejects(access(path.join(f.destination, 'web')), { code: 'ENOENT' });
  await assert.rejects(access(f.plist), { code: 'ENOENT' });
});
