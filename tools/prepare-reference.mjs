#!/usr/bin/env node
/** Restore ignored historical trees from a digest-checked transport archive.
 * This is restoration of the frozen bytes, never a reference refreeze.
 */
import { readFile, mkdtemp, rm, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { sha256, listFiles } from './lib/build-inputs.mjs';

const root = path.resolve('.');
const manifest = JSON.parse(await readFile('reference/manifest.json', 'utf8'));
const bundle = JSON.parse(await readFile('reference/frozen-trees.json', 'utf8'));
const trees = ['dist', 'dist-readable', 'dist-reference'];
if (JSON.stringify(bundle.trees) !== JSON.stringify(trees) || bundle.file !== 'frozen-trees.tar.gz') throw new Error('Unexpected reference transport metadata');
const missing = trees.filter(tree => !existsSync(path.join(root, tree)));
if (missing.length) {
  const archive = path.join(root, 'reference', bundle.file);
  const bytes = await readFile(archive);
  if (bytes.length !== bundle.bytes || sha256(bytes) !== bundle.sha256) throw new Error('Frozen tree archive digest mismatch');
  const inventory = spawnSync('tar', ['-tvzf', archive], { encoding: 'utf8' });
  if (inventory.status !== 0) throw new Error(`Cannot list frozen tree archive: ${inventory.stderr}`);
  if (inventory.stdout.split('\n').filter(Boolean).some(line => !['-', 'd'].includes(line[0]))) throw new Error('Reference archive contains links or special files');
  const names = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
  if (names.status !== 0) throw new Error(`Cannot list archive paths: ${names.stderr}`);
  for (const entry of names.stdout.split('\n').filter(Boolean)) {
    if (entry.includes('\\') || path.posix.isAbsolute(entry) || entry.split('/').includes('..') || !trees.includes(entry.split('/')[0]))
      throw new Error(`Unsafe reference archive member: ${entry}`);
  }
  // Keep rename on the same filesystem even when /tmp is a separate mount.
  const temporary = await mkdtemp(path.join(root, '.frozen-reference-stage-'));
  try {
    const unpack = spawnSync('tar', ['-xzf', archive, '-C', temporary], { encoding: 'utf8', env: { ...process.env, COPYFILE_DISABLE: '1' } });
    if (unpack.status !== 0) throw new Error(`Cannot restore frozen trees: ${unpack.stderr}`);
    for (const tree of missing) {
      const expected = manifest.trees[tree].entries;
      const files = await listFiles(path.join(temporary, tree));
      if (JSON.stringify(files) !== JSON.stringify(expected.map(entry => entry.path).sort())) throw new Error(`Restored file inventory differs: ${tree}`);
      for (const entry of expected) {
        const body = await readFile(path.join(temporary, tree, entry.path));
        if (body.length !== entry.bytes || sha256(body) !== entry.sha256) throw new Error(`Restored file differs: ${tree}/${entry.path}`);
      }
      await rename(path.join(temporary, tree), path.join(root, tree));
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
const check = spawnSync(process.execPath, ['tools/verify-reference.mjs'], { cwd: root, stdio: 'inherit' });
if (check.status !== 0) process.exitCode = check.status ?? 1;
