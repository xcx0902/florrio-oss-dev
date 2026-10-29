#!/usr/bin/env node
/** Serial product acceptance: build, test, package and bind one delivery identity. */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { evidence, newRunId, sameEvidence, sha256, treeIdentity } from './verification-evidence.mjs';
import { atomicJson, runDirectory } from './verification/io.mjs';

const runId = newRunId(), token = randomUUID();
const env = { ...process.env, VERIFY_RUN_ID: runId, VERIFY_LOCK_TOKEN: token };
await mkdir('reports', { recursive: true });
const lock = await open('reports/verification.lock', 'wx');
const folder = runDirectory('.', runId), reportFile = path.join(folder, 'run.json');
const report = { schema: 4, runId, startedAt: new Date().toISOString(), finishedAt: null, passed: false, steps: [] };
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
async function execute(name, command, args, { extraEnv = {} } = {}) {
  if (interrupted) throw new Error('Verification interrupted');
  const step = { name, command: [command, ...args], startedAt: new Date().toISOString(), finishedAt: null, exitCode: null };
  report.steps.push(step); await publish();
  console.log(`[${runId}] ${name}`);
  // npm's CLI path works under Windows as well as POSIX without a shell.
  const actualCommand = command === 'npm' && process.env.npm_execpath ? process.execPath : command;
  const actualArgs = command === 'npm' && process.env.npm_execpath ? [process.env.npm_execpath, ...args] : args;
  step.exitCode = await new Promise(resolve => {
    child = spawn(actualCommand, actualArgs, { env: { ...env, ...extraEnv }, stdio: 'inherit', detached: process.platform !== 'win32' });
    child.once('error', error => { step.error = error.message; resolve(1); });
    child.once('close', (status, signal) => { step.signal = signal; resolve(signal || interrupted ? 1 : status ?? 1); });
  });
  child = null;
  step.finishedAt = new Date().toISOString();
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
  if (!await execute('unit', process.execPath, ['tools/run-tests.mjs', 'unit'])) throw new Error('unit contracts failed');
  if (!await execute('tools', process.execPath, ['tools/run-tests.mjs', 'tools'])) throw new Error('tool regressions failed');
  if (!await execute('engine', process.execPath, ['tools/run-tests.mjs', 'engine'])) throw new Error('engine tests failed');
  if (!await execute('client', process.execPath, ['tools/run-tests.mjs', 'client'])) throw new Error('client tests failed');
  if (!await execute('integration', process.execPath, ['tools/run-tests.mjs', 'integration'])) throw new Error('integration tests failed');
  if (!await execute('package', process.execPath, ['tools/build-dist-next.mjs', '--skip-build'])) throw new Error('cannot package delivery tree');
  const manifest = JSON.parse(await readFile('dist-next/build-manifest.json'));
  report.delivery = { sha256: sha256(await readFile('dist-next/build-manifest.json')),
    manifestSha256: manifest.artifactsSha256, wasmSha256: sha256(await readFile('dist-next/server.wasm')),
    treeSha256: (await treeIdentity('.', ['dist-next'])).sha256 };
  if (!await execute('delivery integrity', process.execPath, ['tools/verify-dist-next.mjs'])) throw new Error('delivery integrity failed');
  if (!await execute('delivery smoke', process.execPath, ['tools/run-tap.mjs', 'delivery', 'reports/delivery-tests.tap',
    '--', process.execPath, 'tools/run-tests.mjs', 'delivery', '--test-reporter=tap'],
    { extraEnv: { CLIENT_ROOT: 'dist-next' } })) throw new Error('delivery smoke failed');
  if (!await execute('entrypoint smoke', process.execPath, ['tools/smoke-entrypoints.mjs'], { extraEnv: { CLIENT_ROOT: 'dist-next' } })) throw new Error('entrypoint smoke failed');
  if (!await execute('browser matrix', process.execPath, ['tools/browser-matrix.mjs'], { extraEnv: { CLIENT_ROOT: 'dist-next' } })) throw new Error('browser matrix failed');
  const finalEvidence = await evidence();
  report.stable = sameEvidence(report.evidence, finalEvidence)
    && report.delivery.treeSha256 === (await treeIdentity('.', ['dist-next'])).sha256;
  report.passed = !interrupted && report.stable && report.steps.every(step => step.exitCode === 0);
  await publish();
  await atomicJson('reports/current-verification.json', {
    schema: 2, runId, passed: report.passed, status: report.passed ? 'passed' : 'failed', generatedAt: new Date().toISOString(),
    evidence: report.evidence, delivery: report.delivery, stable: report.stable,
    steps: report.steps.map(step => ({ name: step.name, exitCode: step.exitCode, startedAt: step.startedAt, finishedAt: step.finishedAt })),
  });
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
