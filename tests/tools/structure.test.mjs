import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildInputs, verificationInputs } from '../../tools/lib/identity.mjs';
import { releaseEvidence } from '../../tools/verification/release.mjs';
import { gates, gatesPassed } from '../../tools/verification/gates.mjs';
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'florr-structure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ['engine/src', 'archive', 'tests', 'reports', 'tools', 'client/src']) await mkdir(path.join(root, folder), { recursive: true });
  await writeFile(path.join(root, 'engine/src/live.cpp'), '// product');
  return root;
}
test('build identity excludes tests, archived oracles and reports; verification includes current tests', async t => {
  const root = await fixture(t), before = await buildInputs(root), verification = await verificationInputs(root);
  await writeFile(path.join(root, 'archive/oracle.wasm'), 'old bytes');
  await writeFile(path.join(root, 'reports/old.json'), 'old reports');
  await writeFile(path.join(root, 'tests/live.test.mjs'), 'test');
  assert.equal((await buildInputs(root)).sha256, before.sha256);
  assert.notEqual((await verificationInputs(root)).sha256, verification.sha256);
  await writeFile(path.join(root, 'engine/src/live.cpp'), '// changed product');
  assert.notEqual((await buildInputs(root)).sha256, before.sha256);
});
test('undeclared symbolic links in product input fail without following them', async t => {
  const root = await fixture(t); await symlink('../../archive', path.join(root, 'engine/src/link'));
  await assert.rejects(buildInputs(root), /symlink/);
});
test('release rejects uncompleted or inherited successful ledgers', async t => {
  const root = await fixture(t);
  for (const report of [{ passed: true }, { schema: 5, passed: true, stable: true, finishedAt: new Date().toISOString(), steps: [] }]) {
    await writeFile(path.join(root, 'reports/current-verification.json'), JSON.stringify(report));
    await assert.rejects(releaseEvidence(root), /completed, passed current verification/);
  }
});
test('one gate table rejects omitted, reordered and unhashed results', () => {
  const steps = gates.map(gate => ({ name: gate.name, exitCode: 0, finishedAt: 'now', logSha256: 'a'.repeat(64) }));
  assert.ok(gatesPassed(steps)); assert.equal(gatesPassed(steps.slice(1)), false);
  const swapped = [...steps]; [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  assert.equal(gatesPassed(swapped), false);
  assert.equal(gatesPassed(steps.map((step, i) => i === 3 ? { ...step, exitCode: 1 } : step)), false);
  assert.equal(gatesPassed(steps.map((step, i) => i === 3 ? { ...step, logSha256: 'abc' } : step)), false);
});
