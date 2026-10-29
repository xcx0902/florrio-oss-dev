/** Real CLI failure paths in disposable roots; no project reports or builds. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const repo = fileURLToPath(new URL('../..', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'florr-runner-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'reports'));
  return root;
}
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const run = (root, script, args = [], env = {}) => spawnSync(process.execPath, [path.join(repo, 'tools', script), ...args], {
  cwd: root, encoding: 'utf8', timeout: 10000, env: { ...process.env, ...env },
});

test('acceptance build failure replaces old success and releases its lock', async t => {
  const root = await fixture(t), cli = path.join(root, 'failing-npm.cjs');
  await writeFile(cli, 'process.exitCode = 7;\n');
  await writeFile(path.join(root, 'reports/current-verification.json'), '{"passed":true}');
  const result = run(root, 'run-verification.mjs', [], { npm_execpath: cli });
  assert.equal(result.status, 1, result.stderr);
  const latest = await json(path.join(root, 'reports/latest-run.json'));
  assert.equal(latest.passed, false);
  assert.equal(latest.steps[0].exitCode, 7);
  assert.ok(latest.finishedAt);
  assert.equal((await json(path.join(root, 'reports/current-verification.json'))).passed, false);
  assert.deepEqual(await json(path.join(root, 'reports/runs', latest.runId, 'run.json')), latest);
  assert.equal(await lstat(path.join(root, 'reports/verification.lock')).catch(() => null), null);
});

test('acceptance publication failure still releases the writer lock', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'reports/latest-run.json'));
  const result = run(root, 'run-verification.mjs');
  assert.equal(result.status, 1);
  const ids = await readdir(path.join(root, 'reports/runs'));
  const recorded = await json(path.join(root, 'reports/runs', ids[0], 'run.json'));
  assert.equal(recorded.passed, false);
  assert.ok(recorded.finishedAt);
  assert.equal(await lstat(path.join(root, 'reports/verification.lock')).catch(() => null), null);
});

test('acceptance interruption kills the npm process group and cannot publish success', { skip: process.platform === 'win32' }, async t => {
  const root = await fixture(t), cli = path.join(root, 'waiting-npm.cjs');
  await writeFile(cli, `const { spawn } = require('node:child_process');
    require('node:fs').writeFileSync('ready', 'yes');
    spawn(process.execPath, ['-e', "const fs = require('node:fs'); fs.writeFileSync('grandchild-ready', 'yes'); setInterval(() => { if (fs.existsSync('release-orphan')) { fs.writeFileSync('orphan-wrote', 'bad'); process.exit(0); } }, 10)"], { stdio: 'inherit' });
    process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);\n`);
  const child = spawn(process.execPath, [path.join(repo, 'tools/run-verification.mjs')], {
    cwd: root, env: { ...process.env, npm_execpath: cli }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGKILL'));
  const completion = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code)); });
  for (let attempt = 0; !await lstat(path.join(root, 'grandchild-ready')).catch(() => null); attempt++) {
    if (attempt > 200) throw new Error('fixture child did not start');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  child.kill('SIGTERM');
  assert.equal(await completion, 1);
  // Release the child's work only after cancellation completed, so a busy
  // test runner cannot mistake work completed before SIGTERM for an orphan.
  await writeFile(path.join(root, 'release-orphan'), 'yes');
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(await lstat(path.join(root, 'orphan-wrote')).catch(() => null), null);
  assert.equal((await json(path.join(root, 'reports/latest-run.json'))).passed, false);
  assert.equal((await json(path.join(root, 'reports/current-verification.json'))).passed, false);
  assert.equal(await lstat(path.join(root, 'reports/verification.lock')).catch(() => null), null);
});

