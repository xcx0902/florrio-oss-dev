/** Delivery verification negative cases using a tiny isolated compiler fixture. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, chmod, lstat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { engineInputs, sha256 } from '../../tools/lib/build-inputs.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'florr-delivery-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ['client/src', 'client/public', 'engine/src', 'engine/include', 'tools/lib', 'tools/verification'])
    await mkdir(path.join(root, folder), { recursive: true });
  for (const file of ['.emscripten-version', 'engine/sources.cmake', 'tools/build-engine-wasm.mjs', 'tools/lib/build-inputs.mjs', 'tools/verification/io.mjs'])
    await cp(path.join(repo, file), path.join(root, file));
  const config = { compilerOptions: { target: 'ES2022', module: 'ES2022', lib: ['ES2022'],
    rootDir: 'src', outDir: 'public', declaration: true, sourceMap: true, types: [] }, include: ['src/**/*.ts'] };
  await writeFile(path.join(root, 'client/tsconfig.json'), JSON.stringify(config));
  await writeFile(path.join(root, 'client/src/main.ts'), "export const label = 'current';\n");
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.join(root, 'client'));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  assert.equal(program.emit().emitSkipped, false);
  await writeFile(path.join(root, 'client/public/index.html'), '<html>fixture</html>');
  await writeFile(path.join(root, 'client/public/server-worker.js'), '// fixture worker\n');
  // No game/compiler execution: a minimal valid wasm plus an explicit mock
  // compiler record isolates the packaging/verification contract under test.
  const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
  await writeFile(path.join(root, 'client/public/server.wasm'), wasm);
  await writeFile(path.join(root, 'client/public/server.wasm.build.json'), JSON.stringify({
    sha256: sha256(wasm), inputs: await engineInputs(root), compilerVersion: 'mock fixture compiler',
  }));
  return root;
}
const run = (root, script, args = []) => spawnSync(process.execPath, [path.join(repo, 'tools', script), ...args], { cwd: root, encoding: 'utf8' });

test('delivery packages validated compiler output and rejects extra/missing/corrupted files', async t => {
  const root = await fixture(t);
  const unsafe = run(root, 'build-dist-next.mjs', ['--skip-build', '--out', 'source']);
  assert.equal(unsafe.status, 1);
  assert.match(unsafe.stderr, /Unsafe delivery output/);
  let result = run(root, 'build-dist-next.mjs', ['--skip-build']);
  assert.equal(result.status, 0, result.stderr);
  result = run(root, 'verify-dist-next.mjs');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  await writeFile(path.join(root, 'dist-next/extra.js'), 'unexpected');
  result = run(root, 'verify-dist-next.mjs');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /inventory differs/);
  await rm(path.join(root, 'dist-next/extra.js'));
  await writeFile(path.join(root, 'dist-next/main.js'), 'corrupted');
  result = run(root, 'verify-dist-next.mjs');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /hash mismatch main.js/);
  await rm(path.join(root, 'dist-next/main.js'));
  result = run(root, 'verify-dist-next.mjs');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /missing delivery\/compiled file main.js/);
});

test('delivery refuses a stale source tree and refuses packaging uncompiled TypeScript', async t => {
  const root = await fixture(t);
  const built = run(root, 'build-dist-next.mjs', ['--skip-build']);
  assert.equal(built.status, 0, built.stderr);
  const original = await readFile(path.join(root, 'dist-next/build-manifest.json'), 'utf8');
  await writeFile(path.join(root, 'client/src/main.ts'), "export const label = 'changed';\n");
  const verified = run(root, 'verify-dist-next.mjs');
  assert.equal(verified.status, 1);
  assert.match(verified.stdout, /delivery source identity is stale/);
  assert.match(verified.stdout, /stale TypeScript output/);
  const repack = run(root, 'build-dist-next.mjs', ['--skip-build']);
  assert.equal(repack.status, 1);
  assert.match(repack.stderr, /stale TypeScript output/);
  assert.equal(await readFile(path.join(root, 'dist-next/build-manifest.json'), 'utf8'), original);
});

test('delivery refuses wasm whose compiler input record is stale', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'engine/src/new.cpp'), '// changed C++ source\n');
  const result = run(root, 'build-dist-next.mjs', ['--skip-build']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /wasm was compiled from different C\+\+ inputs/);
});

test('failed wasm compiler retains the last valid module and compiler record', async t => {
  const root = await fixture(t);
  const output = path.join(root, 'client/public/server.wasm');
  const before = await readFile(output), record = await readFile(output + '.build.json');
  const version = (await readFile(path.join(root, '.emscripten-version'), 'utf8')).trim();
  const compiler = path.join(root, 'failing-emxx.mjs');
  await writeFile(compiler, `#!/usr/bin/env node\nif (process.argv.includes('--version')) { console.log('emcc ${version}'); } else { process.exitCode = 7; }\n`);
  await chmod(compiler, 0o755);
  const failed = spawnSync(process.execPath, [path.join(repo, 'tools/build-engine-wasm.mjs')], {
    cwd: root, encoding: 'utf8', env: { ...process.env, EMXX: compiler },
  });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /engine wasm compiler failed/);
  assert.deepEqual(await readFile(output), before);
  assert.deepEqual(await readFile(output + '.build.json'), record);
  assert.equal(await lstat(output + '.lock').catch(() => null), null);
});

test('incomplete delivery retains the previous tree and cleans staging and locks', async t => {
  const root = await fixture(t);
  assert.equal(run(root, 'build-dist-next.mjs', ['--skip-build']).status, 0);
  const before = await readFile(path.join(root, 'dist-next/build-manifest.json'));
  await rm(path.join(root, 'client/public/index.html'));
  const result = run(root, 'build-dist-next.mjs', ['--skip-build']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required compiled file index.html/);
  assert.deepEqual(await readFile(path.join(root, 'dist-next/build-manifest.json')), before);
  assert.equal(await lstat(path.join(root, 'dist-next.lock')).catch(() => null), null);
  const { readdir } = await import('node:fs/promises');
  assert.equal((await readdir(root)).some(name => name.startsWith('dist-next.stage-')), false);
});

test('packaging refuses an active foreign acceptance owner before creating delivery files', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'reports'));
  await writeFile(path.join(root, 'reports/verification.lock'), '{"runId":"foreign","token":"foreign"}');
  const result = run(root, 'build-dist-next.mjs', ['--skip-build']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Another verification run/);
  assert.equal(await lstat(path.join(root, 'dist-next')).catch(() => null), null);
});
