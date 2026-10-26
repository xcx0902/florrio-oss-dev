#!/usr/bin/env node
/** Serial acceptance, one source build, immutable report snapshots, one delivery identity. */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { evidence, newRunId, sameEvidence, sha256, treeIdentity } from './verification-evidence.mjs';
import { atomicWrite, atomicJson, runDirectory } from './verification/io.mjs';
import { reportPaths } from './verification/gates.mjs';

const runId = newRunId(), token = randomUUID();
const env = { ...process.env, VERIFY_RUN_ID: runId, VERIFY_LOCK_TOKEN: token };
await mkdir('reports', { recursive: true });
const lock = await open('reports/verification.lock', 'wx');
const folder = runDirectory('.', runId), reportFile = path.join(folder, 'run.json');
const report = { schema: 3, runId, startedAt: new Date().toISOString(), finishedAt: null, passed: false, steps: [] };
let child, interrupted = false;
const stop = signal => {
  interrupted = true;
  if (!child) return;
  if (process.platform !== 'win32' && child.pid) {
    try { process.kill(-child.pid, signal); return; } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  child.kill(signal);
};
const onInterrupt = () => stop('SIGINT'), onTerminate = () => stop('SIGTERM');
async function publish() {
  await atomicJson(reportFile, report);
  await atomicJson('reports/latest-run.json', report);
}
async function execute(name, command, args, { reports = [], extraEnv = {} } = {}) {
  if (interrupted) throw new Error('Verification interrupted');
  const step = { name, command: [command, ...args], startedAt: new Date().toISOString(), finishedAt: null, exitCode: null, reports: {} };
  report.steps.push(step); await publish();
  console.log(`[${runId}] ${name}`);
  // npm's CLI path works under Windows as well as POSIX without a shell.
  if (command === 'npm' && process.env.npm_execpath) { args = [process.env.npm_execpath, ...args]; command = process.execPath; }
  step.exitCode = await new Promise(resolve => {
    child = spawn(command, args, { env: { ...env, ...extraEnv }, stdio: 'inherit', detached: process.platform !== 'win32' });
    child.once('error', error => { step.error = error.message; resolve(1); });
    child.once('close', (status, signal) => { step.signal = signal; resolve(signal || interrupted ? 1 : status ?? 1); });
  });
  child = null;
  step.finishedAt = new Date().toISOString();
  for (const name of reports) {
    const source = reportPaths[name];
    try {
      const bytes = await readFile(source);
      const value = JSON.parse(bytes);
      if (!value || value.evidence?.runId !== runId || !sameEvidence(value.evidence, report.evidence)
        || !(Date.parse(value.generatedAt) >= Date.parse(step.startedAt) && Date.parse(value.generatedAt) <= Date.parse(step.finishedAt)))
        throw new Error('report is missing, stale, or belongs to another run');
      const relative = `artifacts/${name}.json`;
      await atomicWrite(path.join(folder, relative), bytes);
      step.reports[name] = { source, path: relative, sha256: sha256(bytes), generatedAt: value.generatedAt };
    } catch (error) { step.reports[name] = { source, error: error.message }; step.exitCode = 1; }
  }
  await publish();
  return step.exitCode === 0;
}
try {
  await lock.writeFile(JSON.stringify({ runId, token, pid: process.pid }) + '\n');
  await mkdir(folder, { recursive: true });
  process.once('SIGINT', onInterrupt); process.once('SIGTERM', onTerminate);
  await publish();
  await atomicJson('reports/current-verification.json', { runId, passed: false, status: 'running', generatedAt: report.startedAt });
  for (const name of ['build:engine', 'build:engine:wasm', 'build:client']) {
    if (!await execute(name, 'npm', ['run', name])) throw new Error(`cannot validate: ${name} failed`);
  }
  report.evidence = { ...await evidence(), runId };
  if (!await execute('package', process.execPath, ['tools/build-dist-next.mjs', '--skip-build'])) throw new Error('delivery packaging failed');
  const manifest = await readFile('dist-next/build-manifest.json');
  report.delivery = { root: 'dist-next', manifestSha256: sha256(manifest),
    wasmSha256: sha256(await readFile('dist-next/server.wasm')),
    sha256: (await treeIdentity('.', ['dist-next'])).sha256 };
  await publish();
  const node = process.execPath;
  const checks = [
    ['browser version', node, ['tools/check-browser-version.mjs']],
    ['reference', 'npm', ['run', 'test:reference']],
    ['javascript', 'npm', ['run', 'test:javascript:tap']],
    ['engine', node, ['tools/run-tap.mjs', 'engine', 'reports/engine-tests.tap', '--', './build/engine/engine_tests', '--tap']],
    ['native suites', 'ctest', ['--test-dir', 'build/engine', '--output-on-failure', '--no-tests=error']],
    ['client', node, ['tools/run-tap.mjs', 'client', 'reports/client-tests.tap', '--', node, '--test', '--test-reporter=tap', 'client/tests/*.test.mjs']],
    ['catalogs', 'npm', ['run', 'catalogs:drops:verify']],
    ['original parity', 'npm', ['run', 'test:parity'], { reports: ['server', 'originalClient'] }],
    ['engine state', 'npm', ['run', 'parity:engine-state:strict'], { reports: ['engineState'] }],
    ['engine soak', 'npm', ['run', 'parity:engine-soak:strict'], { reports: ['engineSoak'] }],
    ['hornet', node, ['tools/parity/hornet-stinger-trace.mjs'], { reports: ['hornet'] }],
    ['self consistency', 'npm', ['run', 'parity:client'], { reports: ['next'] }],
    ['visual', 'npm', ['run', 'parity:visual'], { reports: ['visual'] }],
    ['canvas', 'npm', ['run', 'parity:canvas'], { reports: ['renderCommands'] }],
    ['delivery integrity', node, ['tools/verify-dist-next.mjs']],
    ['delivery smoke', node, ['tools/run-tap.mjs', 'delivery', 'reports/delivery-tests.tap', '--', node, '--test', '--test-reporter=tap', 'client/tests/worker-shim.test.mjs', 'client/tests/menu-interactions.test.mjs'], { extraEnv: { CLIENT_ROOT: 'dist-next' } }],
    ['entrypoint smoke', node, ['tools/smoke-entrypoints.mjs']],
    ['browser matrix', node, ['tools/browser-matrix.mjs'], { extraEnv: { CLIENT_ROOT: 'dist-next' } }],
    ['production', node, ['tools/parity/run-production-scenario.mjs', '--all', '--root', 'dist-next'], { reports: ['production'] }],
    ['original + engine', 'npm', ['run', 'parity:original-engine:all'], { reports: ['originalEngine'] }],
    ['performance', node, ['tools/perf-client.mjs', '--root', 'dist-next', '--frames', '600'], { reports: ['performance'] }],
  ];
  for (const [name, command, args, options] of checks) await execute(name, command, args, options);
  report.stable = sameEvidence(report.evidence, await evidence())
    && report.delivery.sha256 === (await treeIdentity('.', ['dist-next'])).sha256;
  await publish();
  await execute('ledger', node, ['tools/write-current-verification.mjs', '--strict']);
  // Ledger generation is part of the measured interval too.
  report.stable &&= sameEvidence(report.evidence, await evidence())
    && report.delivery.sha256 === (await treeIdentity('.', ['dist-next'])).sha256;
  report.passed = !interrupted && report.stable && report.steps.every(step => step.exitCode === 0);
} catch (error) {
  report.error = error.message;
  console.error(error.message);
} finally {
  process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onTerminate);
  report.finishedAt = new Date().toISOString();
  try {
    await publish();
    if (!report.passed) await atomicJson('reports/current-verification.json', {
      runId, evidence: report.evidence ?? null, passed: false, status: 'failed', generatedAt: report.finishedAt,
      error: report.error ?? (interrupted ? 'Verification interrupted' : 'Acceptance steps or final stability check failed'),
    });
  } finally {
    await lock.close(); await rm('reports/verification.lock', { force: true });
  }
}
console.log(`${runId}: ${report.passed ? 'PASS' : 'FAIL'} (${reportFile})`);
if (!report.passed) process.exitCode = 1;
