#!/usr/bin/env node
/** Publishable M08 bundle: offline ledger + multiplayer ledger + native package. */
import { mkdir, mkdtemp, readFile, writeFile, cp, rename, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { releaseEvidence, multiplayerReleaseEvidence } from './verification/release.mjs';
import { sha256 } from './lib/identity.mjs';

const root = path.resolve('.');
const offline = await releaseEvidence();
const multiplayer = await multiplayerReleaseEvidence();
const packageDir = path.resolve(multiplayer.report.package.path);
const packageManifest = JSON.parse(await readFile(path.join(packageDir, 'release-manifest.json'), 'utf8'));
const source12 = multiplayer.report.source.sha256.slice(0, 12);
const name = `florrio-multiplayer-${packageManifest.version}-${packageManifest.target}-${source12}-${multiplayer.report.runId}`;
await mkdir('release', { recursive: true });
const scratch = await mkdtemp(path.join(os.tmpdir(), 'florr-m08-'));
try {
  const bundle = path.join(scratch, name);
  await cp(packageDir, bundle, { recursive: true });
  const release = {
    schema: 1, name: 'florrio-multiplayer', version: packageManifest.version, target: packageManifest.target,
    generatedAt: new Date().toISOString(), source: multiplayer.report.source,
    protocol: multiplayer.manifest.protocol, versions: multiplayer.manifest.versions,
    package: { files: packageManifest.files.length, serverSha256: packageManifest.server.sha256, client: packageManifest.client },
    verification: {
      offline: { runId: offline.report.runId, ledgerSha256: offline.report.ledgerSha256 },
      multiplayer: { runId: multiplayer.report.runId, ledgerSha256: multiplayer.report.ledgerSha256,
        browserCases: 12, capacityRuns: 3, profile: 'all' },
    },
    deployment: { target: packageManifest.target, startup: packageManifest.startup, rollback: packageManifest.rollback },
  };
  const json = JSON.stringify(release, null, 2) + '\n';
  await writeFile(path.join(bundle, 'PUBLISH-MANIFEST.json'), json);
  const archiveName = `${name}.tar.gz`;
  const archive = path.join(scratch, archiveName);
  const tar = spawnSync('tar', ['-czf', archive, '-C', scratch, name], { encoding: 'utf8' });
  if (tar.status !== 0) throw new Error(tar.stderr || 'tar failed');
  const destination = path.resolve('release', name);
  await rm(destination, { recursive: true, force: true });
  await rename(bundle, destination);
  const archivePath = path.resolve('release', archiveName);
  await cp(archive, archivePath);
  await writeFile(path.resolve('release', `${name}.SHA256SUMS`), `${sha256(await readFile(archivePath))}  ${archiveName}\n${sha256(Buffer.from(json))}  ${name}/PUBLISH-MANIFEST.json\n`);
  console.log(JSON.stringify({ passed: true, directory: destination, archive: archivePath, version: release.version,
    target: release.target, multiplayerRun: multiplayer.report.runId, offlineRun: offline.report.runId }, null, 2));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
