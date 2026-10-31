#!/usr/bin/env node
/**
 * Build the C++20 engine to a standalone wasm module.
 *
 * Emscripten's Homebrew cache is outside the writable workspace, so the build
 * uses a local cache (`.emcache/`, gitignored). The resulting module exports
 * the C ABI in engine/include/engine/abi.h plus malloc/free and memory.
 */
import path from 'node:path';
import { engineInputs } from './lib/build-inputs.mjs';
import { mkdir, readFile, open, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { atomicJson, assertVerificationOwner } from './verification/io.mjs';

const root = path.resolve('.');
await assertVerificationOwner(root);
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  if (position >= 0 && (!args[position + 1] || args[position + 1].startsWith('--'))) throw new Error(`${name} requires a value`);
  return position < 0 ? fallback : args[position + 1];
};
const output = path.resolve(option('--output', 'build/wasm/server.wasm'));
const cache = path.resolve(option('--cache', '.emcache'));
const compiler = process.env.EMXX || 'em++';
const expectedVersion = (await readFile(path.join(root, '.emscripten-version'), 'utf8')).trim();
const versionProbe = spawnSync(compiler, ['--version'], { encoding: 'utf8' });
if (versionProbe.status !== 0) throw new Error(`Cannot run ${compiler}: ${versionProbe.error?.message ?? versionProbe.stderr}`);
const compilerVersion = versionProbe.stdout.split('\n')[0];
const actualVersion = compilerVersion.match(/\b(\d+\.\d+\.\d+)(?:-git)?(?:\s|$)/)?.[1];
if (actualVersion !== expectedVersion) throw new Error(`Emscripten ${expectedVersion} is required by .emscripten-version; got ${compilerVersion}`);
const inputs = await engineInputs(root);
await mkdir(cache, { recursive: true });
await mkdir(path.dirname(output), { recursive: true });
const staging = path.join(path.dirname(output), `.engine-${randomUUID()}.wasm`);
const lock = await open(output + '.lock', 'wx');
try {

const buildDirectory = path.join(root, 'build/wasm/cmake');
for (const [command, parameters] of [
  [process.env.EMCMAKE || 'emcmake', ['cmake', '-S', 'engine', '-B', buildDirectory, '-DCMAKE_BUILD_TYPE=Release', ...(args.includes('--clean') ? ['--fresh'] : [])]],
  ['cmake', ['--build', buildDirectory, '--target', 'engine_wasm', '-j', '6']],
]) {
  const result = spawnSync(command, parameters, { cwd: root, stdio: 'inherit', env: { ...process.env, EM_CACHE: cache, CXX: compiler } });
  if (result.status !== 0) throw new Error(`engine wasm compiler failed: ${result.error?.message ?? result.status ?? result.signal}`);
}
await (await import('node:fs/promises')).copyFile(path.join(buildDirectory, 'server.wasm'), staging);
const after = await engineInputs(root);
if (inputs.sha256 !== after.sha256) throw new Error('C++ inputs changed during compilation; old wasm was retained');
const bytes = await readFile(staging);
const module = new WebAssembly.Module(bytes);
const imports = WebAssembly.Module.imports(module);
const exports = WebAssembly.Module.exports(module);
const report = {
  runId: process.env.VERIFY_RUN_ID ?? null,
  output: path.relative(root, output),
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  imports,
  exports: exports.map(entry => entry.name),
  emcc: compiler,
  compilerVersion,
  inputs,
  generatedAt: new Date().toISOString(),
  cache: path.relative(root, cache),
};
await rename(staging, output);
await atomicJson(output + '.build.json', report);
console.log(JSON.stringify(report, null, 2));
if (!existsSync(output)) process.exitCode = 1;
} finally {
  await rm(staging, { force: true });
  await lock.close(); await rm(output + '.lock', { force: true });
}
