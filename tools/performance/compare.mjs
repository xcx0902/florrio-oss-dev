#!/usr/bin/env node
/** Validate complete, matched measurements and every M4 acceptance target. */
import { readFile } from 'node:fs/promises';
import { artifact, distribution } from './common.mjs';
import { atomicJson } from '../verification/io.mjs';
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const files = {
  beforeEngine: option('--before-engine', 'reports/performance/engine/before.json'),
  afterEngine: option('--after-engine', 'reports/performance/engine/after.json'),
  beforeClient: option('--before-client', 'reports/performance/client/before.json'),
  afterClient: option('--after-client', 'reports/performance/client/after.json'),
  beforeIntegration: option('--before-integration', 'reports/performance/integration/before.json'),
  afterIntegration: option('--after-integration', 'reports/performance/integration/after.json'),
  soak: option('--soak', 'reports/performance/client/resource-soak.json'),
  activeIndex: option('--active-index', 'reports/performance/engine/active-index-comparison.json'),
};
const reports = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, JSON.parse(await readFile(file, 'utf8'))])));
const require = (condition, message) => { if (!condition) throw new Error(message); };
for (const [key, report] of Object.entries(reports)) {
  if (key === 'activeIndex') { require(report.passed && report.results.length === 12, 'Incomplete active-index acceptance'); continue; }
  require(report.stable && (key.startsWith('before') ? (report.completed ?? report.passed) : report.passed), `${key} is not completed, stable, and accepted`);
  if (report.configuration?.frames !== undefined) require(report.configuration.frames >= 600 && report.configuration.repeats >= 5, `${key} is a short diagnostic profile`);
  if (report.sourceMatchesDelivery !== undefined) require(report.sourceMatchesDelivery, `${key} does not match its delivered source`);
}
for (const key of ['beforeClient', 'beforeIntegration'])
  require(reports[key].evidence.source.sha256 === reports.beforeEngine.evidence.source.sha256, 'Mixed baseline product sources');
