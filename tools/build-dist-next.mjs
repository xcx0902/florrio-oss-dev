#!/usr/bin/env node
/** Build the delivery tree from the current C++ and TypeScript sources. */
import { cp, mkdir, rm, writeFile, rename, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { listFiles, fileEntries, sha256 } from './lib/build-inputs.mjs';
import { validateBuild } from './lib/build-validation.mjs';
import { sourceIdentity } from './verification-evidence.mjs';
import { assertVerificationOwner } from './verification/io.mjs';

const root = path.resolve('.');
const args = process.argv.slice(2);
if (args.includes('--out') && (!args[args.indexOf('--out') + 1] || args[args.indexOf('--out') + 1].startsWith('--')))
  throw new Error('--out requires a directory');
const output = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : 'dist-next');
const source = path.join(root, 'client/public');
if (output === root || output === source || source.startsWith(output + path.sep)
  || ['archive', 'engine', 'client', 'schema', 'tests', 'reports', 'tools', 'build', 'docs', 'source', 'reference', 'web', 'upstream', 'legacy', 'dist', 'dist-readable', 'dist-reference', '.git', '.github', 'node_modules'].some(folder => output === path.join(root, folder) || output.startsWith(path.join(root, folder) + path.sep)))
  throw new Error(`Unsafe delivery output: ${output}`);
await assertVerificationOwner(root);
await mkdir(path.dirname(output), { recursive: true });
const lock = await open(output + '.lock', 'wx');
const staging = `${output}.stage-${randomUUID()}`;
try {
const before = await sourceIdentity(root);
if (!args.includes('--skip-build')) {
  for (const script of ['tools/build-engine-wasm.mjs', 'node_modules/typescript/bin/tsc']) {
    const result = spawnSync(process.execPath, [script, ...(script.endsWith('/tsc') ? ['-p', 'client/tsconfig.json'] : [])], { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`Delivery compiler failed: ${result.error?.message ?? result.status ?? result.signal}`);
  }
}
const validation = await validateBuild(root);
if (validation.issues.length) throw new Error(`Delivery build is stale:\n${validation.issues.join('\n')}`);
const currentInputs = await sourceIdentity(root);
const inputs = { sha256: currentInputs.sha256, fileCount: Object.keys(currentInputs.files).length };
if (before.sha256 !== inputs.sha256) throw new Error('Sources changed during delivery build; rerun after edits finish');
await mkdir(staging, { recursive: true });
await cp(source, staging, { recursive: true, filter: name => !name.endsWith('.DS_Store') && !name.endsWith('.build.json') });
const entries = await fileEntries(staging, await listFiles(staging));
for (const file of ['server.wasm', 'index.html', 'main.js', 'server-worker.js'])
  if (!entries.some(entry => entry.path === file)) throw new Error(`Missing required compiled file ${file}`);
if (entries.some(entry => /^(archive|source|reports?|tests?|upstream|web)\//.test(entry.path))) throw new Error('Archived or non-product assets in delivery tree');
const manifest = {
  schema: 2, name: 'legacy-florr-web-next', generatedAt: new Date().toISOString(), runId: process.env.VERIFY_RUN_ID ?? null,
  source: 'C++20 + TypeScript, validated against source before packaging',
  inputs,
  engineBuild: { sha256: validation.engineBuild.sha256, inputs: validation.engineBuild.inputs,
    compilerVersion: validation.engineBuild.compilerVersion },
  artifacts: entries,
  artifactsSha256: sha256(JSON.stringify(entries)),
  totals: { files: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) },
  excludes: ['archive/', 'build/', 'client/src/', 'docs/', 'engine/', 'node_modules/', 'reports/', 'schema/', 'tests/', 'tools/'],
};
await writeFile(path.join(staging, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
if (inputs.sha256 !== (await sourceIdentity(root)).sha256) {
  await rm(staging, { recursive: true, force: true });
  throw new Error('Sources changed during packaging; previous delivery retained');
}
const sourceFiles = (await listFiles(source)).filter(file => !file.endsWith('.build.json'));
const copied = await fileEntries(source, sourceFiles);
if (sha256(JSON.stringify(copied)) !== manifest.artifactsSha256) {
  await rm(staging, { recursive: true, force: true });
  throw new Error('Compiled assets changed during packaging; previous delivery retained');
}
const previous = `${output}.previous-${randomUUID()}`;
const hadPrevious = await (await import('node:fs/promises')).stat(output).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
if (hadPrevious) await rename(output, previous);
try { await rename(staging, output); }
catch (error) { if (hadPrevious) await rename(previous, output); throw error; }
if (hadPrevious) await rm(previous, { recursive: true, force: true });
console.log(JSON.stringify({ output: path.relative(root, output), ...manifest.totals,
  sourceIdentity: inputs, serverWasm: entries.find(entry => entry.path === 'server.wasm') }, null, 2));
} finally {
  await rm(staging, { recursive: true, force: true });
  await lock.close(); await rm(output + '.lock', { force: true });
}
