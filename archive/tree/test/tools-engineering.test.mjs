import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, rm, symlink, copyFile, readlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import net from 'node:net';
import { archiveLegacy as performArchive } from '../tools/archive-legacy.mjs';
import { chromiumExecutable } from '../tools/lib/chromium.mjs';
import { captureTap } from '../tools/run-tap.mjs';
import { parse as parseYaml } from 'yaml';
// Only these temporary fixtures bypass the final mainline acceptance guard.
const archiveLegacy = options => performArchive({ ...options, requireAcceptance: false });
const entrypointReports = ['entrypoint-smoke.json', 'entrypoints/default.png', 'entrypoints/reference.png'];

test('acceptance pins the golden browser instead of the older Playwright bundled revision', async () => {
  const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
  const version = (await read('.chromium-version')).trim();
  for (const name of ['boot-menu', 'garden-idle', 'move', 'attack', 'equip', 'damage', 'death', 'spawn'])
    assert.equal(JSON.parse(await read(`tests/parity/golden/${name}/meta.json`)).browser, version);
  const workflow = parseYaml(await read('.github/workflows/ci.yml'));
  const steps = workflow.jobs.acceptance.steps;
  const install = steps.find(step => step.uses === 'browser-actions/setup-chrome@v2');
  assert.equal(install.with['chrome-version'], '${{ steps.emsdk.outputs.chrome }}');
  assert.equal(install.with['install-dependencies'], true);
  assert.ok(steps.some(step => step.id === 'emsdk' && step.run.includes('cat .chromium-version')));
  assert.ok(steps.some(step => step.run?.includes('CHROME_PATH=${{ steps.chrome.outputs.chrome-path }}')));
  assert.ok(!steps.some(step => step.run?.includes('playwright-core/cli.js install')));
});

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'florr-archive-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'source/game'), { recursive: true });
  await writeFile(path.join(root, 'source/game/oracle.mjs'), 'original bytes\n');
  return root;
}

async function reportFixture(t, extraKeys = []) {
  const root = await fixture(t), keyFiles = {};
  for (const relative of ['reports/build.json', 'reports/wasm/manifest.json', 'reports/RECONSTRUCTION.md', ...extraKeys]) {
    const body = `frozen ${relative}\n`;
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), body);
    keyFiles[relative] = { bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') };
  }
  await mkdir(path.join(root, 'reference'), { recursive: true });
  await writeFile(path.join(root, 'reference/manifest.json'), JSON.stringify({ keyFiles }));
  for (const relative of ['current-verification.json', 'latest-run.json', 'historical-analysis.json', 'runs/before/run.json',
    ...entrypointReports, 'entrypoints/diagnostic.png',
    ...['javascript', 'engine', 'client', 'delivery', 'browser'].flatMap(name => [`${name}-tests.tap`, `${name}-tests.tap.meta.json`])]) {
    await mkdir(path.dirname(path.join(root, 'reports', relative)), { recursive: true });
    if (!Object.hasOwn(keyFiles, `reports/${relative}`))
      await writeFile(path.join(root, 'reports', relative), `before ${relative}\n`);
  }
  return root;
}

async function reportBytes(root, relative = 'reports') {
  const files = {};
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(files, await reportBytes(root, name));
    else files[name] = (await readFile(path.join(root, name))).toString('base64');
  }
  return files;
}

async function dependencyFixture(t) {
  const root = await fixture(t);
  for (const name of ['source/game/client/snapshots.mjs', 'source/game/server/output.mjs',
    'source/runtime/indirect.mjs', 'source/semantic/server-behavior.mjs']) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await copyFile(new URL(`../${name}`, import.meta.url), path.join(root, name));
  }
  return root;
}

