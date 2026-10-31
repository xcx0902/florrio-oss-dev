#!/usr/bin/env node
/** Complete M4 acceptance, including one immutable product verification. */
import { readFile, copyFile } from 'node:fs/promises';
import { runProcess } from '../lib/process.mjs';
import { buildInputs, verificationInputs } from '../lib/identity.mjs';
import { newRunId } from '../verification-evidence.mjs';
import { atomicJson, assertVerificationOwner } from '../verification/io.mjs';
import { releaseEvidence } from '../verification/release.mjs';
import { artifact } from './common.mjs';

await assertVerificationOwner();
const summaryFile = 'reports/performance/m4-acceptance.json';
const compact = ({ schema, sha256 }) => ({ schema, sha256 });
const summary = { schema: 2, kind: 'm4-acceptance', runId: newRunId(), startedAt: new Date().toISOString(), passed: false, status: 'running', steps: [] };
await atomicJson(summaryFile, summary);
try {
  summary.source = compact(await buildInputs());
  summary.verificationInputs = compact(await verificationInputs());
  const baselineFiles = ['engine/before.json', 'client/before.json', 'integration/before.json'].map(file => `reports/performance/${file}`);
  const baselines = await Promise.all(baselineFiles.map(artifact));
  for (const file of baselineFiles) {
    const report = JSON.parse(await readFile(file, 'utf8'));
    if (!report.stable || !(report.completed ?? report.passed)) throw new Error(`Missing valid frozen baseline: ${file}`);
    if (report.configuration.frames !== undefined && (report.configuration.frames < 600 || report.configuration.repeats < 5))
      throw new Error(`Baseline is a short diagnostic sample: ${file}`);
  }
  for (const [name, command, args, timeoutMs] of [
    ['product verification', 'npm', ['run', 'test:all'], 40 * 60 * 1000],
    ['ordered active index', process.execPath, ['tools/performance/active-index.mjs'], 10 * 60 * 1000],
    ['30-minute resource soak', process.execPath, ['tools/performance/soak.mjs', '--root', 'dist-next', '--minutes', '30'], 35 * 60 * 1000],
  ]) {
    const step = { name, startedAt: new Date().toISOString() };
    summary.steps.push(step); await atomicJson(summaryFile, summary);
    console.log(`M4: ${name}`);
    Object.assign(step, await runProcess(command, args, { timeoutMs }), { finishedAt: new Date().toISOString() });
    await atomicJson(summaryFile, summary);
    if (step.exitCode) throw new Error(`${name} failed: ${JSON.stringify(step)}`);
  }
  for (const [from, to] of [['perf-engine.json', 'engine/after.json'], ['perf.json', 'client/after.json'], ['perf-integration.json', 'integration/after.json']])
    await copyFile(`reports/${from}`, `reports/performance/${to}`);
  const comparison = await runProcess(process.execPath, ['tools/performance/compare.mjs']);
  if (comparison.exitCode) throw new Error('M4 comparison did not meet acceptance');
  if ((await buildInputs()).sha256 !== summary.source.sha256 || (await verificationInputs()).sha256 !== summary.verificationInputs.sha256)
    throw new Error('Product or verification sources changed during M4 acceptance');
  for (const baseline of baselines) if ((await artifact(baseline.path)).sha256 !== baseline.sha256)
    throw new Error(`Frozen baseline changed during acceptance: ${baseline.path}`);
  // Recheck every gate, immutable ledger, delivery and referenced report after
  // the long soak, so an older successful run cannot satisfy this acceptance.
  const { report } = await releaseEvidence();
  if (report.startedAt < summary.startedAt) throw new Error('Product verification predates this M4 acceptance');
  summary.verificationRunId = report.runId;
  summary.evidence = await Promise.all([
    ...baselineFiles, 'reports/current-verification.json', `reports/runs/${report.runId}/run.json`, 'dist-next/build-manifest.json',
    'reports/performance/engine/after.json', 'reports/performance/client/after.json', 'reports/performance/integration/after.json',
    'reports/performance/m4-comparison.json', 'reports/performance/engine/active-index-comparison.json', 'reports/performance/client/resource-soak.json',
  ].map(artifact));
  Object.assign(summary, { passed: true, status: 'passed', finishedAt: new Date().toISOString() });
  await atomicJson(`reports/performance/runs/${summary.runId}/m4-acceptance.json`, summary);
  await atomicJson(summaryFile, summary);
  console.log('M4 PASS: full product regression, performance comparison, ordered active index and 30-minute resource soak');
} catch (error) {
  Object.assign(summary, { passed: false, status: 'failed', finishedAt: new Date().toISOString(), error: error.stack ?? String(error) });
  await atomicJson(summaryFile, summary);
  throw error;
}
