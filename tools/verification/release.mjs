/** Validate completed evidence, without inheriting success from older reports. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { evidence, sameEvidence, sha256, treeIdentity } from '../verification-evidence.mjs';
import { gatesPassed } from './gates.mjs';
export async function releaseEvidence(root = process.cwd()) {
  const report = JSON.parse(await readFile(path.join(root, 'reports/current-verification.json'), 'utf8'));
  if (report.schema !== 5 || !report.passed || !report.stable || !report.finishedAt || !gatesPassed(report.steps)) throw new Error('Release requires a completed, passed current verification ledger');
  const file = path.join(root, 'reports/runs', report.runId, 'run.json');
  const ledger = await readFile(file);
  if (report.ledgerSha256 !== sha256(ledger)) throw new Error('Verification ledger hash differs');
  const immutable = JSON.parse(ledger);
  const { ledgerSha256, generatedAt, status, ...published } = report;
  if (JSON.stringify(immutable) !== JSON.stringify(published)) throw new Error('Published verification differs from immutable run');
  if (!sameEvidence(report.evidence, await evidence(root))) throw new Error('Verification inputs changed; rerun npm run test:all');
  const manifestBytes = await readFile(path.join(root, 'dist-next/build-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.runId !== report.runId || report.delivery.runId !== report.runId || report.delivery.sha256 !== sha256(manifestBytes)
    || report.delivery.treeSha256 !== (await treeIdentity(root, ['dist-next'])).sha256) throw new Error('Delivery differs from the verified run');
  for (const step of report.steps) {
    if (step.runId !== report.runId || step.deliveryIdentity !== report.delivery.treeSha256) throw new Error(`Gate identity differs: ${step.name}`);
    const expectedPrefix = `reports/runs/${report.runId}/`;
    if (typeof step.log !== 'string' || !step.log.startsWith(expectedPrefix) || step.log.includes('..')) throw new Error('Invalid gate log path');
    if (sha256(await readFile(path.join(root, step.log))) !== step.logSha256) throw new Error(`Gate log changed: ${step.name}`);
    for (const entry of step.reports) {
      if (!entry.path.startsWith('reports/') || entry.path.includes('..')) throw new Error('Invalid gate report path');
      if (sha256(await readFile(path.join(root, entry.path))) !== entry.sha256) throw new Error(`Gate report changed: ${entry.path}`);
    }
  }
  return { report, manifest };
}