function importDependencyFixture(root, archived = false) {
  const url = name => JSON.stringify(pathToFileURL(path.join(root, name)).href);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const snapshots = await import(${url('source/game/client/snapshots.mjs')});
    const output = await import(${url('source/game/server/output.mjs')});
    assert.equal(typeof snapshots.createClientSnapshotHooks, 'function');
    assert.equal(typeof output.createServerOutputHooks, 'function');
    ${archived ? `
    assert.equal(snapshots, await import(${url('legacy/source/game/client/snapshots.mjs')}));
    assert.equal(output, await import(${url('legacy/source/game/server/output.mjs')}));
    for (const [original, bridge] of ${JSON.stringify(['runtime/indirect.mjs', 'semantic/server-behavior.mjs'].map(name =>
      [pathToFileURL(path.join(root, 'source', name)).href, pathToFileURL(path.join(root, 'legacy/source', name)).href]))})
      assert.equal(await import(original), await import(bridge));` : ''}
  `], { env, stdio: 'pipe' });
}

test('archive dependency bridges preserve real ESM imports through copy, move and restore', async t => {
  const root = await dependencyFixture(t), sources = ['source/game'];
  importDependencyFixture(root);
  const copied = await archiveLegacy({ root, sources, mode: 'copy' });
  for (const name of ['runtime', 'semantic'])
    assert.equal(await lstat(path.join(root, 'legacy/source', name)).catch(() => null), null);
  const moved = await archiveLegacy({ root, sources, mode: 'move' });
  assert.equal(moved.sources[0].sha256, copied.sources[0].sha256);
  assert.equal(moved.dependencyBridges.length, 2);
  for (const name of ['runtime', 'semantic']) {
    assert.equal(await readlink(path.join(root, 'legacy/source', name)), `../../source/${name}`);
    assert.equal((await lstat(path.join(root, 'source', name))).isDirectory(), true);
  }
  importDependencyFixture(root, true);
  await archiveLegacy({ root, sources, mode: 'move' });
  await archiveLegacy({ root, sources, mode: 'restore' });
  importDependencyFixture(root);
  for (const name of ['runtime', 'semantic'])
    assert.equal(await lstat(path.join(root, 'legacy/source', name)).catch(() => null), null);
});

test('archive dependency bridges reject occupied paths, tampered links and changed dependencies', async t => {
  const root = await dependencyFixture(t), sources = ['source/game'];
  const bridge = path.join(root, 'legacy/source/runtime');
  await mkdir(bridge, { recursive: true });
  await assert.rejects(archiveLegacy({ root, sources, mode: 'move' }), /Unexpected dependency bridge/);
  assert.equal((await lstat(path.join(root, 'source/game'))).isDirectory(), true);
  await rm(bridge, { recursive: true });
  await archiveLegacy({ root, sources, mode: 'move' });
  const manifest = await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8');
  await rm(bridge);
  await assert.rejects(archiveLegacy({ root, sources, mode: 'restore' }), /Unexpected dependency bridge/);
  await symlink('../../source/semantic', bridge, 'dir');
  await assert.rejects(archiveLegacy({ root, sources, mode: 'restore' }), /Unexpected dependency bridge/);
  assert.equal(await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8'), manifest);
  await rm(bridge);
  await symlink('../../source/runtime', bridge, 'dir');
  const file = path.join(root, 'source/runtime/indirect.mjs'), original = await readFile(file);
  await writeFile(file, 'changed dependency');
  await assert.rejects(archiveLegacy({ root, sources, mode: 'restore' }), /Dependency bridge identity differs/);
  await writeFile(file, original);
  await archiveLegacy({ root, sources, mode: 'restore' });
});

test('archive dependency bridges roll back failed move and restore with their metadata', async t => {
  const root = await dependencyFixture(t), sources = ['source/game'];
  await archiveLegacy({ root, sources, mode: 'copy' });
  const copied = await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8');
  const fail = () => { throw new Error('injected dependency bridge failure'); };
  await assert.rejects(archiveLegacy({ root, sources, mode: 'move', onProgress: fail }), /injected dependency bridge failure/);
  for (const name of ['runtime', 'semantic'])
    assert.equal(await lstat(path.join(root, 'legacy/source', name)).catch(() => null), null);
  assert.equal(await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8'), copied);
  importDependencyFixture(root);
  await archiveLegacy({ root, sources, mode: 'move' });
  const moved = await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8');
  await assert.rejects(archiveLegacy({ root, sources, mode: 'restore', onProgress: fail }), /injected dependency bridge failure/);
  assert.equal(await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8'), moved);
  importDependencyFixture(root, true);
  for (const failAt of ['legacy/source/runtime', 'legacy/source/semantic']) {
    await assert.rejects(archiveLegacy({ root, sources, mode: 'restore', onProgress: ({ source }) => {
      if (source === failAt) throw new Error('injected after bridge cleanup');
    } }), /injected after bridge cleanup/);
    assert.equal(await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8'), moved);
    importDependencyFixture(root, true);
  }
  await archiveLegacy({ root, sources, mode: 'restore' });
  importDependencyFixture(root);
});

test('archive default reports move restores all post-move acceptance outputs without losing files', async t => {
  const root = await reportFixture(t);
  const moved = await archiveLegacy({ root, mode: 'move' });
  assert.equal((await lstat(path.join(root, 'reports'))).isSymbolicLink(), true);
  const childTest = path.join(root, 'acceptance-output.test.mjs');
  await writeFile(childTest, "import test from 'node:test'; test('archive fixture', () => {});\n");
  const childEnv = { ...process.env, VERIFY_RUN_ID: 'post-move-fixture' };
  delete childEnv.NODE_TEST_CONTEXT;
  const captured = await captureTap({ root, name: 'client', output: 'reports/client-tests.tap', command: process.execPath,
    args: ['--test', '--test-reporter=tap', childTest],
    env: childEnv });
  assert.equal(captured.passed, true, JSON.stringify(captured.metadata));
  for (const name of ['current-verification.json', 'latest-run.json', 'perf.json'])
    await writeFile(path.join(root, 'reports', name), JSON.stringify({ runId: 'post-move-fixture', diagnostic: true }));
  for (const name of ['javascript', 'engine', 'delivery', 'browser']) {
    await writeFile(path.join(root, 'reports', `${name}-tests.tap`), 'updated acceptance TAP\n');
    await writeFile(path.join(root, 'reports', `${name}-tests.tap.meta.json`), '{"diagnostic":true}\n');
  }
  for (const name of entrypointReports)
    await writeFile(path.join(root, 'reports', name), name.endsWith('.png')
      ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0xff, 0x80, 1])
      : JSON.stringify({ entries: ['default', 'reference'], diagnostic: true }));
  await writeFile(path.join(root, 'reports/new-diagnostic.json'), 'new report retained\n');
  const expected = await reportBytes(root);
  const restored = await archiveLegacy({ root, mode: 'restore' });
  assert.equal((await lstat(path.join(root, 'reports'))).isDirectory(), true);
  assert.equal(await lstat(path.join(root, 'legacy/reports')).catch(() => null), null);
  assert.deepEqual(await reportBytes(root), expected);
  assert.notEqual(restored.sources.find(entry => entry.source === 'reports').sha256,
    moved.sources.find(entry => entry.source === 'reports').sha256);
});

test('archive mutable reports never exempt frozen keys, historical reports or existing run evidence', async t => {
  const root = await reportFixture(t, ['reports/perf.json', ...entrypointReports.map(name => `reports/${name}`)]);
  await archiveLegacy({ root, mode: 'move' });
  const manifest = await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8');
  for (const name of ['build.json', 'wasm/manifest.json', 'RECONSTRUCTION.md', 'perf.json',
    ...entrypointReports, 'historical-analysis.json', 'runs/before/run.json', 'entrypoints/diagnostic.png']) {
    const file = path.join(root, 'reports', name), original = await readFile(file);
    await writeFile(file, 'corrupted static report\n');
    await assert.rejects(archiveLegacy({ root, mode: 'restore' }), /Restore archive identity differs: reports/);
    assert.equal((await lstat(path.join(root, 'reports'))).isSymbolicLink(), true);
    assert.equal(await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8'), manifest);
    await writeFile(file, original);
  }
  const file = path.join(root, 'reports/historical-analysis.json'), original = await readFile(file);
  await rm(file);
  await assert.rejects(archiveLegacy({ root, mode: 'restore' }), /Restore archive identity differs: reports/);
  await writeFile(file, original);
  await archiveLegacy({ root, mode: 'restore' });
});

test('archive reports refuse corrupt frozen inputs before move and keep the real acceptance guard', async t => {
  const root = await reportFixture(t);
  await assert.rejects(performArchive({ root, mode: 'move' }), /requires a complete passing current mainline/);
  assert.equal(await lstat(path.join(root, 'legacy')).catch(() => null), null);
  await writeFile(path.join(root, 'reports/build.json'), 'corrupted before archive');
  await assert.rejects(archiveLegacy({ root, mode: 'move' }), /Frozen report identity differs/);
  assert.equal((await lstat(path.join(root, 'reports'))).isDirectory(), true);
  assert.equal(await lstat(path.join(root, 'legacy')).catch(() => null), null);
});

test('archive old manifests without report inventories remain strict', async t => {
  const root = await reportFixture(t);
  await archiveLegacy({ root, mode: 'move' });
  const file = path.join(root, 'legacy/archive-manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.schema = 3;
  delete manifest.sources.find(entry => entry.source === 'reports').reportPolicy;
  await writeFile(file, JSON.stringify(manifest));
  await writeFile(path.join(root, 'reports/current-verification.json'), 'new verification\n');
  await assert.rejects(archiveLegacy({ root, mode: 'restore' }), /Restore archive identity differs: reports/);
});

test('archive reports reject nested links and active writers before restoring', async t => {
  const root = await reportFixture(t);
  await archiveLegacy({ root, mode: 'move' });
  await writeFile(path.join(root, 'reports/verification.lock'), '{}');
  await assert.rejects(archiveLegacy({ root, mode: 'restore' }), /active verification writer/);
  await rm(path.join(root, 'reports/verification.lock'));
  await symlink('../source/game/oracle.mjs', path.join(root, 'reports/new-report.json'));
  await assert.rejects(archiveLegacy({ root, mode: 'restore' }), /nested symlink\/special file/);
  await rm(path.join(root, 'reports/new-report.json'));
  await archiveLegacy({ root, mode: 'restore' });
});

test('archive report changes during restore roll back earlier moves and preserve new output', async t => {
  const root = await reportFixture(t);
  await archiveLegacy({ root, mode: 'move' });
  const manifest = await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8');
  await assert.rejects(archiveLegacy({ root, mode: 'restore', onProgress: async ({ source }) => {
    if (source === 'source/game') await writeFile(path.join(root, 'reports/new-report.json'), 'concurrent output\n');
  } }), /Archive input changed during operation: reports/);
  for (const source of ['source/game', 'reports'])
    assert.equal((await lstat(path.join(root, source))).isSymbolicLink(), true);
  assert.equal(await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8'), manifest);
  const expected = await reportBytes(root);
  await archiveLegacy({ root, mode: 'restore' });
  assert.deepEqual(await reportBytes(root), expected);
});

test('archive failed restore after moving reports retains every new file and supports a verified retry', async t => {
  const root = await reportFixture(t);
  await archiveLegacy({ root, mode: 'move' });
  const manifest = await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8');
  await assert.rejects(archiveLegacy({ root, mode: 'restore', onProgress: async ({ source }) => {
    if (source !== 'reports') return;
    await writeFile(path.join(root, 'reports/post-rename.json'), 'preserve even on rollback\n');
    throw new Error('injected reports restore failure');
  } }), /injected reports restore failure/);
  assert.equal((await lstat(path.join(root, 'reports'))).isSymbolicLink(), true);
  assert.equal(await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8'), manifest);
  assert.equal(await readFile(path.join(root, 'reports/post-rename.json'), 'utf8'), 'preserve even on rollback\n');
  const expected = await reportBytes(root);
  await archiveLegacy({ root, mode: 'restore' });
  assert.deepEqual(await reportBytes(root), expected);
});

test('archive existing copy becomes an actual move and restores byte-for-byte', async t => {
  const root = await fixture(t), sources = ['source/game'];
  const copied = await archiveLegacy({ root, sources, mode: 'copy' });
  assert.equal(copied.mode, 'copy');
  assert.equal((await lstat(path.join(root, 'source/game'))).isSymbolicLink(), false);
  const moved = await archiveLegacy({ root, sources, mode: 'move' });
  assert.equal(moved.mode, 'move');
  assert.equal((await lstat(path.join(root, 'source/game'))).isSymbolicLink(), true);
  assert.equal(await readFile(path.join(root, 'source/game/oracle.mjs'), 'utf8'), 'original bytes\n');
  const restored = await archiveLegacy({ root, sources, mode: 'restore' });
  assert.equal(restored.mode, 'restore');
  assert.equal((await lstat(path.join(root, 'source/game'))).isSymbolicLink(), false);
  assert.equal(await readFile(path.join(root, 'source/game/oracle.mjs'), 'utf8'), 'original bytes\n');
  assert.equal((await lstat(path.join(root, 'legacy/source/game')).catch(() => null)), null);
});

test('archive move rejects a stale copy before changing source or manifest; copy refreshes it', async t => {
  const root = await fixture(t), sources = ['source/game'];
  await archiveLegacy({ root, sources, mode: 'copy' });
  const manifest = await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8');
  await writeFile(path.join(root, 'source/game/oracle.mjs'), 'new bytes\n');
  await assert.rejects(archiveLegacy({ root, sources, mode: 'move' }), /Existing archive differs/);
  assert.equal(await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8'), manifest);
  assert.equal((await lstat(path.join(root, 'source/game'))).isSymbolicLink(), false);
  await archiveLegacy({ root, sources, mode: 'copy' });
  assert.equal(await readFile(path.join(root, 'legacy/source/game/oracle.mjs'), 'utf8'), 'new bytes\n');
  await archiveLegacy({ root, sources, mode: 'move' });
  assert.equal((await lstat(path.join(root, 'source/game'))).isSymbolicLink(), true);
});

test('archive restore refuses corrupted saved bytes', async t => {
  const root = await fixture(t), sources = ['source/game'];
  await archiveLegacy({ root, sources, mode: 'move' });
  await writeFile(path.join(root, 'legacy/source/game/oracle.mjs'), 'corrupted bytes');
  await assert.rejects(archiveLegacy({ root, sources, mode: 'restore' }), /Restore archive identity differs/);
  assert.equal((await lstat(path.join(root, 'source/game'))).isSymbolicLink(), true);
});

test('archive dry run is read-only and unsafe roots are refused', async t => {
  const root = await fixture(t);
  const plan = await archiveLegacy({ root, sources: ['source/game'] });
  assert.equal(plan.mode, 'dry-run');
  assert.equal(await lstat(path.join(root, 'legacy')).catch(() => null), null);
  await assert.rejects(archiveLegacy({ root, sources: ['../outside'], mode: 'move' }), /Unsafe archive source/);
});

test('Chromium resolution delegates to installed Playwright on Linux and rejects explicit missing executable', () => {
  assert.equal(chromiumExecutable('', { platform: 'linux', exists: () => false }), undefined);
  assert.equal(chromiumExecutable('', { platform: 'darwin', exists: () => true }), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  assert.throws(() => chromiumExecutable('/missing', { exists: () => false }), /CHROME_PATH does not exist/);
});

test('static server serves GET/HEAD but rejects POST and PUT', async t => {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['serve.mjs', '--root', 'client/public', '--no-open', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Static server did not start')), 5000);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Static server exited ${code}`)); });
    child.stdout.on('data', bytes => { output += bytes; if (output.includes(`:${port}`)) { clearTimeout(timeout); resolve(); } });
  });
  const url = `http://127.0.0.1:${port}/index.html`;
  const get = await fetch(url);
  assert.equal(get.status, 200);
  const body = await get.text();
  assert.ok(body.includes('<html'));
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const method of ['POST', 'PUT']) {
    const response = await fetch(url, { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  }
});

