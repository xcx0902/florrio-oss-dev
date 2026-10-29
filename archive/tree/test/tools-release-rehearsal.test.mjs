import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sha256 } from '../tools/verification-evidence.mjs';
import { verifyArchiveRehearsal, verifyRehearsalTimestamp } from '../tools/verification/release-rehearsal.mjs';

async function fixture(t) {
  const historyRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'florr-release-evidence-'));
  t.after(() => fs.rm(historyRoot, { recursive: true, force: true }));
  const identity = char => ({ sha256: char.repeat(64), fileCount: 1 });
  const evidence = { source: identity('a'), client: identity('b'), oracle: identity('c') };
  const deliverySha256 = 'd'.repeat(64);
  const reference = { trees: { web: {}, dist: {} }, keyFiles: { 'web/client.js': {}, 'web/client.wasm': {} },
    build: { totals: { recovered: 3850, remaining: 1129, total: 4979 } } };
  const referenceSha256 = sha256(Buffer.from(JSON.stringify(reference, null, 2) + '\n'));
  const time = second => new Date(Date.UTC(2026, 9, 25) + second * 1000).toISOString();
  const intervals = [{ prefix: '03-moved', lower: { generatedAt: time(1) }, upper: { generatedAt: time(3) } },
    { prefix: '05-restored', lower: { generatedAt: time(3) }, upper: { generatedAt: time(5) } }];
  const write = (name, value) => fs.writeFile(path.join(historyRoot, name), JSON.stringify(value));
  const smoke = at => ({ passed: true, stable: true, evidence, generatedAt: time(at),
    target: { root: 'dist-next', sha256: deliverySha256 }, entries: ['default', 'reference'].map(name => ({
      name, passed: true, checks: { correctWorker: true, livePackets: true, trustedInput: true,
        renderedTransition: true, noErrors: true }, screenshotSha256: sha256(Buffer.from(name)) })) });
  const referenceReport = { passed: true, issues: [], trees: ['web', 'dist'], keyFiles: 2,
    totals: { recovered: 3850, remaining: 1129 } };
  for (const [index, { prefix }] of intervals.entries()) {
    await write(`${prefix}-entrypoint.json`, smoke(index === 0 ? 2 : 4));
    const referenceLog = Buffer.from(JSON.stringify(referenceReport, null, 2) + '\n');
    await fs.writeFile(path.join(historyRoot, `${prefix}-reference.log`), referenceLog);
    await write(`${prefix}-reference-execution.json`, { schema: 1, phase: prefix,
      startedAt: time(index === 0 ? 2.1 : 4.1), finishedAt: time(index === 0 ? 2.2 : 4.2),
      exitCode: 0, signal: null, manifestSha256: referenceSha256, logSha256: sha256(referenceLog),
      evidence, deliverySha256 });
    for (const name of ['default', 'reference']) await fs.writeFile(path.join(historyRoot, `${prefix}-${name}.png`), name);
  }
  const patch = async (name, mutate, rebindLog = false) => {
    const value = JSON.parse(await fs.readFile(path.join(historyRoot, name)));
    mutate(value); await write(name, value);
    if (rebindLog) {
      const receiptName = name.replace(/-reference\.log$/, '-reference-execution.json');
      const receipt = JSON.parse(await fs.readFile(path.join(historyRoot, receiptName)));
      receipt.logSha256 = sha256(await fs.readFile(path.join(historyRoot, name)));
      await write(receiptName, receipt);
    }
  };
  return { options: { historyRoot, evidence, deliverySha256, intervals, reference, referenceSha256 }, patch };
}

test('release rehearsal binds both real entrypoints, screenshots and frozen reference checks', async t => {
  const f = await fixture(t);
  const verified = await verifyArchiveRehearsal(f.options);
  assert.equal(verified.length, 2);
  assert.ok(verified.every(row => row.sourceIdentityVerified && row.completeChecksVerified && row.screenshotsVerified
    && row.referenceVerified && row.referenceExecutionVerified));
  assert.notEqual(f.options.referenceSha256, sha256(JSON.stringify(f.options.reference)));
});

