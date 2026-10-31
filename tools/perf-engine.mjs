#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { evidence, newRunId, sameEvidence } from './verification-evidence.mjs';
import { atomicJson, assertVerificationOwner } from './verification/io.mjs';
await assertVerificationOwner();
const before = await evidence(), runId = process.env.VERIFY_RUN_ID ?? newRunId();
const run = spawnSync('build/engine/engine_product_workload', [], { encoding: 'utf8', timeout: 120000 });
if (run.status !== 0) throw new Error(run.stderr || 'Native performance workload failed');
const result = JSON.parse(run.stdout);
const report = { runId, kind: 'engine-performance', workload: '600 fixed 50ms ticks of the populated product world', result, evidence: before,
  passed: result.ticks === 600 && result.entities > 0 && result.elapsedMs > 0 && sameEvidence(before, await evidence()) };
await atomicJson('reports/perf-engine.json', report); console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
