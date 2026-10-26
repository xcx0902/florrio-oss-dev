#!/usr/bin/env node
/**
 * Freeze the identity of the reference build and the current reconstruction
 * baseline. Writes reference/manifest.json and reference/README.md.
 *
 * The checkout has no .git directory, so a tag cannot be created here. The
 * manifest records content hashes instead, which are the same identity for
 * every practical purpose: any change to the reference or baseline files
 * changes the manifest.
 */
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = path.resolve('.');
const output = path.join(root, 'reference');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function listFiles(directory, prefix = '') {
  const entries = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) entries.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) entries.push(relative);
  }
  return entries.sort();
}

async function hashFile(relative) {
  const bytes = await readFile(path.join(root, relative));
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

async function hashTree(directory) {
  const files = await listFiles(directory);
  const entries = [];
  const lines = [];
  for (const relative of files) {
    const info = await hashFile(path.posix.join(directory, relative));
    entries.push({ path: relative, ...info });
    lines.push(`${relative}\0${info.bytes}\0${info.sha256}\n`);
  }
  return { files: entries.length, bytes: entries.reduce((sum, item) => sum + item.bytes, 0), sha256: sha256(lines.join('')), entries };
}

const build = JSON.parse(await readFile('reports/build.json', 'utf8'));
const wasmManifest = JSON.parse(await readFile('reports/wasm/manifest.json', 'utf8'));
const modules = {};
for (const [name, module] of Object.entries(build.modules)) {
  modules[name] = {
    input: module.input,
    bytes: module.bytes,
    sha256: module.sha256,
    matchesReference: module.matchesReference,
    recovered: module.recoveredFunctions.length,
    remaining: module.remainingMachineFunctions,
    total: module.recoveredFunctions.length + module.remainingMachineFunctions,
  };
}
const totals = Object.values(modules).reduce((accumulator, module) => ({
  recovered: accumulator.recovered + module.recovered,
  remaining: accumulator.remaining + module.remaining,
  total: accumulator.total + module.total,
}), { recovered: 0, remaining: 0, total: 0 });

const testFiles = (await readdir('test')).filter(name => name.endsWith('.test.mjs')).sort();
const testEntries = [];
for (const name of testFiles) {
  const info = await hashFile(path.posix.join('test', name));
  testEntries.push({ path: `test/${name}`, ...info });
}

const keyFiles = [
  'web/client.wasm', 'web/sp_server.wasm', 'web/client.js', 'web/sp_server.js', 'web/index.html',
  'source/wasm/client.wat', 'source/wasm/sp_server.wat',
  'source/javascript/client.js', 'source/javascript/sp_server.js',
  'source/semantic/server-catalogs.json', 'source/semantic/client-catalogs.json',
  'reports/build.json', 'reports/wasm/manifest.json', 'reports/RECONSTRUCTION.md', 'package-lock.json',
];
const files = {};
for (const relative of keyFiles) if (existsSync(relative)) files[relative] = await hashFile(relative);

let emcc = null;
try { emcc = execFileSync('emcc', ['--version'], { encoding: 'utf8' }).split('\n')[0].trim(); } catch { /* optional */ }
let chrome = null;
try { chrome = execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--version'], { encoding: 'utf8' }).trim(); } catch { /* optional */ }

const manifest = {
  schema: 1,
  name: 'legacy-florr-reference',
  createdAt: new Date().toISOString(),
  checkout: root,
  git: existsSync('.git') ? 'present' : 'absent',
  note: 'No .git directory exists in this checkout. Content hashes in this manifest identify the frozen reference; do not edit web/, dist/, dist-readable/, dist-reference/, source/wasm/*.wat, or source/javascript/*.js.',
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length, emcc, chrome },
  keyFiles: files,
  trees: {
    web: await hashTree('web'),
    dist: await hashTree('dist'),
    'dist-readable': await hashTree('dist-readable'),
    'dist-reference': await hashTree('dist-reference'),
  },
  build: { inputRoot: build.inputRoot, mode: build.mode, modules, totals },
  wasmManifest: { modules: Object.fromEntries(Object.entries(wasmManifest.modules).map(([name, value]) => [name, { functions: value.functions, imports: value.imports, inputSha256: value.inputSha256, sourceSha256: value.sourceSha256, rebuiltSha256: value.rebuiltSha256, byteIdentical: value.byteIdentical }])) },
  tests: { command: 'node --test test/*.test.mjs', files: testEntries },
  parity: {
    command: 'node tools/parity/run-scenario.mjs --all',
    update: 'node tools/parity/run-scenario.mjs --all --update',
    serverTrace: 'node tools/parity/server-trace.mjs --all',
    golden: 'tests/parity/golden',
  },
};

await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const summary = `# Frozen reference

This directory records the identity of the archived game and the current
reconstruction baseline. It is **reference only**: do not edit files under
\`web/\`, \`dist/\`, \`dist-readable/\`, \`dist-reference/\`, \`source/wasm/*.wat\`,
or \`source/javascript/*.js\` to make a test pass. If a reference change is
unavoidable, regenerate this manifest and record why in \`docs/parity.md\`.

The checkout has no \`.git\` directory, so the planned \`reference-<date>\` tag is
represented by content hashes in [\`manifest.json\`](manifest.json).

## Identity

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| \`web/client.wasm\` | ${files['web/client.wasm'].bytes.toLocaleString('en-US')} | \`${files['web/client.wasm'].sha256}\` |
| \`web/sp_server.wasm\` | ${files['web/sp_server.wasm'].bytes.toLocaleString('en-US')} | \`${files['web/sp_server.wasm'].sha256}\` |
| \`source/wasm/client.wat\` | ${files['source/wasm/client.wat'].bytes.toLocaleString('en-US')} | \`${files['source/wasm/client.wat'].sha256}\` |
| \`source/wasm/sp_server.wat\` | ${files['source/wasm/sp_server.wat'].bytes.toLocaleString('en-US')} | \`${files['source/wasm/sp_server.wat'].sha256}\` |

Directory trees (path + size + content hash, sorted):

| Tree | Files | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
${Object.entries(manifest.trees).map(([name, tree]) => `| \`${name}/\` | ${tree.files} | ${tree.bytes.toLocaleString('en-US')} | \`${tree.sha256}\` |`).join('\n')}

