#!/usr/bin/env node
/** Build once, verify one immutable delivery, publish a run-scoped ledger. */
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { evidence, newRunId, sameEvidence, sha256, treeIdentity } from './verification-evidence.mjs';
import { atomicJson, runDirectory } from './verification/io.mjs';
import { gates, gatesPassed } from './verification/gates.mjs';
import { startProcess } from './lib/process.mjs';
import { loadManifest } from './test-manifest.mjs';
import { buildInputs, verificationInputs } from './lib/identity.mjs';

const runId = newRunId(), token = randomUUID();
const env = { ...process.env, VERIFY_RUN_ID: runId, VERIFY_LOCK_TOKEN: token, CLIENT_ROOT: 'dist-next' };
await mkdir('reports', { recursive: true });
const lock = await open('reports/verification.lock', 'wx');
const folder = runDirectory('.', runId), reportFile = path.join(folder, 'run.json');
const report = { schema: 5, runId, startedAt: new Date().toISOString(), finishedAt: null, passed: false, steps: [], tools: { node: process.version } };
let active, interrupted = false;
const stop = signal => { interrupted = true; active?.stop(signal); };
const onInterrupt = () => stop('SIGINT'), onTerminate = () => stop('SIGTERM');
async function publish() { await atomicJson(reportFile, report); await atomicJson('reports/latest-run.json', report); }
async function execute(gate, index) {
  if (interrupted) throw new Error('Verification interrupted');
  const command = gate.npm ? (process.env.npm_execpath ? process.execPath : 'npm') : process.execPath;
  const args = gate.npm ? [...(process.env.npm_execpath ? [process.env.npm_execpath] : []), 'run', gate.npm] : [gate.script, ...(gate.args ?? [])];
  const step = { name: gate.name, runId, command: [command, ...args], startedAt: new Date().toISOString(), finishedAt: null, exitCode: null };
  report.steps.push(step); await publish();
  console.log(`[${runId}] ${gate.name}`);
  const logfile = path.join(folder, `${String(index).padStart(2, '0')}.log`), log = await open(logfile, 'wx');
  try {
    active = startProcess(command, args, { env, timeoutMs: gate.timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    active.child.stdout.pipe(process.stdout, { end: false }); active.child.stderr.pipe(process.stderr, { end: false });
    // A single file stream preserves stdout/stderr order as observed by the parent.
    const chunks = []; active.child.stdout.on('data', data => chunks.push(data)); active.child.stderr.on('data', data => chunks.push(data));
    Object.assign(step, await active.done); active = undefined;
    const bytes = Buffer.concat(chunks); await log.writeFile(bytes); step.log = logfile; step.logSha256 = sha256(bytes);
  } finally { await log.close(); }
  step.finishedAt = new Date().toISOString();
  if (gate.suite) { const manifest = await loadManifest().catch(() => null); step.tests = manifest?.suites[gate.suite] ?? null; }
  step.reports = [];
  if (step.exitCode === 0) for (const file of gate.reports ?? []) {
    step.reports.push({ path: file, sha256: sha256(await readFile(file)) });
  }
  await publish();
  if (step.exitCode !== 0) throw new Error(`${gate.name} failed (exit ${step.exitCode})`);
}
try {
  await lock.writeFile(JSON.stringify({ runId, token, pid: process.pid }) + '\n');
  await mkdir(folder, { recursive: true });
  report.inputs = { source: await buildInputs(), verification: await verificationInputs() };
  process.once('SIGINT', onInterrupt); process.once('SIGTERM', onTerminate);
  await publish();
  await atomicJson('reports/current-verification.json', { runId, passed: false, status: 'running', generatedAt: report.startedAt });
  for (const [index, gate] of gates.entries()) {
    await execute(gate, index);
    if (gate.name === 'package') {
      report.evidence = { ...await evidence(), runId };
      const manifest = JSON.parse(await readFile('dist-next/build-manifest.json'));
      report.tools.emscripten = manifest.engineBuild.compilerVersion;
      report.tools.chromium = (await readFile('.chromium-version', 'utf8')).trim();
      report.delivery = { runId: manifest.runId, sha256: sha256(await readFile('dist-next/build-manifest.json')), manifestSha256: manifest.artifactsSha256,
        wasmSha256: sha256(await readFile('dist-next/server.wasm')), treeSha256: (await treeIdentity('.', ['dist-next'])).sha256 };
      for (const step of report.steps) step.deliveryIdentity = report.delivery.treeSha256;
    } else if (report.delivery) report.steps.at(-1).deliveryIdentity = report.delivery.treeSha256;
  }
  const finalEvidence = await evidence();
  report.stable = sameEvidence(report.evidence, finalEvidence)
    && report.inputs.source.sha256 === finalEvidence.source.sha256
    && report.inputs.verification.sha256 === finalEvidence.verification.sha256
    && report.delivery.treeSha256 === (await treeIdentity('.', ['dist-next'])).sha256;
  report.passed = !interrupted && report.stable && report.delivery.runId === runId && gatesPassed(report.steps);
} catch (error) { report.error = error.message; console.error(error.message); }
finally {
  process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onTerminate);
  report.finishedAt = new Date().toISOString();
  try {
    await publish();
    await atomicJson('reports/current-verification.json', { ...report, status: report.passed ? 'passed' : 'failed', generatedAt: report.finishedAt, ledgerSha256: sha256(await readFile(reportFile)) });
  } finally { await lock.close(); await rm('reports/verification.lock', { force: true }); }
}
console.log(`${runId}: ${report.passed ? 'PASS' : 'FAIL'} (${reportFile})`);
if (!report.passed) process.exitCode = 1;
