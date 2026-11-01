#!/usr/bin/env node
/** CMake orchestration and immutable native build evidence; no JS simulation. */
import { spawnSync } from 'node:child_process';
import { readFile, mkdir, open, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { nativeInputs, verificationInputs, sha256, treeIdentity } from './lib/identity.mjs';
import { assertVerificationOwner, atomicJson } from './verification/io.mjs';

await assertVerificationOwner();
const root = process.cwd(), directory = 'build/native';
const runId = process.env.VERIFY_RUN_ID ?? `m01-build-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
const report = { schema: 'native-build-v1', runId, startedAt: new Date().toISOString(), passed: false, commands: [] };
await mkdir(directory, { recursive: true });
const lock = await open(path.join(directory, 'build.lock'), 'wx');
const reportPath = `reports/multiplayer/m01/${runId}/build.json`;
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    stdio: capture ? 'pipe' : 'inherit' });
  report.commands.push({ command: [command, ...args], exitCode: result.status });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.stderr ?? result.status}`);
  return result.stdout;
}
try {
  report.source = await nativeInputs();
  report.verification = await verificationInputs();
  const configure = ['-S', '.', '-B', directory, '-DCMAKE_BUILD_TYPE=Release',
    '-DFLORR_BUILD_SERVER=ON', '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON'];
  if (process.env.FLORR_BOOST_ARCHIVE) configure.push(`-DFLORR_BOOST_ARCHIVE=${path.resolve(process.env.FLORR_BOOST_ARCHIVE)}`);
  run('cmake', configure);
  const toolchain = JSON.parse(await readFile(`${directory}/native-toolchain.json`, 'utf8'));
  report.toolchain = { ...toolchain, compilerSha256: sha256(await readFile(toolchain.compiler)),
    cmake: run('cmake', ['--version'], true).trim() };
  report.dependencies = await treeIdentity(toolchain.boostHeaders, ['boost', 'LICENSE_1_0.txt']);
  run('cmake', ['--build', directory, '-j', '6']);
  report.compileCommandsSha256 = sha256(await readFile(`${directory}/compile_commands.json`));
  report.cmakeCacheSha256 = sha256(await readFile(`${directory}/CMakeCache.txt`));
  report.artifacts = {};
  for (const file of ['server/florr_server', 'engine/libengine_core.a', 'engine/libengine_worker_adapter.a']) {
    const bytes = await readFile(`${directory}/${file}`);
    report.artifacts[file] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  for (const file of ['server/florr_server', 'engine/libengine_core.a']) {
    const symbols = run('nm', ['-g', `${directory}/${file}`], true);
    if (/WorkerApi|current_worker_api|\b_?sp_server_/.test(symbols))
      throw new Error(`${file} contains an offline Worker/cheat ABI dependency`);
  }
  const after = await nativeInputs();
  const dependenciesAfter = await treeIdentity(toolchain.boostHeaders, ['boost', 'LICENSE_1_0.txt']);
  report.stable = report.source.sha256 === after.sha256 && report.dependencies.sha256 === dependenciesAfter.sha256
    && report.verification.sha256 === (await verificationInputs()).sha256;
  if (!report.stable) throw new Error('Native source/dependency inputs changed during compilation');
  report.passed = true;
} catch (error) {
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  try {
    await atomicJson(reportPath, report);
    await atomicJson('reports/multiplayer/native-build.json', report);
    await atomicJson(`${directory}/native-build.json`, report);
  } finally { await lock.close(); await rm(path.join(directory, 'build.lock'), { force: true }); }
}
console.log(`${runId}: ${report.passed ? 'PASS' : 'FAIL'} (${reportPath})`);
