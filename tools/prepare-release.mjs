#!/usr/bin/env node
/** Prepare a local verified product archive; no remote publication. */
import { mkdir, mkdtemp, readFile, writeFile, cp, rename, rm, open } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { releaseEvidence } from './verification/release.mjs';
import { sha256 } from './lib/identity.mjs';
import { assertVerificationOwner } from './verification/io.mjs';
await assertVerificationOwner();
const { report, manifest } = await releaseEvidence();
const verified = spawnSync(process.execPath, ['tools/verify-dist-next.mjs'], { stdio: 'inherit' });
if (verified.status !== 0) throw new Error('Delivery integrity failed');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(pkg.version)) throw new Error('Unsafe product version');
const name = `florrio-${pkg.version}-${report.evidence.source.sha256.slice(0, 12)}`;
await mkdir('release', { recursive: true });
const lock = await open('release/prepare.lock', 'wx');
const folder = await mkdtemp(path.resolve('release/.stage-'));
const scratch = await mkdtemp(path.join(os.tmpdir(), 'florr-release-'));
try {
  const target = path.join(scratch, name);
  await cp('dist-next', target, { recursive: true });
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const transport = JSON.parse(await readFile('schema/transport.json', 'utf8'));
  const release = { schema: 1, name: pkg.name, version: pkg.version, generatedAt: new Date().toISOString(), runId: report.runId,
    revision: revision.status === 0 ? revision.stdout.trim() : null, source: report.evidence.source, verification: report.evidence.verification,
    ledgerSha256: report.ledgerSha256, compiler: manifest.engineBuild.compilerVersion, features: { standalone: true, diagnostics: 'product-cheat', tickMilliseconds: 50, sparse: true, dense: true },
    versions: { protocol: transport.protocolVersion, storage: 'florr-menu-v1' }, delivery: report.delivery, files: manifest.artifacts };
  const json = JSON.stringify(release, null, 2) + '\n';
  await writeFile(path.join(target, 'release-manifest.json'), json);
  await writeFile(path.join(folder, 'release-manifest.json'), json);
  const archive = path.join(folder, name + '.tar.gz');
  const packed = spawnSync('tar', ['-czf', archive, '-C', scratch, name], { encoding: 'utf8' });
  if (packed.status !== 0) throw new Error(packed.stderr || 'Cannot create release archive');
  await writeFile(path.join(folder, 'SHA256SUMS'), `${sha256(await readFile(archive))}  ${name}.tar.gz\n${sha256(Buffer.from(json))}  release-manifest.json\n`);
  // Recheck everything after tar; edited inputs or changed evidence cannot publish.
  await releaseEvidence();
  const destination = path.resolve('release', `${name}-${report.runId}`);
  await rename(folder, destination);
  console.log(`Local release prepared: ${destination}`);
} finally { await rm(folder, { recursive: true, force: true }); await rm(scratch, { recursive: true, force: true }); await lock.close(); await rm('release/prepare.lock', { force: true }); }
