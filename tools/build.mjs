#!/usr/bin/env node
/** Build exclusively from source/. Never copy a precompiled game binary. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import wabtFactory from 'wabt';
import { makeReadableWat, runtimeBootstrap } from './lib/readable-wasm.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readable = process.argv.includes('--readable');
const outputIndex = process.argv.indexOf('--output');
const output = path.resolve(root, outputIndex < 0 ? (readable ? 'dist-readable' : 'dist') : process.argv[outputIndex + 1]);
const registry = readable ? await import('../source/runtime/registry.mjs') : null;
const wabt = await wabtFactory();
await fs.mkdir(output, { recursive: true });
await fs.cp(path.join(root, 'source/assets'), output, { recursive: true });
if (readable) {
  for (const directory of ['runtime', 'game', 'semantic']) {
    await fs.cp(path.join(root, 'source', directory), path.join(output, directory), { recursive: true });
  }
}
const reference = JSON.parse(await fs.readFile(path.join(root, 'reports/wasm/manifest.json'), 'utf8'));
const result = { schema: 2, inputRoot: 'source', mode: readable ? 'readable' : 'reference', output, modules: {} };
for (const name of ['client', 'sp_server']) {
  const javascript = await fs.readFile(path.join(root, `source/javascript/${name}.js`), 'utf8');
  await fs.writeFile(path.join(output, name + '.js'), (readable ? runtimeBootstrap(name) : '') + javascript);
  const input = `source/wasm/${name}.wat`;
  let text = await fs.readFile(path.join(root, input), 'utf8');
  const plan = registry?.recoveredFunctionPlan(name) ?? [];
  if (readable) {
    const inventory = JSON.parse(await fs.readFile(path.join(root, `reports/wasm/${name}-functions.json`), 'utf8'));
    text = makeReadableWat(text, inventory, plan).text;
  }
  const module = wabt.parseWat(input, text);
  try {
    module.resolveNames(); module.validate();
    const { buffer } = module.toBinary({ canonicalize_lebs: true, write_debug_names: false });
    const hash = createHash('sha256').update(buffer).digest('hex');
    await fs.writeFile(path.join(output, name + '.wasm'), buffer);
    result.modules[name] = { input, bytes: buffer.length, sha256: hash,
      matchesReference: hash === reference.modules[name].inputSha256,
      recoveredFunctions: plan,
      remainingMachineFunctions: reference.modules[name].functions - plan.length };
    console.log(`${name}.wasm: compiled ${buffer.length} bytes from WAT; reference match: ${result.modules[name].matchesReference}`);
  } finally { module.destroy(); }
}
await fs.mkdir(path.join(root, 'reports'), { recursive: true });
result.sourceSha256 = {};
async function recordSource(file) {
  const stat = await fs.stat(path.join(root, file));
  if (stat.isDirectory()) {
    for (const child of (await fs.readdir(path.join(root, file))).sort()) await recordSource(path.join(file, child));
  } else if (file.endsWith('.mjs') || file.endsWith('.js') || file.endsWith('.wat')) {
    result.sourceSha256[file] = createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex');
  }
}
for (const folder of readable ? ['game', 'runtime', 'semantic', 'javascript', 'wasm'] : ['javascript', 'wasm']) await recordSource(`source/${folder}`);
await fs.writeFile(path.join(root, 'reports/build.json'), JSON.stringify(result, null, 2) + '\n');
await fs.writeFile(path.join(root, `reports/build-${result.mode}.json`), JSON.stringify(result, null, 2) + '\n');
console.log(`Complete static game: ${path.relative(root, output)}/ (node serve.mjs --root ${path.relative(root, output)})`);
