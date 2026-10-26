/** Content identities shared by build artifacts and verification reports. */
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, stat, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export const scenarioNames = ['boot-menu', 'garden-idle', 'move', 'attack', 'equip', 'damage', 'death', 'spawn'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function treeIdentity(root, entries, { exclude = () => false } = {}) {
  root = await realpath(root);
  const files = {};
  async function visit(relative, entry = false) {
    if (exclude(relative)) return;
    const absolute = path.join(root, relative);
    let info;
    try { info = await lstat(absolute); } catch (error) {
      if (error.code === 'ENOENT') { files[relative] = null; return; }
      throw error;
    }
    if (info.isSymbolicLink()) {
      // Only explicit archived oracle roots may be compatibility links.
      const target = await realpath(absolute);
      if (!entry || !target.startsWith(root + path.sep)) throw new Error(`Unsupported evidence symlink: ${relative}`);
      info = await stat(absolute);
    }
    if (info.isDirectory()) {
      for (const name of (await readdir(absolute)).sort()) {
        if (name === '.DS_Store') continue;
        await visit(path.posix.join(relative, name));
      }
    } else if (info.isFile()) files[relative] = sha256(await readFile(absolute));
    else throw new Error(`Unsupported evidence file: ${relative}`);
  }
  for (const entry of [...entries].sort()) await visit(entry, true);
  return { sha256: sha256(JSON.stringify(files)), files };
}
export async function sourceIdentity(root = process.cwd()) {
  return treeIdentity(root, ['engine/src', 'engine/include', 'engine/tests', 'engine/CMakeLists.txt', 'client/src',
    'client/tsconfig.json', 'client/tests', 'test', 'schema', 'tools', 'serve.mjs',
    '.github', '.emscripten-version', '.chromium-version', 'package.json', 'package-lock.json']);
}
export async function evidence(root = process.cwd()) {
  const compact = identity => ({ sha256: identity.sha256, fileCount: Object.keys(identity.files).length });
  const goldenInputs = scenarioNames.flatMap(name => [
    ...['canvas.json', 'server.json', 'screenshot.png', 'client-state.json', 'meta.json'].map(file => `tests/parity/golden/${name}/${file}`),
    ...['canvas.json', 'screenshot.png', 'meta.json'].map(file => `tests/parity/next/${name}/${file}`),
    ...['canvas.json', 'screenshot.png', 'meta.json'].map(file => `tests/parity/next-ui-v2/${name}/${file}`),
  ]);
  return { runId: process.env.VERIFY_RUN_ID ?? null, source: compact(await sourceIdentity(root)),
    // Compiler record timestamps/run IDs are provenance, not runtime bytes.
    // Exclude them so two rebuilds of one version have the same client hash.
    client: compact(await treeIdentity(root, ['client/public'], { exclude: file => file.endsWith('.build.json') })),
    oracle: compact(await treeIdentity(root, ['web', 'source/javascript', 'source/game', 'source/runtime', 'source/wasm',
      'reference/manifest.json', 'tests/parity/next-ui-v2/provenance.json', ...goldenInputs])) };
}
export function newRunId() { return `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`; }
export function sameEvidence(left, right) {
  return ['source', 'client', 'oracle'].every(key =>
    typeof left?.[key]?.sha256 === 'string' && /^[a-f0-9]{64}$/.test(left[key].sha256)
    && left[key].sha256 === right?.[key]?.sha256);
}
export function completeCoverage(rows, expected = scenarioNames) {
  if (!Array.isArray(rows) || !Array.isArray(expected) || !expected.length) return false;
  const names = rows.map(row => row?.name ?? row?.scenario);
  return names.length === expected.length && new Set(names).size === names.length
    && expected.every(name => names.includes(name));
}
