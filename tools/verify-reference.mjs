#!/usr/bin/env node
/** Verify that the frozen reference trees and key files still match
 * reference/manifest.json. Fails on any byte change. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = path.resolve('.');
const manifest = JSON.parse(await readFile(path.join(root, 'reference/manifest.json'), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const issues = [];

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
async function hashTree(directory) {
  const lines = [];
  let bytes = 0;
  for (const relative of await listFiles(directory)) {
    const content = await readFile(path.join(root, directory, relative));
    bytes += content.length;
    lines.push(`${relative}\0${content.length}\0${sha256(content)}\n`);
  }
  return { files: lines.length, bytes, sha256: sha256(lines.join('')) };
}

for (const [relative, expected] of Object.entries(manifest.keyFiles)) {
  if (!existsSync(path.join(root, relative))) { issues.push({ kind: 'missing', path: relative }); continue; }
  const content = await readFile(path.join(root, relative));
  const actual = { bytes: content.length, sha256: sha256(content) };
  if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) issues.push({ kind: 'key-file', path: relative, expected, actual });
}
for (const [directory, expected] of Object.entries(manifest.trees)) {
  const actual = await hashTree(directory);
  if (actual.sha256 !== expected.sha256 || actual.files !== expected.files) issues.push({ kind: 'tree', path: directory, expected: { files: expected.files, sha256: expected.sha256 }, actual });
}
const build = JSON.parse(await readFile(path.join(root, 'reports/build.json'), 'utf8'));
const totals = Object.values(build.modules).reduce((sum, module) => ({
  recovered: sum.recovered + module.recoveredFunctions.length,
  remaining: sum.remaining + module.remainingMachineFunctions,
}), { recovered: 0, remaining: 0 });
if (totals.recovered !== manifest.build.totals.recovered || totals.remaining !== manifest.build.totals.remaining) {
  issues.push({ kind: 'baseline', path: 'reports/build.json', expected: manifest.build.totals, actual: totals });
}
const report = { passed: issues.length === 0, trees: Object.keys(manifest.trees), keyFiles: Object.keys(manifest.keyFiles).length, totals, issues };
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
