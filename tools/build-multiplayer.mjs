#!/usr/bin/env node
/**
 * Build the online-only delivery tree. This profile has no Worker, WASM,
 * cheat panel or test API: its entry is compiled from main-online.ts and its
 * module graph is walked explicitly.
 */
import { cp, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileEntries, sha256 } from './lib/build-inputs.mjs';
import { multiplayerSources, validateMultiplayerGraph } from './lib/delivery.mjs';
import { sourceIdentity } from './verification-evidence.mjs';
import { assertVerificationOwner } from './verification/io.mjs';

const root = path.resolve('.');
const args = process.argv.slice(2);
const value = name => {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`);
  return args[index + 1];
};
const output = path.resolve(value('--out') ?? 'dist-multiplayer');
const serverBinary = path.resolve(value('--server') ?? 'build/native/server/florr_server');
const skipBuild = args.includes('--skip-build');
const unsafe = ['archive', 'engine', 'client', 'schema', 'tests', 'reports', 'tools', 'build', 'docs', 'source',
  'reference', 'web', 'upstream', 'legacy', 'dist', 'dist-next', 'dist-readable', 'dist-reference', '.git', '.github', 'node_modules'];
if (output === root || unsafe.some(folder => output === path.join(root, folder) || output.startsWith(path.join(root, folder) + path.sep)))
  throw new Error(`Unsafe multiplayer output: ${output}`);
await assertVerificationOwner(root);
if (!skipBuild) {
  for (const script of ['tools/generate.mjs', 'tools/build-server.mjs', 'tools/build-client.mjs']) {
    const result = spawnSync(process.execPath, [script, ...(script.endsWith('generate.mjs') ? ['--check'] : [])], { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`Multiplayer build step failed: ${script}`);
  }
}
const before = await sourceIdentity(root);
await mkdir(path.dirname(output), { recursive: true });
const lock = await open(output + '.lock', 'wx');
const staging = `${output}.stage-${randomUUID()}`;
try {
  const sources = await multiplayerSources(root);
  for (const [name, input] of sources) {
    await mkdir(path.dirname(path.join(staging, name)), { recursive: true });
    await cp(input, path.join(staging, name));
  }
  const files = [...sources.keys()].sort();
  const issues = await validateMultiplayerGraph(staging, files);
  if (issues.length) throw new Error(issues.join('\n'));
  const artifacts = await fileEntries(staging, files);
  const [versionProbe, protocol] = await Promise.all([
    Promise.resolve(spawnSync(serverBinary, ['--version'], { encoding: 'utf8' })),
    import(pathToFileURL(path.join(root, 'build/client/schema/multiplayer.js')).href),
  ]);
  if (versionProbe.status !== 0) throw new Error(`Cannot run server binary ${serverBinary}`);
  const version = versionProbe.stdout.trim().replace(/^florr_server\s+/, '');
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(version)) throw new Error('Invalid server version');
  const serverBytes = await readFile(serverBinary);
  const native = JSON.parse(await readFile('build/native/native-build.json', 'utf8'));
  const nativeSource = JSON.parse(await readFile('build/native/native-build.json', 'utf8')).source;
  const manifest = {
    schema: 2,
    profile: 'multiplayer',
    name: 'florrio',
    generatedAt: new Date().toISOString(),
    runId: process.env.VERIFY_RUN_ID ?? null,
    source: { schema: before.schema, sha256: before.sha256, fileCount: Object.keys(before.files).length },
    client: {
      entry: 'main.js',
      entrySource: 'client/src/main-online.ts',
      files: artifacts,
      sha256: sha256(JSON.stringify(artifacts)),
      totals: { files: artifacts.length, bytes: artifacts.reduce((sum, entry) => sum + entry.bytes, 0) },
    },
    server: {
      path: 'florr_server',
      bytes: serverBytes.length,
      sha256: sha256(serverBytes),
      version,
      nativeSource: nativeSource?.sha256 ?? null,
      nativeVerification: native.verification?.sha256 ?? null,
      toolchain: native.toolchain ?? null,
      dependencies: native.dependencies?.sha256 ?? null,
    },
    protocol: { version: protocol.PROTOCOL_VERSION, catalogHash: protocol.CATALOG_HASH },
    versions: { server: version, protocol: protocol.PROTOCOL_VERSION },
    excludes: ['server.wasm', 'server-worker.js', 'worker.js', 'local-worker.js', 'dev/', 'wasm/'],
  };
  await writeFile(path.join(staging, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (before.sha256 !== (await sourceIdentity(root)).sha256) throw new Error('Sources changed during multiplayer packaging');
  const previous = `${output}.previous-${randomUUID()}`;
  const exists = await stat(output).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  if (exists) await rename(output, previous);
  try { await rename(staging, output); } catch (error) { if (exists) await rename(previous, output); throw error; }
  if (exists) await rm(previous, { recursive: true, force: true });
  console.log(JSON.stringify({ output: path.relative(root, output), ...manifest.client.totals,
    server: { version, sha256: manifest.server.sha256, bytes: manifest.server.bytes },
    protocol: manifest.protocol, source: manifest.source }, null, 2));
} finally {
  await rm(staging, { recursive: true, force: true });
  await lock.close();
  await rm(output + '.lock', { force: true });
}