for (const [name, file, mutate, message, rebindLog] of [
  ['missing required check', '03-moved-entrypoint.json', x => { delete x.entries[0].checks.trustedInput; }, /trustedInput/],
  ['different source', '03-moved-entrypoint.json', x => { x.evidence.source.sha256 = 'e'.repeat(64); }, /source identity/],
  ['different delivery', '05-restored-entrypoint.json', x => { x.target.sha256 = 'e'.repeat(64); }, /delivery identity/],
  ['failed reference', '03-moved-reference.log', x => { x.passed = false; }, /reference check failed/, true],
  ['partial reference coverage', '05-restored-reference.log', x => { x.trees = []; }, /AssertionError/, true],
  ['different reference totals', '05-restored-reference.log', x => { x.totals.remaining = 0; }, /AssertionError/, true],
  ['stale observation', '03-moved-entrypoint.json', x => { x.generatedAt = '2026-10-24T00:00:00Z'; }, /AssertionError/],
  ['missing reference entrypoint', '05-restored-entrypoint.json', x => { x.entries.pop(); }, /AssertionError/],
]) test(`release rehearsal rejects ${name}`, async t => {
  const f = await fixture(t); await f.patch(file, mutate, rebindLog);
  await assert.rejects(verifyArchiveRehearsal(f.options), message);
});

test('release rehearsal rejects a replaced screenshot', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.options.historyRoot, '05-restored-default.png'), 'replaced');
  await assert.rejects(verifyArchiveRehearsal(f.options), /screenshot differs/);
});

for (const prefix of ['03-moved', '05-restored']) {
  test(`release rehearsal rejects missing ${prefix} reference execution receipt`, async t => {
    const f = await fixture(t);
    await fs.rm(path.join(f.options.historyRoot, `${prefix}-reference-execution.json`));
    await assert.rejects(verifyArchiveRehearsal(f.options), { code: 'ENOENT' });
  });

  for (const [name, mutate, message] of [
    ['wrong schema', x => { x.schema = 2; }, /execution schema/],
    ['wrong phase', x => { x.phase = prefix === '03-moved' ? '05-restored' : '03-moved'; }, /execution phase/],
    ['stale start', x => { x.startedAt = '2026-10-24T00:00:00Z'; }, /outside operation interval/],
    ['late finish', x => { x.finishedAt = '2026-10-26T00:00:00Z'; }, /outside operation interval/],
    ['invalid time', x => { x.startedAt = 'invalid'; }, /invalid rehearsal timestamp/],
    ['missing finish', x => { delete x.finishedAt; }, /invalid rehearsal timestamp/],
    ['reversed times', x => { [x.startedAt, x.finishedAt] = [x.finishedAt, x.startedAt]; }, /timestamps are reversed/],
    ['failed exit', x => { x.exitCode = 1; }, /did not exit successfully/],
    ['signal', x => { x.signal = 'SIGTERM'; }, /signal must be null/],
    ['missing signal', x => { delete x.signal; }, /signal must be null/],
    ['wrong manifest bytes', x => { x.manifestSha256 = 'e'.repeat(64); }, /manifest hash differs/],
    ['wrong log bytes', x => { x.logSha256 = 'e'.repeat(64); }, /log hash differs/],
    ['wrong delivery', x => { x.deliverySha256 = 'e'.repeat(64); }, /delivery identity differs/],
    ...['source', 'client', 'oracle'].map(key => [`wrong ${key} version`, x => {
      x.evidence[key].sha256 = 'e'.repeat(64);
    }, /source identity differs/]),
  ]) test(`release rehearsal rejects ${prefix} reference receipt with ${name}`, async t => {
    const f = await fixture(t);
    await f.patch(`${prefix}-reference-execution.json`, mutate);
    await assert.rejects(verifyArchiveRehearsal(f.options), message);
  });

  test(`release rehearsal binds ${prefix} reference log formatting bytes`, async t => {
    const f = await fixture(t);
    await fs.appendFile(path.join(f.options.historyRoot, `${prefix}-reference.log`), '\n');
    await assert.rejects(verifyArchiveRehearsal(f.options), /log hash differs/);
  });
}

test('release rehearsal requires the original reference manifest byte hash option', async t => {
  const f = await fixture(t);
  delete f.options.referenceSha256;
  await assert.rejects(verifyArchiveRehearsal(f.options), /reference manifest hash/);
});

test('restored-path observation accepts both restore-to-copy interval boundaries', () => {
  const lower = { generatedAt: '2026-10-25T00:00:03.000Z' };
  const upper = { generatedAt: '2026-10-25T00:00:05.000Z' };
  for (const generatedAt of [lower.generatedAt, '2026-10-25T00:00:04.000Z', upper.generatedAt])
    assert.doesNotThrow(() => verifyRehearsalTimestamp(generatedAt, { lower, upper }));
});

for (const generatedAt of ['2026-10-24T00:00:00Z', '2026-10-26T00:00:00Z', 'invalid', undefined]) {
  test(`restored-path observation rejects out-of-phase or invalid time ${generatedAt}`, () => {
    assert.throws(() => verifyRehearsalTimestamp(generatedAt, {
      lower: { generatedAt: '2026-10-25T00:00:03.000Z' },
      upper: { generatedAt: '2026-10-25T00:00:05.000Z' },
    }), /outside operation interval|invalid rehearsal timestamp/);
  });
}
