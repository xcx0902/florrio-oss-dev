#!/usr/bin/env node
/** Verify delivery integrity, its source identity, and compiled input freshness. */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, fileEntries, sha256 } from './lib/build-inputs.mjs';
import { validateBuild } from './lib/build-validation.mjs';
import { sourceIdentity } from './verification-evidence.mjs';

const args = process.argv.slice(2);
if (args.includes('--root') && (!args[args.indexOf('--root') + 1] || args[args.indexOf('--root') + 1].startsWith('--')))
  throw new Error('--root requires a directory');
const root = path.resolve('.');
const output = path.resolve(args.includes('--root') ? args[args.indexOf('--root') + 1] : 'dist-next');
const issues = [];
let manifest;
try { manifest = JSON.parse(await readFile(path.join(output, 'build-manifest.json'), 'utf8')); }
catch { throw new Error('Delivery manifest missing or invalid; run npm run build:dist-next'); }
if (manifest.schema !== 2 || !manifest.inputs) issues.push('old manifest has no source identity; rebuild delivery');
if (manifest.inputs?.sha256 !== (await sourceIdentity(root)).sha256) issues.push('delivery source identity is stale');
const validation = await validateBuild(root);
issues.push(...validation.issues);
const actualFiles = (await listFiles(output)).filter(file => file !== 'build-manifest.json');
const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
if (manifest.artifactsSha256 !== sha256(JSON.stringify(artifacts))) issues.push('manifest artifact identity mismatch');
if (!validation.engineBuild || manifest.engineBuild?.sha256 !== validation.engineBuild.sha256
  || manifest.engineBuild?.inputs?.sha256 !== validation.engineBuild.inputs?.sha256
  || manifest.engineBuild?.compilerVersion !== validation.engineBuild.compilerVersion) issues.push('delivery compiler identity differs from compiled engine');
if (new Set(artifacts.map(entry => entry.path)).size !== artifacts.length) issues.push('duplicate manifest paths');
const expectedFiles = artifacts.map(entry => entry.path).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) issues.push('delivery inventory differs from manifest (missing/extra files)');
for (const entry of artifacts) {
  if (typeof entry.path !== 'string' || path.isAbsolute(entry.path) || entry.path.split('/').includes('..') || entry.path.includes('\\')) { issues.push('unsafe manifest path'); continue; }
  if (/^(archive|source|reports?|tests?|upstream|web)\//.test(entry.path)) { issues.push(`forbidden ${entry.path}`); continue; }
  try {
    const [actual] = await fileEntries(output, [entry.path]);
    if (actual.sha256 !== entry.sha256 || actual.bytes !== entry.bytes) issues.push(`delivery hash mismatch ${entry.path}`);
    const [compiled] = await fileEntries(path.join(root, 'client/public'), [entry.path]);
    if (compiled.sha256 !== entry.sha256 || compiled.bytes !== entry.bytes) issues.push(`delivery differs from compiled client ${entry.path}`);
  } catch { issues.push(`missing delivery/compiled file ${entry.path}`); }
}
const compiledFiles = (await listFiles(path.join(root, 'client/public'))).filter(file => !file.endsWith('.build.json'));
if (JSON.stringify(compiledFiles) !== JSON.stringify(expectedFiles)) issues.push('delivery inventory differs from compiled client');
for (const required of ['server.wasm', 'index.html', 'main.js', 'server-worker.js']) if (!actualFiles.includes(required)) issues.push(`missing ${required}`);
if (manifest.totals?.files !== artifacts.length || manifest.totals?.bytes !== artifacts.reduce((sum, entry) => sum + entry.bytes, 0)) issues.push('manifest totals mismatch');
console.log(JSON.stringify({ passed: issues.length === 0, files: artifacts.length, totals: manifest.totals, issues }, null, 2));
if (issues.length) process.exitCode = 1;
