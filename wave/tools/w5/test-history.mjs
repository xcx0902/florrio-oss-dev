import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const waveRoot = fileURLToPath(new URL('../../', import.meta.url));
const projectRoot = path.resolve(waveRoot, '..');
const { values } = parseArgs({
  options: {
    stage: { type: 'string', default: 'W5' },
    'native-dir': {
      type: 'string',
      default: process.env.WAVE_NATIVE_DIR ?? path.join(projectRoot, 'build/wave/native'),
    },
    'output-dir': { type: 'string', default: path.join(projectRoot, 'reports/wave/W5') },
    snapshot: {
      type: 'string',
      default: process.env.WAVE_SNAPSHOT ?? path.join(projectRoot, 'wave-reference/20221030'),
    },
  },
});
assert.equal(values.stage, 'W5', 'The frozen scenario history gate supports --stage W5');
const output = path.resolve(values['output-dir']);
const native = path.resolve(values['native-dir']);
const binary = path.join(
  native,
  process.platform === 'win32' ? 'wave_w5_scenarios.exe' : 'wave_w5_scenarios',
);
await mkdir(output, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
  schemaVersion: 1,
  stage: 'W5',
  scope: ['ant-hole', 'standalone-pvp'],
  status: 'failed',
  generatedAt: new Date().toISOString(),
  node: process.version,
  commands: [],
  evidence: [],
  rules: [],
  limitations: [
    'Passing this gate establishes agreement with adopted rules, not historical proof of reconstruction values.',
    'Browser compatibility is reported separately by test:wire --stage W5.',
    'The remaining W5 biome and wave-curve calibration is outside this scenario gate.',
  ],
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  report.commands.push({
    command,
    args,
    exitCode: result.status,
    signal: result.signal,
    ...(result.error ? { error: result.error.message } : {}),
  });
  return result;
}

function getParameter(parameters, selector) {
  return selector.split('.').reduce((value, key) => {
    assert.ok(value && Object.hasOwn(value, key), `Unknown adopted parameter ${selector}`);
    return value[key];
  }, parameters);
}

function passedCases(text) {
  const passed = new Set();
  for (const line of text.split(/\r?\n/)) {
    // CTest -V prefixes the test's stdout with its numeric test identifier.
    const value = line.replace(/^\d+:\s*/, '').trim();
    const match = /^PASS\s+(W5-[A-Z0-9-]+)$/.exec(value);
    if (match) {
      passed.add(match[1]);
    }
    if (value.startsWith('{')) {
      try {
        const record = JSON.parse(value);
        for (const id of record.passedAcceptanceIds ?? []) {
          assert.equal(typeof id, 'string', 'Acceptance IDs must be strings');
          passed.add(id);
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          throw error;
        }
      }
    }
  }
  return passed;
}

