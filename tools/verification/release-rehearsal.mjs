import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sameEvidence, sha256 } from '../verification-evidence.mjs';

const checks = ['correctWorker', 'livePackets', 'trustedInput', 'renderedTransition', 'noErrors'];
const timestamp = value => {
  const result = Date.parse(value);
  assert.ok(Number.isFinite(result), 'invalid rehearsal timestamp');
  return result;
};

export function verifyRehearsalTimestamp(value, { lower, upper }) {
  const observedAt = timestamp(value);
  assert.ok(timestamp(lower.generatedAt) <= observedAt && observedAt <= timestamp(upper.generatedAt),
    'rehearsal observation outside operation interval');
}

/** Check the actual move/restore observations, including their bytes and source
 * identity. A passing boolean or a partial check object is insufficient. */
export async function verifyArchiveRehearsal({ historyRoot, evidence, deliverySha256, intervals, reference, referenceSha256 }) {
  assert.match(referenceSha256, /^[a-f0-9]{64}$/, 'missing/invalid reference manifest hash');
  assert.deepEqual(intervals.map(x => x.prefix), ['03-moved', '05-restored']);
  const verified = [];
  for (const { prefix, lower, upper } of intervals) {
    const read = name => fs.readFile(path.join(historyRoot, `${prefix}-${name}`));
    const smoke = JSON.parse(await read('entrypoint.json'));
    assert.equal(smoke.passed, true);
    assert.equal(smoke.stable, true);
    assert.ok(sameEvidence(smoke.evidence, evidence), 'rehearsal source identity differs');
    assert.equal(smoke.target?.root, 'dist-next');
    assert.equal(smoke.target?.sha256, deliverySha256, 'rehearsal delivery identity differs');
    verifyRehearsalTimestamp(smoke.generatedAt, { lower, upper });
    assert.deepEqual(smoke.entries?.map(x => x.name), ['default', 'reference']);
    for (const entry of smoke.entries) {
      assert.equal(entry.passed, true);
      for (const name of checks) assert.equal(entry.checks?.[name], true, `missing/failed ${name}`);
      assert.ok(Object.values(entry.checks).every(value => value === true));
      assert.equal(entry.screenshotSha256, sha256(await read(`${entry.name}.png`)), 'rehearsal screenshot differs');
    }
    const referenceLog = await read('reference.log');
    const execution = JSON.parse(await read('reference-execution.json'));
    assert.equal(execution.schema, 1, 'invalid reference execution schema');
    assert.equal(execution.phase, prefix, 'reference execution phase differs');
    verifyRehearsalTimestamp(execution.startedAt, { lower, upper });
    verifyRehearsalTimestamp(execution.finishedAt, { lower, upper });
    assert.ok(timestamp(execution.startedAt) <= timestamp(execution.finishedAt),
      'reference execution timestamps are reversed');
    assert.equal(execution.exitCode, 0, 'reference execution did not exit successfully');
    assert.equal(execution.signal, null, 'reference execution signal must be null');
    assert.equal(execution.manifestSha256, referenceSha256, 'reference execution manifest hash differs');
    assert.equal(execution.logSha256, sha256(referenceLog), 'reference execution log hash differs');
    assert.ok(sameEvidence(execution.evidence, evidence), 'reference execution source identity differs');
    assert.equal(execution.deliverySha256, deliverySha256, 'reference execution delivery identity differs');
    const referenceReport = JSON.parse(referenceLog);
    assert.equal(referenceReport.passed, true, 'rehearsal reference check failed');
    assert.deepEqual(referenceReport.issues, []);
    assert.deepEqual(referenceReport.trees?.slice().sort(), Object.keys(reference.trees).sort());
    assert.equal(referenceReport.keyFiles, Object.keys(reference.keyFiles).length);
    for (const key of ['recovered', 'remaining'])
      assert.equal(referenceReport.totals?.[key], reference.build.totals[key]);
    if (reference.build.totals.total !== undefined)
      assert.equal(referenceReport.totals.recovered + referenceReport.totals.remaining, reference.build.totals.total);
    verified.push({ prefix, sourceIdentityVerified: true, completeChecksVerified: true,
      screenshotsVerified: true, referenceVerified: true, referenceExecutionVerified: true });
  }
  return verified;
}