## Reconstruction baseline

Authoritative counts from [\`reports/build.json\`](../reports/build.json):

| Module | Recovered as high-level JS | Still machine code | Total |
| --- | ---: | ---: | ---: |
${Object.entries(modules).map(([name, module]) => `| ${name} | ${module.recovered} | ${module.remaining} | ${module.total} |`).join('\n')}
| **total** | **${totals.recovered}** | **${totals.remaining}** | **${totals.total}** |

These numbers supersede older prose counts in \`goal.md\` §5.1 and the
"coverage" table in \`reports/RECONSTRUCTION.md\`. The latter counts a different
quantity ("functions migrated into high-level execution" versus "functions whose
original body is still present"); \`build.json\` is the single source of truth for
the remaining-work baseline.

## Commands

\`\`\`sh
npm ci --ignore-scripts
npm run build                 # rebuild dist/ from source
npm test                      # function-level oracle tests
npm run test:reference        # verify this manifest and the frozen trees
npm run test:engine           # C++20 core native unit tests
npm run build:engine:wasm     # C++20 core -> client/public/server.wasm
npm run test:client           # TypeScript typecheck + browser smoke tests
npm run test:parity           # Canvas2D/screenshot/server trace parity
npm run test:all              # all of the above, in CI order
node tools/reference-manifest.mjs   # refresh this manifest
\`\`\`

## Test inventory

${testEntries.length} function-level test files are recorded with SHA-256 in
\`manifest.json\`. The manifest does not claim they currently all pass; run
\`npm test\` for that.

## Environment

- Node ${process.version}, ${process.platform}/${process.arch}
- Emscripten: ${emcc ?? 'not found on PATH'}
- Chrome: ${chrome ?? 'not found'}
`;
await writeFile(path.join(output, 'README.md'), summary);
console.log(JSON.stringify({ manifest: path.join(output, 'manifest.json'), totals, trees: Object.fromEntries(Object.entries(manifest.trees).map(([name, tree]) => [name, { files: tree.files, sha256: tree.sha256 }])), tests: testEntries.length }, null, 2));
