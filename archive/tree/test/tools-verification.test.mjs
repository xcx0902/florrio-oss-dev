/** Isolated verification protocol fixtures; never touches the project's published reports. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm, lstat, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { captureTap } from '../tools/run-tap.mjs';
import { writeCurrentVerification } from '../tools/write-current-verification.mjs';
import { runDirectory, assertVerificationOwner } from '../tools/verification/io.mjs';
const tap = 'TAP version 13\nok 1 - fixture\n1..1\n# pass 1\n# fail 0\n';
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'florr-verification-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const command = text => ['-e', `process.stdout.write(${JSON.stringify(text)})`];

test('TAP capture keeps an immutable copy and invalidates a prior pass on spawn failure', async t => {
  const root = await fixture(t), output = 'reports/example.tap';
  const run = await captureTap({ root, name: 'example', output, command: process.execPath, args: command(tap), env: { ...process.env, VERIFY_RUN_ID: 'first-fixture' } });
  assert.equal(run.passed, true);
  assert.equal(await readFile(path.join(root, output), 'utf8'), tap);
  const result = await captureTap({ root, name: 'example', output, command: '/no-such-verification-command', env: { ...process.env, VERIFY_RUN_ID: 'second-fixture' } });
  assert.equal(result.passed, false);
  assert.equal(result.metadata.exitCode, 1);
  assert.match(result.metadata.error, /ENOENT/);
  assert.equal(await readFile(path.join(root, 'reports/runs/first-fixture/example.tap'), 'utf8'), tap);
  assert.equal(await lstat(path.join(root, `${output}.lock`)).catch(() => null), null);
  const ledger = await writeCurrentVerification({ root, runId: 'second-fixture', output: 'reports/fixture-ledger.json' });
  assert.equal(ledger.passed, false);
  assert.ok(ledger.knownGaps.some(gap => gap.includes('no stable complete')));
});

test('TAP capture refuses reused run files, corrupt TAP, unsafe ids and foreign writer locks', async t => {
  const root = await fixture(t), output = 'reports/example.tap';
  const options = { root, name: 'example', output, command: process.execPath, args: command(tap), env: { ...process.env, VERIFY_RUN_ID: 'fixture' } };
  await captureTap(options);
  await assert.rejects(captureTap(options), /EEXIST/);
  assert.equal(await lstat(path.join(root, `${output}.lock`)).catch(() => null), null);
  const bad = await captureTap({ ...options, env: { ...options.env, VERIFY_RUN_ID: 'bad-tap' }, args: command(tap + tap) });
  assert.equal(bad.passed, false);
  assert.throws(() => runDirectory(root, '../escape'), /Invalid verification run id/);
  await writeFile(path.join(root, 'reports/verification.lock'), JSON.stringify({ runId: 'other', token: 'other' }));
  await assert.rejects(captureTap({ ...options, env: {} }), /Another verification run/);
  await rm(path.join(root, 'reports/verification.lock'));
});

test('ledger records broken JSON and absent evidence as gaps without reusing published greens', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'tests/parity/production'), { recursive: true });
  await writeFile(path.join(root, 'tests/parity/production/report.json'), '{broken');
  const ledger = await writeCurrentVerification({ root, runId: null, output: 'fixture-ledger.json' });
  assert.equal(ledger.passed, false);
  assert.equal(ledger.runId, null);
  assert.equal(ledger.parity.production.passed, false);
  assert.ok(ledger.knownGaps.some(gap => gap.includes('24 production recordings')));
  assert.equal(JSON.parse(await readFile(path.join(root, 'fixture-ledger.json'), 'utf8')).passed, false);
});

import { evidence, sha256, treeIdentity, scenarioNames } from '../tools/verification-evidence.mjs';
import { reportPaths, tapPaths, requiredSteps } from '../tools/verification/gates.mjs';
import { requiredProductionChecks } from '../tools/parity/production-checks.mjs';
test('runtime identity ignores compiler timestamps but detects emitted byte changes', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'client/public'), { recursive: true });
  await writeFile(path.join(root, 'client/public/main.js'), 'export const x = 1;');
  await writeFile(path.join(root, 'client/public/server.wasm.build.json'), '{"runId":"first"}');
  const before = await evidence(root);
  await writeFile(path.join(root, 'client/public/server.wasm.build.json'), '{"runId":"second"}');
  assert.equal((await evidence(root)).client.sha256, before.client.sha256);
  await writeFile(path.join(root, 'client/public/main.js'), 'export const x = 2;');
  assert.notEqual((await evidence(root)).client.sha256, before.client.sha256);
});

test('acceptance source identity includes the native regression suites', async t => {
  const root = await fixture(t), folder = path.join(root, 'engine/tests/unit');
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, 'test_peer_visibility.cpp');
  await writeFile(file, 'int main() { return 0; }\n');
  const before = await evidence(root);
  await writeFile(file, 'int main() { return 1; }\n');
  assert.notEqual((await evidence(root)).source.sha256, before.source.sha256);
});

test('ledger refuses a finished TAP record without a successful child exit', async t => {
  const root = await fixture(t), runId = 'exit-fixture';
  await captureTap({ root, name: 'javascript', output: 'reports/javascript-tests.tap', command: process.execPath,
    args: command(tap), env: { ...process.env, VERIFY_RUN_ID: runId } });
  const file = path.join(root, 'reports/runs', runId, 'javascript.meta.json');
  const metadata = JSON.parse(await readFile(file, 'utf8'));
  metadata.exitCode = null;
  await writeFile(file, JSON.stringify(metadata));
  const ledger = await writeCurrentVerification({ root, runId, output: 'fixture-ledger.json' });
  assert.equal(ledger.tests.javascript.status, 'stale');
  assert.equal(ledger.passed, false);
});

test('writer ownership refuses corrupt, null and incomplete lock records', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'reports'));
  for (const value of ['{broken', 'null', '{}', '{"runId":"fixture"}', '{"runId":"fixture","token":""}']) {
    await writeFile(path.join(root, 'reports/verification.lock'), value);
    await assert.rejects(assertVerificationOwner(root, { VERIFY_RUN_ID: 'fixture' }), /Another verification run/);
  }
});

test('a complete isolated run closes the ledger; failed runs, untimed or tampered snapshots cannot', async t => {
  const root = await fixture(t), runId = 'complete-ledger-fixture', directory = runDirectory(root, runId);
  const put = async (file, value) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  await put(path.join(root, 'dist-next/build-manifest.json'), '{}');
  await put(path.join(root, 'dist-next/server.wasm'), '\0asm\x01\0\0\0');
  const current = { ...await evidence(root), runId };
  const delivery = { manifestSha256: sha256(await readFile(path.join(root, 'dist-next/build-manifest.json'))),
    wasmSha256: sha256(await readFile(path.join(root, 'dist-next/server.wasm'))),
    sha256: (await treeIdentity(root, ['dist-next'])).sha256 };
  const baseTime = Date.now() - 60000, stamp = offset => new Date(baseTime + offset).toISOString();
  const steps = [...requiredSteps, 'ledger'].map((name, index) => ({ name, exitCode: 0,
    startedAt: stamp(index * 1000), finishedAt: stamp(index * 1000 + 900), reports: {} }));
  const run = { schema: 3, runId, evidence: current, delivery, stable: true, passed: true,
    startedAt: stamp(0), finishedAt: stamp(steps.length * 1000), steps };
  const stepNames = { server: 'original parity', originalClient: 'original parity', engineState: 'engine state',
    engineSoak: 'engine soak', next: 'self consistency', originalEngine: 'original + engine',
    visual: 'visual', renderCommands: 'canvas', hornet: 'hornet', production: 'production', performance: 'performance' };
  const protocolChecks = requiredOriginalClientChecks('death');
  for (const [name, source] of Object.entries(reportPaths)) {
    const step = steps.find(step => step.name === stepNames[name]);
    const generatedAt = new Date(Date.parse(step.startedAt) + 400).toISOString();
    const value = { evidence: current, generatedAt, passed: true, strict: true, strictPassed: true,
      scenarios: scenarioNames.map(name => ({ name, passed: true,
        ticks: 1000, ratio: 0, max: 0, issueCount: 0, expectedFrames: 3, actualFrames: 3, comparedFrames: 3,
        probe: { found: true }, checks: Object.fromEntries(protocolChecks.map(key => [key, true])) })) };
    if (name === 'originalEngine') Object.assign(value, { kind: 'original-client-integration', equivalence: false,
      engineRoot: 'dist-next', engineWasmSha256: delivery.wasmSha256 });
    if (name === 'engineSoak') value.soakTicks = 1000;
    if (name === 'visual') value.thresholds = { maxRatio: 0.001, maxDelta: 8 };
    if (name === 'renderCommands') value.tolerance = 1e-4;
    if (name === 'hornet') {
      delete value.scenarios;
      value.fixtures = ['callback-facing-0', `callback-facing-${Math.PI / 2}`, `callback-facing-${Math.PI}`,
        'callback-facing-2.150125503540039', 'gate-in-range', 'gate-retained-at-range',
        'gate-retained-out-of-range', 'gate-target-invalidated', 'gate-no-target', 'gate-cooldown',
        'gate-cooldown-one-ms-left', 'gate-cooldown-exact-expiry', 'lifetime', 'hit']
        .map(name => ({ name, passed: true }));
    }
    if (['production', 'performance'].includes(name)) Object.assign(value, { root: 'dist-next',
      rootManifestSha256: delivery.manifestSha256, rootWasmSha256: delivery.wasmSha256,
      target: { sha256: delivery.sha256 }, sourceMatchesDelivery: true, stable: true });
    if (name === 'production') Object.assign(value, { kind: 'production-integration', equivalence: false,
      completeCoverage: true, integrationPassed: true, changedDuringRun: false,
      scenarios: scenarioNames.map(name => ({ name, passed: true, profiles: ['desktop', 'retina', 'touch'].map(profile => ({
        profile, passed: true, errors: [], checks: Object.fromEntries(requiredProductionChecks(name, profile).map(key => [key, true])),
      })) })) });
    if (name === 'performance') {
      delete value.scenarios;
      Object.assign(value, { frames: 600, entities: 872, drawFrames: 600, errors: [], intervals: Array(600).fill(16),
        fps: 62.5, frameMs: { p95: 16, max: 16 } });
    }
    const bytes = JSON.stringify(value), relative = `artifacts/${name}.json`;
    await put(path.join(directory, relative), bytes);
    step.reports[name] = { source, path: relative, generatedAt, sha256: sha256(bytes) };
  }
  for (const name of Object.keys(tapPaths)) {
    const step = steps.find(step => step.name === ({ delivery: 'delivery smoke', browser: 'browser matrix' }[name] ?? name));
    await put(path.join(directory, `${name}.tap`), tap);
    await put(path.join(directory, `${name}.meta.json`), { runId, evidence: current, exitCode: 0, stable: true, sha256: sha256(tap),
      startedAt: step.startedAt, finishedAt: step.finishedAt,
      target: ['delivery', 'browser'].includes(name) ? { root: 'dist-next', sha256: delivery.sha256 } : undefined });
  }
  const runFile = path.join(directory, 'run.json');
  const ledger = () => writeCurrentVerification({ root, runId, output: 'fixture-ledger.json' });
  await put(runFile, run);
  assert.deepEqual((await ledger()).knownGaps, []);
  // A live report cannot replace a broken immutable recording.
  const snapshot = path.join(directory, 'artifacts/production.json'), original = await readFile(snapshot, 'utf8');
  await put(path.join(root, reportPaths.production), original);
  await put(snapshot, { ...JSON.parse(original), tampered: true });
  assert.equal((await ledger()).parity.production.status, 'unrecorded');
  await put(snapshot, original);
  const metaFile = path.join(directory, 'javascript.meta.json'), meta = JSON.parse(await readFile(metaFile, 'utf8'));
  await put(metaFile, { ...meta, startedAt: stamp(-1000) });
  assert.equal((await ledger()).tests.javascript.status, 'stale');
  await put(metaFile, meta);
  for (const patch of [{ passed: false }, { finishedAt: null }, { steps: [...steps, null] },
    { steps: [steps[1], steps[0], ...steps.slice(2)] }, { steps: steps.slice(0, -1) },
    { steps: steps.filter(step => step.name !== 'native suites') },
    { steps: steps.map(step => step.name === 'native suites' ? { ...step, exitCode: 1 } : step) },
    { steps: steps.filter(step => step.name !== 'entrypoint smoke') },
    { steps: steps.map(step => step.name === 'entrypoint smoke' ? { ...step, exitCode: 1 } : step) },
    { steps: steps.filter(step => step.name !== 'browser version') },
    { steps: steps.map(step => step.name === 'browser version' ? { ...step, exitCode: 1 } : step) }]) {
    await put(runFile, { ...run, ...patch });
    assert.equal((await ledger()).passed, false, JSON.stringify(patch));
  }
  await put(runFile, run);
  assert.equal((await ledger()).passed, true);
});

test('an unmatched test glob invalidates prior success and always releases its output lock', async t => {
  const root = await fixture(t), output = 'reports/example.tap';
  const options = { root, name: 'example', output, command: process.execPath, args: command(tap),
    env: { ...process.env, VERIFY_RUN_ID: 'glob-first' } };
  await captureTap(options);
  await assert.rejects(captureTap({ ...options, args: ['--test', 'missing/*.test.mjs'],
    env: { ...options.env, VERIFY_RUN_ID: 'glob-failed' } }), /matched no files/);
  const metadata = JSON.parse(await readFile(path.join(root, output + '.meta.json'), 'utf8'));
  assert.equal(metadata.runId, 'glob-failed');
  assert.equal(metadata.exitCode, null);
  assert.equal(metadata.stable, false);
  assert.equal(await lstat(path.join(root, output + '.lock')).catch(() => null), null);
});

test('delivery evidence includes hidden files and rejects nested symlink aliases', async t => {
  const root = await fixture(t), target = path.join(root, 'dist-next');
  await mkdir(target);
  await writeFile(path.join(target, 'main.js'), 'current');
  const first = await treeIdentity(root, ['dist-next']);
  await writeFile(path.join(target, '.delivery-config'), 'changed');
  const second = await treeIdentity(root, ['dist-next']);
  assert.notEqual(second.sha256, first.sha256);
  assert.ok(second.files['dist-next/.delivery-config']);
  await symlink(target, path.join(target, 'loop'), 'dir');
  await assert.rejects(treeIdentity(root, ['dist-next']), /Unsupported evidence symlink/);
});

test('TAP capture accepts actual node:test nested suite output', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'suite.mjs'), `import { describe, it } from 'node:test';
    describe('outer', () => { describe('inner', () => { it('first', () => {}); it('second', () => {}); }); });\n`);
  const env = { ...process.env, VERIFY_RUN_ID: 'nested-fixture' };
  delete env.NODE_TEST_CONTEXT;
  const result = await captureTap({ root, name: 'nested', output: 'reports/nested.tap', command: process.execPath,
    args: ['--test', '--test-reporter=tap', 'suite.mjs'], env });
  assert.equal(result.passed, true, result.metadata.result.issues.join('; '));
  assert.equal(result.metadata.result.total, 2);
});

import { requiredOriginalClientChecks } from '../tools/parity/original-client-checks.mjs';
