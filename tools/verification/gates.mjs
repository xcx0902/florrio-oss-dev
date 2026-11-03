/** The sole ordered acceptance definition, consumed by execution and reporting. */
export const gates = Object.freeze([
  { name: 'format', npm: 'format:check' },
  { name: 'lint', npm: 'lint' },
  { name: 'refactor rules', npm: 'check:refactor' },
  { name: 'schema', npm: 'schema:check' },
  { name: 'native build', npm: 'build:engine' },
  { name: 'native CTest', script: 'tools/run-tests.mjs', args: ['engine'], suite: 'engine' },
  { name: 'server build', npm: 'build:server', reports: ['reports/multiplayer/native-build.json'] },
  {
    name: 'server native CTest',
    script: 'tools/run-tests.mjs',
    args: ['server-native'],
    suite: 'server-native',
    reports: ['reports/multiplayer/native-ctest.json'],
  },
  { name: 'wasm build', npm: 'build:engine:wasm' },
  { name: 'client build', npm: 'build:client' },
  { name: 'package', script: 'tools/build-dist-next.mjs', args: ['--skip-build'] },
  { name: 'unit', script: 'tools/run-tests.mjs', args: ['unit'], suite: 'unit' },
  { name: 'tools', script: 'tools/run-tests.mjs', args: ['tools'], suite: 'tools' },
  {
    name: 'client unit',
    script: 'tools/run-tests.mjs',
    args: ['client-unit'],
    suite: 'client-unit',
  },
  {
    name: 'cross-end integration',
    script: 'tools/run-tests.mjs',
    args: ['integration'],
    suite: 'integration',
  },
  { name: 'ABI consistency', script: 'tools/verify-abi.mjs' },
  { name: 'delivery integrity', script: 'tools/verify-dist-next.mjs' },
  {
    name: 'browser scenarios and performance',
    timeoutMs: 20 * 60 * 1000,
    script: 'tools/browser-products.mjs',
    reports: [
      'reports/browser-tests.tap',
      'reports/entrypoint-smoke.json',
      'reports/perf.json',
      'reports/multiplayer/m06/browser-pvp.json',
      'reports/multiplayer/m07/pvp-on.json',
      'reports/multiplayer/m07/pvp-off.json',
      'reports/multiplayer/m07/latency-matrix.json',
      'reports/multiplayer/jitter-fix/smoothness.json',
    ],
    suite: 'client-integration',
  },
  {
    name: 'engine performance',
    script: 'tools/perf-engine.mjs',
    reports: ['reports/perf-engine.json'],
  },
  {
    name: 'integration performance',
    script: 'tools/perf-integration.mjs',
    reports: ['reports/perf-integration.json'],
  },
]);
export function gatesPassed(steps) {
  return (
    steps?.length === gates.length &&
    gates.every(
      (gate, index) =>
        steps[index].name === gate.name &&
        steps[index].exitCode === 0 &&
        steps[index].finishedAt &&
        /^[a-f0-9]{64}$/.test(steps[index].logSha256 ?? ''),
    )
  );
}

/**
 * M08 multiplayer gate profile. It is intentionally ordered after a passing
 * offline ledger: the offline profile owns shared native/CTest/unit evidence,
 * while this profile owns the online-only delivery, real dual-browser cases,
 * native package, deployment smoke and capacity evidence.
 */
export const multiplayerGates = Object.freeze([
  {
    name: 'multiplayer build',
    npm: 'build:multiplayer',
    reports: ['dist-multiplayer/build-manifest.json'],
  },
  {
    name: 'multiplayer delivery integrity',
    npm: 'verify:multiplayer',
    reports: ['dist-multiplayer/build-manifest.json'],
  },
  {
    name: 'multiplayer browser acceptance',
    npm: 'test:multiplayer:browser',
    timeoutMs: 20 * 60 * 1000,
    reports: ['reports/multiplayer/browser-pvp.json'],
  },
  {
    name: 'multiplayer native package',
    script: 'tools/pack-native.mjs',
    args: ['--skip-build'],
    timeoutMs: 15 * 60 * 1000,
  },
  {
    name: 'multiplayer deployment smoke',
    npm: 'test:multiplayer:deploy',
    timeoutMs: 10 * 60 * 1000,
    reports: ['reports/multiplayer/deploy-smoke.json'],
  },
  {
    name: 'multiplayer capacity and soak',
    script: 'tools/verify-multiplayer-performance.mjs',
    timeoutMs: 10 * 60 * 1000,
    reports: [
      'reports/multiplayer/performance-summary.json',
      'reports/multiplayer/capacity/summary.json',
    ],
  },
]);
export function multiplayerGatesPassed(steps) {
  return (
    steps?.length === multiplayerGates.length &&
    multiplayerGates.every(
      (gate, index) =>
        steps[index].name === gate.name &&
        steps[index].exitCode === 0 &&
        steps[index].finishedAt &&
        /^[a-f0-9]{64}$/.test(steps[index].logSha256 ?? ''),
    )
  );
}
