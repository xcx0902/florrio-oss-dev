#!/usr/bin/env node
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { execute, artifact, distribution, machine } from './common.mjs';
import { atomicJson } from '../verification/io.mjs';
const directory = path.resolve('build/performance-index');
await mkdir(directory, { recursive: true });
const source = 'engine/tests/perf/active_index.cpp';
const flags = ['-std=c++20', '-O3', '-ffp-contract=off', '-fno-fast-math', '-I', 'engine/include', source];
const results = [];
for (const runtime of ['native', 'wasm']) {
  const binary = path.join(directory, runtime === 'native' ? 'active-index' : 'active-index.cjs');
  await execute(runtime === 'native' ? 'c++' : 'em++', [...flags, ...(runtime === 'wasm' ? ['-sENVIRONMENT=node', '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=67108864', '-sSTACK_SIZE=5242880'] : []), '-o', binary], { env: { ...process.env, EM_CACHE: path.resolve('.emcache') } });
  const runs = JSON.parse(await execute(runtime === 'native' ? binary : process.execPath, runtime === 'native' ? [] : [binary]));
  for (const active of [64, 8192, 16380]) for (const churn of [false, true]) {
    const group = runs.filter(r => r.active === active && r.churn === churn);
    const before = distribution(group.map(r => distribution(r.arraySamplesMs).p95)).p50;
    const after = distribution(group.map(r => distribution(r.indexedSamplesMs).p95)).p50;
    results.push({ runtime, active, churn, beforeP95Ms: before, afterP95Ms: after, changePercent: (after / before - 1) * 100,
      visitedSlotsPerScan: { before: 16384, after: active > 2048 ? 16384 : active },
      met: after <= before * 1.05, runs: group });
  }
}
const report = { schema: 2, kind: 'ordered-active-index', machine: machine(), configuration: { repetitions: 5, scansPerRun: 1000, warmupScans: 1000, order: 'adjacent pairs; counterbalanced each scan', kernel: 'one shared std::array reduction for both dense paths; separate ordered-bitset specialization', densityFallback: 2048, baseline: 'M3 pool without bitset maintenance' },
  inputs: await Promise.all([source, 'engine/tests/perf/reference_pool.hpp', 'engine/include/engine/model/entity_pool.hpp'].map(artifact)), results, passed: results.every(r => r.met) };
await atomicJson('reports/performance/engine/active-index-comparison.json', report);
console.log(JSON.stringify({ passed: report.passed, results: results.map(({ runs, ...r }) => r) }, null, 2));
if (!report.passed) process.exitCode = 1;
