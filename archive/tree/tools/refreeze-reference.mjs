#!/usr/bin/env node
/**
 * Explicit reference refreeze workflow.
 *
 * 1. Snapshot the previous manifest key-file hashes.
 * 2. Regenerate reference/manifest.json + reference/README.md.
 * 3. Write reference/CHANGELOG.md with every key-file/tree hash that changed and
 *    the reviewer-supplied --reason text.
 *
 * Run this only after an intentional change to an oracle artifact (web/,
 * dist/, source/wasm, source/javascript, source/semantic or reports). Recovered
 * implementation JS and C++/TS sources are not part of the frozen reference.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const reason = option('--reason', 'unspecified reference change');
const previousPath = 'reference/manifest.json';
const previous = existsSync(previousPath) ? JSON.parse(await readFile(previousPath, 'utf8')) : null;
execFileSync(process.execPath, ['tools/reference-manifest.mjs'], { stdio: 'inherit' });
const current = JSON.parse(await readFile(previousPath, 'utf8'));

const changes = [];
const seen = new Set();
for (const section of ['keyFiles']) {
  for (const [name, value] of Object.entries(current[section] ?? {})) {
    seen.add(name);
    const before = previous?.[section]?.[name];
    if (!before || before.sha256 !== value.sha256) changes.push({ kind: section, path: name,
      before: before?.sha256 ?? null, after: value.sha256 });
  }
  for (const name of Object.keys(previous?.[section] ?? {})) {
    if (!seen.has(name)) changes.push({ kind: section, path: name,
      before: previous[section][name].sha256, after: null });
  }
}
for (const [directory, value] of Object.entries(current.trees ?? {})) {
  const before = previous?.trees?.[directory];
  if (!before || before.sha256 !== value.sha256) changes.push({ kind: 'tree', path: directory,
    before: before?.sha256 ?? null, after: value.sha256 });
}
const short = value => value ? value.slice(0, 16) : 'absent';
const lines = [
  `# Reference refreeze ${new Date().toISOString()}`,
  '',
  `Reason: ${reason}`,
  '',
  '| Kind | Path | Previous | Current |',
  '| --- | --- | --- | --- |',
  ...changes.map(change => `| ${change.kind} | ${change.path} | ${short(change.before)} | ${short(change.after)} |`),
  '',
  changes.length === 0 ? 'No frozen artifact changed.' : `${changes.length} frozen artifact change(s) recorded.`,
  '',
];
await writeFile('reference/CHANGELOG.md', lines.join('\n'));
console.log(JSON.stringify({ reason, changes, manifest: previousPath }, null, 2));
