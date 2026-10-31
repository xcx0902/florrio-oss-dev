/** The sole ordered acceptance definition, consumed by execution and reporting. */
export const gates = Object.freeze([
  { name: 'schema', npm: 'schema:check' },
  { name: 'native build', npm: 'build:engine' },
  { name: 'native CTest', script: 'tools/run-tests.mjs', args: ['engine'], suite: 'engine' },
  { name: 'wasm build', npm: 'build:engine:wasm' },
  { name: 'client build', npm: 'build:client' },
  { name: 'package', script: 'tools/build-dist-next.mjs', args: ['--skip-build'] },
  { name: 'unit', script: 'tools/run-tests.mjs', args: ['unit'], suite: 'unit' },
  { name: 'tools', script: 'tools/run-tests.mjs', args: ['tools'], suite: 'tools' },
  { name: 'client unit', script: 'tools/run-tests.mjs', args: ['client-unit'], suite: 'client-unit' },
  { name: 'cross-end integration', script: 'tools/run-tests.mjs', args: ['integration'], suite: 'integration' },
  { name: 'ABI consistency', script: 'tools/verify-abi.mjs' },
  { name: 'delivery integrity', script: 'tools/verify-dist-next.mjs' },
  { name: 'browser scenarios and performance', script: 'tools/browser-products.mjs', reports: ['reports/browser-tests.tap', 'reports/entrypoint-smoke.json', 'reports/perf.json'], suite: 'client-integration' },
  { name: 'engine performance', script: 'tools/perf-engine.mjs', reports: ['reports/perf-engine.json'] },
  { name: 'integration performance', script: 'tools/perf-integration.mjs', reports: ['reports/perf-integration.json'] },
]);
export function gatesPassed(steps) {
  return steps?.length === gates.length && gates.every((gate, index) => steps[index].name === gate.name && steps[index].exitCode === 0 && steps[index].finishedAt && /^[a-f0-9]{64}$/.test(steps[index].logSha256 ?? ''));
}
