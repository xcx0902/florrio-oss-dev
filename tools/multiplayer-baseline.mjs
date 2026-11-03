#!/usr/bin/env node
/** Record current seeded native evidence. Does not imply multiplayer acceptance. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildInputs, verificationInputs, sha256, treeIdentity } from './lib/identity.mjs';
import { chromiumExecutable } from './lib/chromium.mjs';
import { newRunId } from './verification-evidence.mjs';
import { atomicJson, assertVerificationOwner } from './verification/io.mjs';

await assertVerificationOwner();
const runId = `m00-${newRunId()}`;
const folder = `reports/multiplayer/baseline/${runId}`;
await mkdir(folder, { recursive: true });
const probe = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    command: [command, ...args],
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    error: result.error?.message ?? null,
  };
};
const source = await buildInputs(),
  verification = await verificationInputs();
const expectedFile = 'tests/fixtures/product/multiplayer/single-player.expected.json';
const expectedBytes = await readFile(expectedFile),
  expected = JSON.parse(expectedBytes);
const metadata = {
  runId,
  generatedAt: new Date().toISOString(),
  platform: { os: os.type(), release: os.release(), arch: process.arch },
  source,
  verification,
  seeds: expected.seeds,
};
const report = {
  schema: 'multiplayer-single-player-baseline-v1',
  ...metadata,
  complete: false,
  passed: false,
};
try {
  const executable = 'build/engine/engine_single_player_baseline_tests';
  const executableBytes = await readFile(executable),
    cacheBytes = await readFile('build/engine/CMakeCache.txt');
  const flags = await readFile(
    'build/engine/CMakeFiles/engine_single_player_baseline_tests.dir/flags.make',
    'utf8',
  );
  assert.match(
    cacheBytes.toString(),
    /^CMAKE_BUILD_TYPE:STRING=Release$/m,
    'baseline requires a native Release build',
  );
  const compiler = cacheBytes.toString().match(/^CMAKE_CXX_COMPILER:FILEPATH=(.+)$/m)?.[1];
  assert.ok(compiler, 'CMake did not identify the C++ compiler');
  const git = {
    commit: probe('git', ['rev-parse', 'HEAD']),
    status: probe('git', ['status', '--porcelain=v1']),
    diffStat: probe('git', ['diff', '--stat', 'HEAD']),
    untracked: probe('git', ['ls-files', '--others', '--exclude-standard']),
  };
  for (const [field, result] of Object.entries(git)) {
    assert.equal(
      result.exitCode,
      0,
      `Cannot establish Git ${field}: ${result.stderr || result.error}`,
    );
  }
  const configuration = {
    buildType: 'Release',
    cxxStandard: 20,
    flags,
    compiler: probe(compiler, ['--version']),
    cacheSha256: sha256(cacheBytes),
    tickMs: expected.tickMs,
    autoPopulate: expected.autoPopulate,
  };
  const chrome = chromiumExecutable();
  const environment = {
    schema: 'multiplayer-baseline-environment-v1',
    ...metadata,
    complete: true,
    git,
    configuration,
    tools: {
      node: probe(process.execPath, ['--version']),
      npm: probe('npm', ['--version']),
      cmake: probe('cmake', ['--version']),
      emscripten: {
        expected: (await readFile('.emscripten-version', 'utf8')).trim(),
        actual: probe(process.env.EMXX || 'em++', ['--version']),
      },
      chromium: {
        expected: (await readFile('.chromium-version', 'utf8')).trim(),
        executable: chrome ?? null,
        actual: chrome ? probe(chrome, ['--version']) : null,
      },
    },
  };
  await atomicJson(`${folder}/environment.json`, environment);
  const captures = [];
  for (let i = 0; i < 2; ++i) {
    const result = probe(path.resolve(executable), []);
    assert.equal(result.exitCode, 0, JSON.stringify(result));
    const state = JSON.parse(result.stdout);
    assert.equal(state.complete, true);
    assert.deepEqual(state, expected, 'domain behaviour differs from the frozen M00 fixture');
    captures.push({ sha256: sha256(result.stdout), state });
  }
  assert.deepEqual(captures[0], captures[1], 'seeded replay is nondeterministic');
  assert.equal(
    (await buildInputs()).sha256,
    source.sha256,
    'build inputs changed during recording',
  );
  assert.equal(
    (await verificationInputs()).sha256,
    verification.sha256,
    'verification inputs changed during recording',
  );
  assert.equal(
    sha256(await readFile(executable)),
    sha256(executableBytes),
    'native executable changed during recording',
  );
  Object.assign(report, {
    configuration,
    executable: { path: executable, sha256: sha256(executableBytes) },
    engineLibrarySha256: sha256(await readFile('build/engine/libengine_core.a')),
    workerAdapterSha256: sha256(await readFile('build/engine/libengine_worker_adapter.a')),
    fixture: { path: expectedFile, sha256: sha256(expectedBytes) },
    contracts: await treeIdentity('.', [
      'cmake/dependencies.lock.json',
      'docs/adr/0002-native-authoritative-multiplayer.md',
      'docs/multiplayer/configuration.md',
      'docs/multiplayer/testing.md',
    ]),
    captures,
    complete: true,
    passed: true,
  });
} catch (error) {
  report.error = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await atomicJson(`${folder}/single-player.json`, report);
  await atomicJson('reports/multiplayer/baseline/single-player.json', report);
}
console.log(
  JSON.stringify(
    {
      runId,
      path: `${folder}/single-player.json`,
      passed: report.passed,
      complete: report.complete,
      error: report.error,
    },
    null,
    2,
  ),
);
