import assert from 'node:assert/strict';

export function checkEvidence({ sources, rules, videos, scenarios, manifest, wasm }) {
  assert.equal(sources.cutoffUtc, manifest.cutoffUtc);
  assert.equal(rules.cutoffUtc, manifest.cutoffUtc);
  assert.equal(scenarios.rulesVersion, rules.version);
  const sourceIds = new Set(sources.sources.map(({ id }) => id));
  assert.equal(sourceIds.size, sources.sources.length);
  const ruleIds = new Set(rules.rules.map(({ id }) => id));
  assert.equal(ruleIds.size, rules.rules.length);
  const scenariosById = new Map(scenarios.fixtures.map((entry) => [entry.id, entry]));
  assert.equal(scenariosById.size, scenarios.fixtures.length);
  for (const rule of rules.rules) {
    assert.ok(rule.unit && rule.dateWindow && rule.acceptanceIds.length && rule.sources.length);
    assert.ok(['已证实', '重建', '估计', '未确认'].includes(rule.confidence), rule.id);
    assert.ok(Object.hasOwn(rule, 'currentValue'), rule.id);
    for (const source of rule.sources) {
      assert.ok(sourceIds.has(source.id) && source.locator, `${rule.id}: invalid source`);
    }
  }
  for (const scenario of scenarios.fixtures) {
    for (const id of scenario.ruleIds) {
      assert.ok(ruleIds.has(id), `${scenario.id}: missing ${id}`);
    }
  }
  for (const sample of videos.samples) {
    assert.ok(sourceIds.has(sample.source), sample.frame);
    assert.ok(sample.timeSeconds >= 0 && sample.hudWave > 0, sample.frame);
    assert.match(sample.sha256, /^[0-9a-f]{64}$/);
  }
  const changelog = sources.sources.find(({ id }) => id === 'log.client');
  for (const [id, { fileOffset }] of Object.entries(changelog.entries)) {
    const end = wasm.indexOf(0, fileOffset);
    assert.ok(end > fileOffset && end - fileOffset < 1000, id);
    assert.match(wasm.toString('utf8', fileOffset, end), /^[ -~]+$/, id);
  }
  const schedule = rules.rules.find(
    ({ id }) => id === 'wave.spawn.gardenEarlySchedule',
  ).currentValue;
  assert.deepEqual(
    schedule.map(({ wave }) => wave),
    [1, 2, 3],
  );
  for (const { deadlineSeconds, batches } of schedule) {
    assert.equal(batches[0].atSeconds, 0);
    assert.ok(
      batches.every(
        ({ atSeconds, count }, i) =>
          count > 0 && atSeconds < deadlineSeconds && (!i || atSeconds > batches[i - 1].atSeconds),
      ),
    );
  }
  return {
    version: rules.version,
    sources: sourceIds.size,
    rules: ruleIds.size,
    scenarios: scenariosById.size,
    videoSamples: videos.samples.length,
  };
}
