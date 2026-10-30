#!/usr/bin/env node
/** Run one explicit product test suite from tests/product-tests.json. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
    'build/engine/engine_native_snapshot_fixture']) {
    if (!existsSync(path.join(root, required)))
      throw new Error(`integration fixture is missing: ${required} (run npm run build:engine)`);
  }
}

if (names.length === 1 && names[0] === 'engine') {
  const suite = await suiteDefinition(manifest, 'engine');
  const listed = spawnSync('ctest', ['--test-dir', 'build/engine', '-N'], { cwd: root, encoding: 'utf8' });
  if (listed.status !== 0) {
    process.stderr.write(listed.stderr);
    throw new Error('cannot list native tests; run npm run build:engine');
  }
  const actual = [...listed.stdout.matchAll(/Test\s+#\d+:\s+(\S+)/g)].map(match => match[1]);
  const expected = suite.expected;
  if (actual.length !== expected.length || actual.some((test, index) => test !== expected[index])) {
    throw new Error(`CTest inventory differs: expected ${expected.join(', ')}; got ${actual.join(', ')}`);
  }
  const run = spawnSync('ctest', suite.argv, { cwd: root, stdio: 'inherit', env: process.env });
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
