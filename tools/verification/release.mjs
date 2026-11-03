/** Validate completed evidence, without inheriting success from older reports. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { evidence, sameEvidence, sha256, treeIdentity } from '../verification-evidence.mjs';
import { gatesPassed, multiplayerGatesPassed } from './gates.mjs';
export async function releaseEvidence(root = process.cwd()) {
  const report = JSON.parse(
    await readFile(path.join(root, 'reports/current-verification.json'), 'utf8'),
  );
  if (
    report.schema !== 5 ||
    !report.passed ||
    !report.stable ||
    !report.finishedAt ||
    !gatesPassed(report.steps)
  ) {
    throw new Error('Release requires a completed, passed current verification ledger');
  }
  const file = path.join(root, 'reports/runs', report.runId, 'run.json');
  const ledger = await readFile(file);
  if (report.ledgerSha256 !== sha256(ledger)) {
    throw new Error('Verification ledger hash differs');
  }
  const immutable = JSON.parse(ledger);
  const { ledgerSha256, generatedAt, status, ...published } = report;
  if (JSON.stringify(immutable) !== JSON.stringify(published)) {
    throw new Error('Published verification differs from immutable run');
  }
  if (!sameEvidence(report.evidence, await evidence(root))) {
    throw new Error('Verification inputs changed; rerun npm run test:all');
  }
  const manifestBytes = await readFile(path.join(root, 'dist-next/build-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (
    manifest.runId !== report.runId ||
    report.delivery.runId !== report.runId ||
    report.delivery.sha256 !== sha256(manifestBytes) ||
    report.delivery.treeSha256 !== (await treeIdentity(root, ['dist-next'])).sha256
  ) {
    throw new Error('Delivery differs from the verified run');
  }
  for (const step of report.steps) {
    if (step.runId !== report.runId || step.deliveryIdentity !== report.delivery.treeSha256) {
      throw new Error(`Gate identity differs: ${step.name}`);
    }
    const expectedPrefix = `reports/runs/${report.runId}/`;
    if (
      typeof step.log !== 'string' ||
      !step.log.startsWith(expectedPrefix) ||
      step.log.includes('..')
    ) {
      throw new Error('Invalid gate log path');
    }
    if (sha256(await readFile(path.join(root, step.log))) !== step.logSha256) {
      throw new Error(`Gate log changed: ${step.name}`);
    }
    for (const entry of step.reports) {
      if (!entry.path.startsWith('reports/') || entry.path.includes('..')) {
        throw new Error('Invalid gate report path');
      }
      if (sha256(await readFile(path.join(root, entry.path))) !== entry.sha256) {
        throw new Error(`Gate report changed: ${entry.path}`);
      }
    }
  }
  return { report, manifest };
}

/** Validate the M08 multiplayer ledger and its native package against current inputs. */
export async function multiplayerReleaseEvidence(root = process.cwd()) {
  const report = JSON.parse(
    await readFile(path.join(root, 'reports/multiplayer/current-verification.json'), 'utf8'),
  );
  if (
    report.schema !== 1 ||
    report.profile !== 'all' ||
    !report.passed ||
    !report.stable ||
    !report.finishedAt ||
    !multiplayerGatesPassed(report.steps)
  ) {
    throw new Error('Release requires a completed, passed all-profile multiplayer ledger');
  }
  const file = path.join(root, 'reports/multiplayer/runs', report.runId, 'run.json');
  const ledger = await readFile(file);
  if (report.ledgerSha256 !== sha256(ledger)) {
    throw new Error('Multiplayer ledger hash differs');
  }
  const immutable = JSON.parse(ledger);
  const { ledgerSha256, generatedAt, status, ...published } = report;
  if (JSON.stringify(immutable) !== JSON.stringify(published)) {
    throw new Error('Published multiplayer verification differs from immutable run');
  }
  if (report.source.sha256 !== (await evidence(root)).source.sha256) {
    throw new Error('Source changed; rerun the multiplayer profile');
  }
  const manifestBytes = await readFile(path.join(root, 'dist-multiplayer/build-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (
    report.delivery.treeSha256 !== (await treeIdentity(root, ['dist-multiplayer'])).sha256 ||
    report.delivery.manifestSha256 !== sha256(manifestBytes) ||
    report.delivery.server.sha256 !== manifest.server.sha256
  ) {
    throw new Error('Multiplayer delivery differs from the verified run');
  }
  if (
    !report.package?.path ||
    report.package.manifestSha256 !==
      sha256(await readFile(path.join(root, report.package.path, 'release-manifest.json')))
  ) {
    throw new Error('Native package differs from the verified run');
  }
  const offline = JSON.parse(
    await readFile(path.join(root, 'reports/current-verification.json'), 'utf8'),
  );
  if (!offline.passed || offline.inputs?.source?.sha256 !== report.source.sha256) {
    throw new Error('Offline ledger is not source-identical');
  }
  for (const step of report.steps) {
    if (step.runId !== report.runId) {
      throw new Error(`Multiplayer gate identity differs: ${step.name}`);
    }
    if (
      typeof step.log !== 'string' ||
      !step.log.startsWith(`reports/multiplayer/runs/${report.runId}/`) ||
      step.log.includes('..')
    ) {
      throw new Error('Invalid multiplayer gate log path');
    }
    if (sha256(await readFile(path.join(root, step.log))) !== step.logSha256) {
      throw new Error(`Multiplayer gate log changed: ${step.name}`);
    }
    for (const entry of step.reports) {
      const allowed =
        entry.path.startsWith('reports/') || entry.path === 'dist-multiplayer/build-manifest.json';
      if (!allowed || entry.path.includes('..')) {
        throw new Error('Invalid multiplayer report path');
      }
      if (sha256(await readFile(path.join(root, entry.path))) !== entry.sha256) {
        throw new Error(`Multiplayer gate report changed: ${entry.path}`);
      }
    }
  }
  return { report, manifest, offline };
}
