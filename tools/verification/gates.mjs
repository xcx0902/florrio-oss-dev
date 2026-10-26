/** Shared acceptance definitions. Diagnostic and partial evidence never closes a gate. */
import { completeCoverage, scenarioNames } from '../verification-evidence.mjs';
import { reportStatus, rowPassed } from './report-status.mjs';
import { requiredProductionChecks } from '../parity/production-checks.mjs';
import { requiredOriginalClientChecks } from '../parity/original-client-checks.mjs';

export const reportPaths = {
  server: 'tests/parity/server/report.json', originalClient: 'tests/parity/golden/report.json',
  engineState: 'tests/parity/engine/report.json', engineSoak: 'tests/parity/engine-soak/report.json',
  next: 'tests/parity/next-ui-v2/report.json', originalEngine: 'tests/parity/original-engine/report.json',
  visual: 'tests/parity/visual/report.json', renderCommands: 'tests/parity/next-engine/command-diff.json',
  hornet: 'tests/parity/hornet/report.json', production: 'tests/parity/production/report.json',
  performance: 'reports/perf.json',
};
export const tapPaths = {
  javascript: 'reports/javascript-tests.tap', engine: 'reports/engine-tests.tap',
  client: 'reports/client-tests.tap', delivery: 'reports/delivery-tests.tap', browser: 'reports/browser-tests.tap',
};
export const requiredSteps = ['build:engine', 'build:engine:wasm', 'build:client', 'package',
  'browser version', 'reference', 'javascript', 'engine', 'native suites', 'client', 'catalogs', 'original parity', 'engine state',
  'engine soak', 'hornet', 'self consistency', 'visual', 'canvas', 'delivery integrity',
  'delivery smoke', 'entrypoint smoke', 'browser matrix', 'production', 'original + engine', 'performance'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function assessReport(name, value, current, { runId, delivery } = {}) {
  const assessment = reportStatus(value, current, { runId,
    expectedScenes: ['performance', 'hornet'].includes(name) ? null : scenarioNames,
    requireStrict: ['engineState', 'engineSoak', 'renderCommands'].includes(name) });
  if (!assessment.passed) return assessment;
  const issues = [];
  if (!Number.isFinite(Date.parse(value.generatedAt))) issues.push('missing report generation time');
  if (['engineState', 'engineSoak'].includes(name) && value.strictPassed !== true) issues.push('missing strict state result');
  if (name === 'engineSoak' && (!Number.isSafeInteger(value.soakTicks) || value.soakTicks < 1000
    || !value.scenarios.every(row => Number.isSafeInteger(row.ticks) && row.ticks >= 1000)))
    issues.push('soak coverage is shorter than 1000 ticks');
  if (name === 'visual' && (!finite(value.thresholds?.maxRatio) || value.thresholds.maxRatio > 0.001
    || value.thresholds.maxRatio < 0 || !finite(value.thresholds?.maxDelta) || value.thresholds.maxDelta > 8 || value.thresholds.maxDelta < 0
    || !value.scenarios.every(row => finite(row.ratio) && row.ratio >= 0 && row.ratio <= 0.001
      && finite(row.max) && row.max >= 0 && row.max <= 8))) issues.push('pixel acceptance thresholds/results are invalid');
  if (name === 'renderCommands' && (!finite(value.tolerance) || value.tolerance < 0 || value.tolerance > 1e-4
    || !value.scenarios.every(row => row.issueCount === 0 && row.expectedFrames === 3
      && row.actualFrames === 3 && row.comparedFrames === 3))) issues.push('strict three-frame command result/tolerance is invalid');
  if (name === 'hornet') {
    const names = ['callback-facing-0', `callback-facing-${Math.PI / 2}`, `callback-facing-${Math.PI}`,
      'callback-facing-2.150125503540039', 'gate-in-range', 'gate-retained-at-range',
      'gate-retained-out-of-range', 'gate-target-invalidated', 'gate-no-target', 'gate-cooldown',
      'gate-cooldown-one-ms-left', 'gate-cooldown-exact-expiry', 'lifetime', 'hit'];
    const fixtures = value.fixtures;
    if (!Array.isArray(fixtures) || new Set(fixtures.map(row => row?.name)).size !== fixtures.length
      || !names.every(name => fixtures.some(row => row?.name === name && rowPassed(row)))) issues.push('incomplete controlled Hornet coverage');
  }
  if (name === 'originalEngine' && (value.kind !== 'original-client-integration'
    || value.equivalence !== false || value.engineRoot !== 'dist-next'
    || !delivery?.wasmSha256 || value.engineWasmSha256 !== delivery.wasmSha256
    || !value.scenarios.every(row => row.probe?.found === true
      && requiredOriginalClientChecks(row.name ?? row.scenario).every(key => row.checks?.[key] === true))))
    issues.push('original-client integration requires world/controller binding, gameplay, lifecycle and the accepted engine wasm');
  if (name === 'production') {
    const profiles = ['desktop', 'retina', 'touch'];
    if (value.kind !== 'production-integration' || value.equivalence !== false || value.completeCoverage !== true
      || value.integrationPassed !== true || value.changedDuringRun !== false || value.stable !== true
      || !value.scenarios.every(row => Array.isArray(row.profiles) && completeCoverage(row.profiles.map(item => ({ ...item, name: item?.profile })), profiles)
        && row.profiles.every(item => rowPassed(item)
          && requiredProductionChecks(row.name ?? row.scenario, item.profile).every(key => item.checks?.[key] === true)
          && Array.isArray(item.errors) && item.errors.length === 0)))
      issues.push('production path requires eight scenes by three profiles with passing checks');
    if (value.root !== 'dist-next' || !delivery?.manifestSha256 || value.rootManifestSha256 !== delivery.manifestSha256
      || !delivery?.wasmSha256 || value.rootWasmSha256 !== delivery.wasmSha256
      || !delivery?.sha256 || value.target?.sha256 !== delivery.sha256 || value.sourceMatchesDelivery !== true)
      issues.push('production recording is not bound to the accepted dist-next manifest/wasm');
  }
  if (name === 'performance') {
    if (value.root !== 'dist-next' || !delivery?.manifestSha256 || value.rootManifestSha256 !== delivery.manifestSha256
      || value.rootWasmSha256 !== delivery.wasmSha256 || value.stable !== true
      || !delivery?.sha256 || value.target?.sha256 !== delivery.sha256 || value.sourceMatchesDelivery !== true)
      issues.push('performance did not measure stable accepted delivery bytes');
    if (!Number.isInteger(value.frames) || value.frames < 600 || !finite(value.fps) || value.fps < 55
      || !finite(value.frameMs?.p95) || value.frameMs.p95 < 0 || value.frameMs.p95 > 20
      || !finite(value.frameMs?.max) || value.frameMs.max < value.frameMs.p95 || value.frameMs.max > 50
      || value.entities !== 872 || !Number.isInteger(value.drawFrames) || value.drawFrames < value.frames
      || !Array.isArray(value.errors) || value.errors.length !== 0
      || !Array.isArray(value.intervals) || value.intervals.length !== value.frames
      || !value.intervals.every(value => finite(value) && value > 0 && value <= 50))
      issues.push('performance coverage/budget failed');
    else {
      const sorted = [...value.intervals].sort((a, b) => a - b);
      const mean = value.intervals.reduce((sum, ms) => sum + ms, 0) / value.frames;
      const p95 = sorted[Math.floor(value.frames * 0.95)], max = sorted.at(-1);
      if (1000 / mean < 55 || p95 > 20 || max > 50 || Math.abs(value.fps - 1000 / mean) > 1e-6
        || value.frameMs.p95 !== p95 || value.frameMs.max !== max)
        issues.push('performance summary does not match measured intervals');
    }
  }
  return issues.length ? { ...assessment, status: 'fail', passed: false, issues } : assessment;
}
