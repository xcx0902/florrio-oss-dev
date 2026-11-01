#!/usr/bin/env node
/** Run one explicit product test suite from tests/product-tests.json. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { nativeInputs, verificationInputs, sha256 } from './lib/identity.mjs';
import { assertVerificationOwner, atomicJson } from './verification/io.mjs';
import { parseTap } from './verification/tap.mjs';
import { chromiumExecutable } from './lib/chromium.mjs';
import { expandSuite, loadManifest, suiteDefinition, validateManifest } from './test-manifest.mjs';

const [name, ...extra] = process.argv.slice(2);
if (!name) throw new Error('usage: node tools/run-tests.mjs <suite|client> [node test args]');
const root = path.resolve('.');
const manifest = await loadManifest(root);
await validateManifest(root, manifest);
const names = expandSuite(manifest, name);

const browserSuites = new Set(['client-integration', 'delivery']);
if (names.some(item => browserSuites.has(item))) {
  const executable = chromiumExecutable();
  if (!executable || !existsSync(executable))
    throw new Error(`Chromium is required for ${names.join(', ')}: ${executable ?? 'not configured'}`);
}
if (names.includes('integration')) {
  for (const required of ['tests/fixtures/product/protocol/manual_vectors.json',
    'build/engine/engine_native_snapshot_fixture',
    'tests/fixtures/product/multiplayer/manual_vectors.json',
    'build/engine/engine_native_replication_fixture',
    'build/engine/engine_single_player_baseline_tests']) {
    if (!existsSync(path.join(root, required)))
      throw new Error(`integration fixture is missing: ${required} (run npm run build:engine)`);
  }
}

if (names.length === 1 && ['engine', 'server-native'].includes(names[0])) {
  const suite = await suiteDefinition(manifest, names[0]);
  const directory = names[0] === 'engine' ? 'build/engine' : 'build/native';
  const listed = spawnSync('ctest', ['--test-dir', directory, '-N'], { cwd: root, encoding: 'utf8' });
  if (listed.status !== 0) {
    process.stderr.write(listed.stderr);
    throw new Error(`cannot list native tests; run npm run ${names[0] === 'engine' ? 'build:engine' : 'build:server'}`);
  }
  const actual = [...listed.stdout.matchAll(/Test\s+#\d+:\s+(\S+)/g)].map(match => match[1]);
  const expected = suite.expected;
  if (actual.length !== expected.length || actual.some((test, index) => test !== expected[index])) {
    throw new Error(`CTest inventory differs: expected ${expected.join(', ')}; got ${actual.join(', ')}`);
  }
  const native = names[0] === 'server-native';
  let build, source, verification;
  if (native) {
    await assertVerificationOwner(root);
    build = JSON.parse(await readFile('build/native/native-build.json', 'utf8'));
    source = await nativeInputs(root);
    verification = await verificationInputs(root);
    if (!build.passed || !build.stable || build.source.sha256 !== source.sha256
      || build.verification?.sha256 !== verification.sha256)
      throw new Error('Native build evidence is missing/stale; run npm run build:server');
    for (const [file, artifact] of Object.entries(build.artifacts))
      if (sha256(await readFile(`build/native/${file}`)) !== artifact.sha256)
        throw new Error(`Native build artifact changed: ${file}`);
  }
  const run = spawnSync('ctest', suite.argv, { cwd: root, stdio: native ? 'pipe' : 'inherit', encoding: 'utf8', env: process.env });
  if (native) {
    process.stdout.write(run.stdout ?? ''); process.stderr.write(run.stderr ?? '');
    const stable = source.sha256 === (await nativeInputs(root)).sha256
      && verification.sha256 === (await verificationInputs(root)).sha256;
    const result = { schema: 'native-ctest-v1', runId: build.runId, finishedAt: new Date().toISOString(),
      source: source.sha256, verification: verification.sha256, build: sha256(await readFile('build/native/native-build.json')),
      tests: actual, total: actual.length, exitCode: run.status, stable,
      passed: run.status === 0 && stable, outputSha256: sha256((run.stdout ?? '') + (run.stderr ?? '')) };
    await atomicJson(`reports/multiplayer/m01/${build.runId}/ctest.json`, result);
    await atomicJson('reports/multiplayer/native-ctest.json', result);
    if (!stable) throw new Error('Native inputs changed during CTest');
  }
  process.exitCode = run.status ?? 1;
} else {
  for (const suiteName of names) {
    const suite = await suiteDefinition(manifest, suiteName);
    if (!Array.isArray(suite)) throw new Error(`suite ${suiteName} is not a file list`);
    const args = ['--test'];
    if (suiteName.startsWith('client') || suiteName === 'delivery') args.push('--test-concurrency=1');
    // Always request TAP so the runner can prove that at least one test was
    // discovered. An empty `describe` exits 0 from node:test but has `tests 0`.
    const passthrough = extra.filter(arg => !arg.startsWith('--test-reporter'));
    args.push('--test-reporter=tap', ...passthrough, ...suite);
    console.error(`[test:${suiteName}] ${suite.length} files`);
    const run = spawnSync(process.execPath, args, {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env,
    });
    process.stdout.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    if (run.error) throw run.error;
    const tap = parseTap(run.stdout ?? '');
    if (tap.status !== 'pass' || !(tap.total > 0) || !(tap.passed > 0))
      throw new Error(`test suite ${suiteName} did not establish a nonempty pass: ${tap.issues.join('; ') || 'no tests discovered'}`);
    if (run.status !== 0) {
      process.exitCode = run.status ?? 1;
      break;
    }
  }
}