for (const [before, after] of [['beforeEngine', 'afterEngine'], ['beforeClient', 'afterClient'], ['beforeIntegration', 'afterIntegration']]) {
  for (const key of ['cpu', 'arch', 'platform', 'release', 'node']) require(reports[before].machine[key] === reports[after].machine[key], `Different machine ${key}: ${before}/${after}`);
  for (const key of ['repeats', 'frames', 'warmupFrames', 'warmupTicks', 'ticks', 'soakTicks', 'fixedStepMs', 'flags', 'compiler', 'emscripten'])
    require(reports[before].configuration[key] === reports[after].configuration[key], `Different workload/toolchain ${key}: ${before}/${after}`);
  if (reports[before].browser) require(reports[before].browser === reports[after].browser, `Different browsers: ${before}/${after}`);
  require(reports[before].results.length === reports[after].results.length, `Missing scenarios: ${before}/${after}`);
  for (const driver of reports[before].drivers ?? []) {
    if (driver.path === 'build/client/dev/test-api.js') continue; // Corresponding product's diagnostic API, intentionally versioned separately.
    const counterpart = reports[after].drivers?.find(d => d.path === driver.path);
    require(counterpart?.sha256 === driver.sha256, `Changed measurement driver: ${driver.path}`);
  }
}
const afterSource = reports.afterEngine.evidence.source.sha256;
for (const key of ['afterClient', 'afterIntegration']) require(reports[key].evidence.source.sha256 === afterSource, 'Mixed final product sources');
require(reports.soak.source.sha256 === afterSource, 'Soak uses another product source');
const payload = files => JSON.stringify(Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'build-manifest.json').sort(([a], [b]) => a.localeCompare(b))));
for (const key of ['afterIntegration', 'soak']) require(payload(reports[key].target.files) === payload(reports.afterClient.target.files), `${key} uses another delivered payload`);
for (const input of reports.activeIndex.inputs) require((await artifact(input.path)).sha256 === input.sha256, `Stale active-index input: ${input.path}`);
const change = (before, after) => before === 0 ? (after === 0 ? 0 : Infinity) : (after / before - 1) * 100;
const median = values => distribution(values).p50;
const checks = [];
const check = (name, met, detail) => checks.push({ name, met, ...detail });
const engine = reports.afterEngine.results.map(after => {
  const before = reports.beforeEngine.results.find(r => r.runtime === after.runtime && r.scenario === after.scenario);
  require(before && after.runs.length === 5 && before.runs.length === 5, `Incomplete engine workload ${after.runtime}/${after.scenario}`);
  const identical = after.runs.every((run, i) => ['seed', 'digest', 'rng', 'rngDraws', 'snapshotBytes', 'packets', 'entities', 'cycles'].every(key => run[key] === before.runs[i]?.[key]));
  require(identical, `Changed product state/RNG/packet bytes: ${after.runtime}/${after.scenario}`);
  const medianChangePercent = change(before.median, after.median), p95ChangePercent = change(before.p95Median, after.p95Median);
  if (after.scenario === 'boot-population') check(`${after.runtime}/P02 boot median`, medianChangePercent <= -30, { changePercent: medianChangePercent, requiredPercent: -30 });
  if (['boot-population', 'spawn-refill'].includes(after.scenario))
    check(`${after.runtime}/P02 ${after.scenario} one index per batch`, after.runs.every(r => r.counters.spatialBuilds === 1),
      { beforeBuilds: before.runs[0].counters.spatialBuilds, afterBuilds: after.runs[0].counters.spatialBuilds });
  if (after.scenario.startsWith('many-area-effects-'))
    check(`${after.runtime}/P03 ${after.scenario} shared phase index`, after.runs.every(r => r.counters.spatialBuilds === r.samplesMs.length),
      { updates: after.runs[0].samplesMs.length, beforeBuilds: before.runs[0].counters.spatialBuilds, afterBuilds: after.runs[0].counters.spatialBuilds });
  if (after.scenario === 'many-area-effects-50') check(`${after.runtime}/P03 area p95`, p95ChangePercent <= -30, { changePercent: p95ChangePercent, requiredPercent: -30 });
  if (after.scenario === 'clustered-contacts') check(`${after.runtime}/P04 contacts p95`, p95ChangePercent <= -20, { changePercent: p95ChangePercent, requiredPercent: -20 });
  if (after.budget) check(`${after.runtime}/${after.scenario} tick budget`, after.budget.met, { budget: after.budget });
  const phases = Object.fromEntries(Object.keys(after.runs[0].phasesMs).map(name => [name, {
    beforeTotalMs: median(before.runs.map(r => r.phasesMs[name] ?? 0)), afterTotalMs: median(after.runs.map(r => r.phasesMs[name] ?? 0)),
    beforeP95Ms: before.runs.every(r => r.phaseTiming?.[name]) ? median(before.runs.map(r => r.phaseTiming[name].p95)) : null,
    afterP95Ms: after.runs.every(r => r.phaseTiming?.[name]) ? median(after.runs.map(r => r.phaseTiming[name].p95)) : null,
  }]));
  if (after.scenario === 'moving-combat') {
    const phase = phases.publish;
    require(phase?.beforeP95Ms !== null && phase?.afterP95Ms !== null, 'Missing publication tail samples');
    check(`${after.runtime}/P06 publication p95`, change(phase.beforeP95Ms, phase.afterP95Ms) <= -20,
      { beforeMs: phase.beforeP95Ms, afterMs: phase.afterP95Ms, requiredPercent: -20 });
  }
  return { runtime: after.runtime, scenario: after.scenario, identical, beforeMs: before.median, afterMs: after.median, medianChangePercent,
    beforeP95Ms: before.p95Median, afterP95Ms: after.p95Median, p95ChangePercent,
    beforeCounters: before.runs[0].counters, afterCounters: after.runs[0].counters, phases, memory: after.runs.map(r => r.memory), budget: after.budget };
});
require(engine.length === 18, 'Incomplete engine runtime/scenario matrix');
const renderer = reports.afterClient.results.map(after => {
  const before = reports.beforeClient.results.find(r => r.profile === after.profile && r.scenario === after.scenario);
  require(before && JSON.stringify(before.viewport) === JSON.stringify(after.viewport) && before.runs[0].totalEntities === after.runs[0].totalEntities, 'Changed renderer population/viewport');
  const cpuChangePercent = change(before.medianCpuP95, after.medianCpuP95);
  const scansPerFrame = { before: median(before.runs.map(r => r.scans / r.frames)), after: median(after.runs.map(r => r.scans / r.frames)) };
  const target = after.scenario === 'visible-text-drops' ? -20 : 5;
  check(`${after.profile}/${after.scenario} CPU p95`, cpuChangePercent <= target, { changePercent: cpuChangePercent, requiredPercent: target });
  check(`${after.profile}/${after.scenario} F02 scans`, scansPerFrame.after <= scansPerFrame.before / 2, { ...scansPerFrame });
  return { profile: after.profile, scenario: after.scenario, viewport: after.viewport, beforeCpuP95Ms: before.medianCpuP95, afterCpuP95Ms: after.medianCpuP95, cpuChangePercent,
    beforeRafP95Ms: before.medianRafP95, afterRafP95Ms: after.medianRafP95, scansPerFrame,
    sortsPerFrame: { before: median(before.runs.map(r => r.sorts / r.frames)), after: median(after.runs.map(r => r.sorts / r.frames)) },
    canvasOpsPerFrame: { before: median(before.runs.map(r => r.canvasOps / r.frames)), after: median(after.runs.map(r => r.canvasOps / r.frames)) },
    visible: after.runs.map(r => r.resources?.frame.visible), drawn: after.runs.map(r => r.resources?.frame.drawn), resources: after.runs.map(r => r.resources?.resources) };
});
require(renderer.length === 12, 'Incomplete renderer profile/scenario matrix');
const integration = reports.afterIntegration.results.map(after => {
  const before = reports.beforeIntegration.results.find(r => r.profile === after.profile && r.scenario === after.scenario);
  require(before, 'Missing real-chain baseline');
  const metric = (report, key) => median(report.runs.map(r => r[key].p95));
  const roundTripP95Ms = { before: metric(before, 'stepRoundTripMs'), after: metric(after, 'stepRoundTripMs') };
  const decodeApplyP95Ms = { before: metric(before, 'decodeApplyMs'), after: metric(after, 'decodeApplyMs') };
  const messagesPerStep = { before: median(before.runs.map(r => r.messagesPerCompletedStep)), after: median(after.runs.map(r => r.messagesPerCompletedStep)) };
  check(`${after.profile}/F07 round-trip p95`, roundTripP95Ms.after <= roundTripP95Ms.before, roundTripP95Ms);
  check(`${after.profile}/F07 requests per step`, messagesPerStep.after === 1 && messagesPerStep.after < messagesPerStep.before, messagesPerStep);
  return { profile: after.profile, roundTripP95Ms, decodeApplyP95Ms, messagesPerStep,
    pendingMax: Math.max(...after.runs.map(r => r.pendingMax)), inputToWorkerP95Ms: metric(after, 'inputToWorkerMs'), workerToMainP95Ms: metric(after, 'workerToMainMs'),
    workerThinkP95Ms: metric(after, 'workerThinkMs'), lifecycle: after.runs.every(r => r.lifecycle.equipment && r.lifecycle.died && r.lifecycle.respawned) };
});
check('F05 30-minute renderer resource soak', reports.soak.durationMs >= 1800000 && reports.soak.created >= 10000 && reports.soak.frames >= 54000 && reports.soak.final.visuals.drops === 0, { durationMs: reports.soak.durationMs, created: reports.soak.created });
check('P05 ordered active index dense/churn', reports.activeIndex.results.every(r => r.met), {});
const report = { schema: 2, kind: 'm4-performance-comparison', generatedAt: new Date().toISOString(),
  evidence: Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await artifact(file)]))),
  machine: reports.afterEngine.machine, beforeSource: reports.beforeEngine.evidence.source, afterSource: reports.afterEngine.evidence.source,
  engine, renderer, integration, soak: { durationMs: reports.soak.durationMs, created: reports.soak.created, frames: reports.soak.frames, final: reports.soak.final, samples: reports.soak.samples.length },
  checks, passed: checks.every(c => c.met), limitations: ['Synthetic rendering and live Worker measurements are separate workloads.', 'Bitmap costs are estimates; heap and WASM high-water marks do not measure total process RSS.', 'Relative sub-millisecond CPU differences and maxima are sensitive to scheduling noise.'] };
await atomicJson(option('--out', 'reports/performance/m4-comparison.json'), report);
console.log(JSON.stringify({ passed: report.passed, checks: checks.length, failed: checks.filter(c => !c.met), integration }, null, 2));
if (!report.passed) process.exitCode = 1;
