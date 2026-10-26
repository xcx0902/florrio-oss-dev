import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import wabtFactory from 'wabt';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wabt = await wabtFactory();

for (const name of ['client', 'sp_server']) {
  test(`${name}: every instruction and data byte rebuilds identically from source`, async () => {
    const input = `source/wasm/${name}.wat`;
    const source = await fs.readFile(path.join(root, input), 'utf8');
    const module = wabt.parseWat(input, source);
    try {
      module.resolveNames(); module.validate();
      const compiled = Buffer.from(module.toBinary({ canonicalize_lebs: true, write_debug_names: false }).buffer);
      const original = await fs.readFile(path.join(root, `web/${name}.wasm`));
      assert.deepEqual(compiled, original);
      assert.deepEqual(compiled, await fs.readFile(path.join(root, `upstream/${name}.wasm`)));
      const binaryModule = new WebAssembly.Module(compiled);
      const inventory = JSON.parse(await fs.readFile(path.join(root, `reports/wasm/${name}-functions.json`), 'utf8'));
      const functions = source.match(/^  \(func /gm) ?? [];
      const imports = WebAssembly.Module.imports(binaryModule);
      assert.equal(inventory.length, functions.length + imports.filter(i => i.kind === 'function').length);
    } finally { module.destroy(); }
  });
}

test('game builds in a clean directory containing no archived JS or WASM', async () => {
  const isolated = await fs.mkdtemp(path.join(os.tmpdir(), 'florr-source-build-'));
  try {
    await fs.mkdir(path.join(isolated, 'tools'));
    await fs.mkdir(path.join(isolated, 'reports/wasm'), { recursive: true });
    await fs.copyFile(path.join(root, 'tools/build.mjs'), path.join(isolated, 'tools/build.mjs'));
    await fs.cp(path.join(root, 'tools/lib'), path.join(isolated, 'tools/lib'), { recursive: true });
    await fs.copyFile(path.join(root, 'reports/wasm/manifest.json'), path.join(isolated, 'reports/wasm/manifest.json'));
    for (const name of ['client', 'sp_server']) await fs.copyFile(path.join(root, `reports/wasm/${name}-functions.json`), path.join(isolated, `reports/wasm/${name}-functions.json`));
    await fs.cp(path.join(root, 'source/assets'), path.join(isolated, 'source/assets'), { recursive: true });
    await fs.cp(path.join(root, 'source/javascript'), path.join(isolated, 'source/javascript'), { recursive: true });
    await fs.cp(path.join(root, 'source/wasm'), path.join(isolated, 'source/wasm'), { recursive: true });
    await fs.symlink(path.join(root, 'node_modules'), path.join(isolated, 'node_modules'), 'dir');
    assert.equal((await fs.readdir(isolated)).includes('web'), false);
    assert.equal((await fs.readdir(isolated)).includes('upstream'), false);
    for (const filename of await fs.readdir(path.join(isolated, 'source/wasm'))) assert.ok(!filename.endsWith('.wasm'));
    const build = spawnSync(process.execPath, ['tools/build.mjs'], { cwd: isolated, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr + build.stdout);
    for (const name of ['client', 'sp_server']) {
      assert.deepEqual(await fs.readFile(path.join(isolated, `dist/${name}.wasm`)),
        await fs.readFile(path.join(root, `web/${name}.wasm`)));
      assert.deepEqual(await fs.readFile(path.join(isolated, `dist/${name}.js`)),
        await fs.readFile(path.join(root, `source/javascript/${name}.js`)));
    }
    for (const directory of ['game', 'runtime', 'semantic']) {
      await fs.cp(path.join(root, 'source', directory), path.join(isolated, 'source', directory), { recursive: true });
    }
    const readable = spawnSync(process.execPath, ['tools/build.mjs', '--readable'], { cwd: isolated, encoding: 'utf8' });
    assert.equal(readable.status, 0, readable.stderr + readable.stdout);
    for (const name of ['client', 'sp_server']) {
      const module = new WebAssembly.Module(await fs.readFile(path.join(isolated, `dist-readable/${name}.wasm`)));
      assert.ok(WebAssembly.Module.imports(module).some(entry => entry.module === 'readable'), 'recovered game logic must be an active import');
      const javascript = await fs.readFile(path.join(isolated, `dist-readable/${name}.js`), 'utf8');
      assert.ok(javascript.includes('runtime.installReadableModule'));
    }
  } finally { await fs.rm(isolated, { recursive: true, force: true }); }
});