test('archive rolls back assets and metadata after a mid-move or mid-restore failure', async t => {
  const root = await fixture(t), sources = ['source/game'];
  await archiveLegacy({ root, sources, mode: 'copy' });
  const copyManifest = await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8');
  const fail = () => { throw new Error('injected operation failure'); };
  await assert.rejects(archiveLegacy({ root, sources, mode: 'move', onProgress: fail }), /injected operation failure/);
  assert.equal((await lstat(path.join(root, 'source/game'))).isSymbolicLink(), false);
  assert.equal(await readFile(path.join(root, 'source/game/oracle.mjs'), 'utf8'), 'original bytes\n');
  assert.equal(await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8'), copyManifest);
  await archiveLegacy({ root, sources, mode: 'move' });
  const moveManifest = await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8');
  await assert.rejects(archiveLegacy({ root, sources, mode: 'restore', onProgress: fail }), /injected operation failure/);
  assert.equal((await lstat(path.join(root, 'source/game'))).isSymbolicLink(), true);
  assert.equal(await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8'), moveManifest);
  assert.equal(await lstat(path.join(root, 'legacy/.archive.lock')).catch(() => null), null);
  await archiveLegacy({ root, sources, mode: 'restore' });
});

test('final archive move requires current mainline acceptance; copy can be undone safely', async t => {
  const root = await fixture(t), sources = ['source/game'];
  await assert.rejects(performArchive({ root, sources, mode: 'move' }), /requires a complete passing current mainline/);
  assert.equal(await lstat(path.join(root, 'legacy')).catch(() => null), null);
  await archiveLegacy({ root, sources, mode: 'copy' });
  await archiveLegacy({ root, sources, mode: 'restore' });
  assert.equal(await readFile(path.join(root, 'source/game/oracle.mjs'), 'utf8'), 'original bytes\n');
  assert.equal(await lstat(path.join(root, 'legacy/source/game')).catch(() => null), null);
  await assert.rejects(archiveLegacy({ root, sources: ['legacy'], mode: 'copy' }), /Unsafe archive source/);
});

test('archive refuses unfinished or corrupt recovery journals without replacing backups', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'legacy'));
  const journal = path.join(root, 'legacy/archive-operation.json');
  for (const value of ['{"state":"recovery-required"}', '{"state":"in-progress"}', '{broken']) {
    await writeFile(journal, value);
    await assert.rejects(archiveLegacy({ root, sources: ['source/game'], mode: 'copy' }), /recovery is required/);
    assert.equal(await readFile(journal, 'utf8'), value);
    assert.equal(await readFile(path.join(root, 'source/game/oracle.mjs'), 'utf8'), 'original bytes\n');
  }
});