try {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  report.revision =
    process.env.WAVE_REVISION ?? (revision.status === 0 ? revision.stdout.trim() : null);
  const diff = spawnSync('git', ['diff', '--binary', '--', 'wave'], {
    cwd: projectRoot,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (diff.status === 0) {
    report.workspaceDiffSha256 = hash(diff.stdout);
  }

  const adoptedBytes = await readFile(path.join(waveRoot, 'data/rules/20221030/w5-scenarios.json'));
  const adopted = JSON.parse(adoptedBytes);
  report.rulesVersion = adopted.version;
  report.rulesSha256 = hash(adoptedBytes);
  report.cutoffUtc = adopted.cutoffUtc;
  assert.equal(adopted.schemaVersion, 1);
  assert.ok(adopted.rules.length > 0, 'Frozen scenario rule table must not be empty');
  const sources = new Map();
  for (const source of adopted.sources) {
    assert.ok(!sources.has(source.id), `Duplicate evidence ID ${source.id}`);
    sources.set(source.id, source);
    if (source.timestamp) {
      assert.ok(
        Date.parse(source.timestamp) <= Date.parse(adopted.cutoffUtc),
        `${source.id} is after the cutoff`,
      );
    }
    const result = {
      id: source.id,
      type: source.type,
      independenceGroup: source.independenceGroup,
    };
    if (source.path && source.sha256) {
      const actualPath =
        source.path === 'wave-reference/20221030/client.wasm'
          ? path.join(path.resolve(values.snapshot), 'client.wasm')
          : path.resolve(projectRoot, source.path);
      const bytes = await readFile(actualPath);
      result.path = source.path;
      result.sha256 = hash(bytes);
      assert.equal(
        result.sha256,
        source.sha256,
        `Historical evidence identity changed: ${source.id}`,
      );
      result.verified = true;
    } else {
      assert.ok(source.url || source.path, `Evidence ${source.id} has no locator`);
      result.verified = false;
      result.reason =
        source.type === 'retrospective-history'
          ? 'Retrospective shape observation; no frozen local response, not primary proof.'
          : 'Design reference, not a frozen historical artifact.';
    }
    report.evidence.push(result);
  }
  const ruleIds = new Set();
  for (const rule of adopted.rules) {
    assert.ok(!ruleIds.has(rule.id), `Duplicate rule ID ${rule.id}`);
    ruleIds.add(rule.id);
    assert.equal(rule.targetDate, adopted.cutoffUtc, `Wrong target date: ${rule.id}`);
    assert.ok(
      ['已证实', '重建', '未确认'].includes(rule.confidence),
      `Unstated confidence: ${rule.id}`,
    );
    assert.ok(rule.notes?.trim(), `Rule has no evidence boundary: ${rule.id}`);
    assert.ok(
      rule.sources.length && rule.sources.every((id) => sources.has(id)),
      `Missing source: ${rule.id}`,
    );
    assert.ok(
      rule.acceptanceIds.length && rule.acceptanceIds.every((id) => /^W5-[A-Z0-9-]+$/.test(id)),
      `Missing acceptance IDs: ${rule.id}`,
    );
    assert.deepEqual(
      getParameter(adopted.parameters, rule.parameter),
      rule.currentValue,
      `Adopted value differs from rule table: ${rule.id}`,
    );
  }
  report.rules = adopted.rules.map((rule) => ({ ...rule, passed: false }));

  report.binary = { path: binary, sha256: hash(await readFile(binary)) };
  const parameters = run(binary, ['--parameters']);
  await writeFile(path.join(output, 'compiled-parameters.json'), parameters.stdout ?? '');
  assert.equal(
    parameters.status,
    0,
    `Cannot inspect compiled W5 parameters: ${parameters.stderr || parameters.error?.message}`,
  );
  const compiled = JSON.parse(parameters.stdout);
  assert.deepEqual(
    compiled.parameters,
    adopted.parameters,
    'Compiled scenario metadata differs from frozen rule table',
  );
  const ant = adopted.parameters.antHole;
  const pvp = adopted.parameters.pvp;
  const actualExpected = {
    backgrounds: adopted.parameters.backgrounds,
    pvpMobPool: pvp.mobPool,
    pvpWaveEquivalent: pvp.waveEquivalent,
    antHoleRadius: ant.radius,
    antHoleDurationSeconds: ant.durationSeconds,
    pauseWhenAllInside: ant.pauseMainWave === 'all-living-connected-players-inside',
    pvpSpawnIntervalSeconds: pvp.spawnIntervalSeconds,
    pvpMobLimit: pvp.mobLimit,
    pvpMinimumLevel: pvp.minimumLevel,
    basicThresholds: pvp.basicThresholds.map(({ score }) => score),
    gardenPopulation: ['baby', 'worker', 'soldier', 'queen'].map(
      (kind) => ant.gardenPopulation[kind],
    ),
    firePopulation: ant.firePopulation,
    diggerPercent: ant.diggerChance * 100,
    pvpBaseRadius: pvp.arenaScaling.baseRadius,
    pvpAdditionalRadius: pvp.arenaScaling.additionalRadius,
    pvpArenaResizeSpeed: pvp.arenaScaling.resizeSpeedPerSecond,
  };
  for (const [name, expected] of Object.entries(actualExpected)) {
    assert.deepEqual(
      compiled.actual?.[name],
      expected,
      `Actual compiled parameter differs: ${name}`,
    );
  }
  report.compiledParameters = compiled;

  const tests = run('ctest', [
    '--test-dir',
    native,
    '--no-tests=error',
    '--output-on-failure',
    '-V',
    '-L',
    '^w5$',
  ]);
  await writeFile(
    path.join(output, 'history-ctest.log'),
    `${tests.stdout ?? ''}${tests.stderr ?? ''}`,
  );
  assert.equal(
    tests.status,
    0,
    `W5 native history cases failed; see ${path.join(output, 'history-ctest.log')}`,
  );
  const coverage = passedCases(tests.stdout ?? '');
  assert.ok(coverage.size > 0, 'W5 tests did not report any passedAcceptanceIds');
  report.passedAcceptanceIds = [...coverage].sort();
  report.rules = adopted.rules.map((rule) => ({
    id: rule.id,
    parameter: rule.parameter,
    currentValue: rule.currentValue,
    confidence: rule.confidence,
    acceptanceIds: rule.acceptanceIds,
    passed: rule.acceptanceIds.every((id) => coverage.has(id)),
    sources: rule.sources,
    notes: rule.notes,
    ...(rule.candidate === undefined ? {} : { candidate: rule.candidate }),
  }));
  const uncovered = report.rules.filter(({ passed }) => !passed);
  assert.deepEqual(
    uncovered.map(({ id }) => id),
    [],
    'Frozen W5 rules lack passed native acceptance cases',
  );
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  report.unconfirmed = report.rules.filter(({ confidence }) => confidence !== '已证实');
  report.confidenceCounts = Object.fromEntries(
    ['已证实', '重建', '未确认'].map((confidence) => [
      confidence,
      report.rules.filter((rule) => rule.confidence === confidence).length,
    ]),
  );
  await writeFile(path.join(output, 'history.json'), `${JSON.stringify(report, null, 2)}\n`);
}

console.log(
  `W5 history ${report.status}: ${report.rules.filter(({ passed }) => passed).length}/${report.rules.length} rules; ${path.join(output, 'history.json')}`,
);
if (report.error) {
  console.error(report.error);
}
