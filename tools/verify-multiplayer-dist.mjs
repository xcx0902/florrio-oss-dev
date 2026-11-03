#!/usr/bin/env node
/** Verify one online-only delivery tree against its manifest and native binary. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileEntries, listFiles, sha256 } from './lib/build-inputs.mjs';
import { validateMultiplayerGraph } from './lib/delivery.mjs';
import { sourceIdentity } from './verification-evidence.mjs';

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  if (!args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return args[index + 1];
};
const root = path.resolve('.');
const tree = path.resolve(value('--root') ?? 'dist-multiplayer');
const server = path.resolve(value('--server') ?? 'build/native/server/florr_server');
const manifestBytes = await readFile(path.join(tree, 'build-manifest.json'));
const manifest = JSON.parse(manifestBytes);
const issues = [];
if (manifest.schema !== 2 || manifest.profile !== 'multiplayer') {
  issues.push('manifest is not a multiplayer profile');
}
const files = (await listFiles(tree)).filter((name) => name !== 'build-manifest.json');
const issuesGraph = await validateMultiplayerGraph(tree, files);
issues.push(...issuesGraph);
const actual = await fileEntries(tree, files);
const expected = manifest.client?.files ?? [];
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  issues.push('delivery file inventory or hashes differ from manifest');
}
if (manifest.client?.sha256 !== sha256(JSON.stringify(expected))) {
  issues.push('client artifact aggregate hash differs');
}
const compiled = await readFile('build/client/main-online.js').catch(() => null);
if (!compiled) {
  issues.push('missing build/client/main-online.js');
} else if (sha256(compiled) !== (actual.find((entry) => entry.path === 'main.js')?.sha256 ?? '')) {
  issues.push('main.js is not the compiled online entry');
}
let currentSource = null;
try {
  currentSource = await sourceIdentity(root);
} catch {
  /* source identity is checked when available */
}
if (currentSource && manifest.source?.sha256 !== currentSource.sha256) {
  issues.push('delivery source identity is stale');
}
const serverBytes = await readFile(server).catch(() => null);
if (!serverBytes) {
  issues.push(`missing server binary ${server}`);
} else {
  if (sha256(serverBytes) !== manifest.server?.sha256) {
    issues.push('server binary hash differs from manifest');
  }
  if (serverBytes.length !== manifest.server?.bytes) {
    issues.push('server binary size differs from manifest');
  }
  const probe = spawnSync(server, ['--version'], { encoding: 'utf8' });
  const version = probe.status === 0 ? probe.stdout.trim().replace(/^florr_server\s+/, '') : '';
  if (probe.status !== 0 || version !== manifest.server?.version) {
    issues.push('server binary version differs from manifest');
  }
}
const protocol = await import(new URL('../build/client/schema/multiplayer.js', import.meta.url));
if (
  manifest.protocol?.version !== protocol.PROTOCOL_VERSION ||
  manifest.protocol?.catalogHash !== protocol.CATALOG_HASH
) {
  issues.push('protocol version or catalog hash differs from the generated client schema');
}
const result = {
  passed: issues.length === 0,
  profile: manifest.profile,
  files: actual.length,
  bytes: actual.reduce((sum, entry) => sum + entry.bytes, 0),
  clientSha256: manifest.client?.sha256 ?? null,
  server: manifest.server ?? null,
  protocol: manifest.protocol ?? null,
  issues,
};
console.log(JSON.stringify(result, null, 2));
if (!result.passed) {
  process.exitCode = 1;
}
