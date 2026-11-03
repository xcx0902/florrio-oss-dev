#!/usr/bin/env node
/** Verify an already-completed M08 performance suite without rerunning it. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { sourceIdentity } from './verification-evidence.mjs';

const root = path.resolve('.');
const summary = JSON.parse(await readFile('reports/multiplayer/performance-summary.json', 'utf8'));
const source = await sourceIdentity(root);
const serverSha256 = createHash('sha256')
  .update(await readFile('build/native/server/florr_server'))
  .digest('hex');
const issues = [];
if (summary.schema !== 1 || !summary.passed) {
  issues.push('performance summary did not pass');
}
if (summary.source?.sha256 !== source.sha256) {
  issues.push('performance source identity is stale');
}
if (summary.serverSha256 !== serverSha256) {
  issues.push('performance binary hash is stale');
}
if (summary.capacity?.runs < 3 || !summary.capacity?.passed) {
  issues.push('fewer than three passing capacity runs');
}
if (!Array.isArray(summary.capacity?.reports) || summary.capacity.reports.length < 3) {
  issues.push('capacity evidence paths missing');
}
for (const entry of summary.capacity?.reports ?? []) {
  if (!entry.path?.startsWith('reports/multiplayer/capacity/') || entry.path.includes('..')) {
    issues.push('invalid capacity report path');
    continue;
  }
  const bytes = await readFile(entry.path).catch(() => null);
  if (!bytes) {
    issues.push(`missing capacity report ${entry.path}`);
    continue;
  }
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
    issues.push(`capacity report changed ${entry.path}`);
  }
  const report = JSON.parse(bytes);
  if (!report.passed || report.serverSha256 !== serverSha256) {
    issues.push(`capacity report is not from this binary: ${entry.path}`);
  }
  if (!(report.roomTickMicros?.p99 <= 20000) || !(report.roundMicros?.p99 <= 25000)) {
    issues.push(`capacity budget failed: ${entry.path}`);
  }
}
const result = {
  passed: issues.length === 0,
  source: summary.source?.sha256 ?? null,
  serverSha256,
  capacity: summary.capacity
    ? {
        runs: summary.capacity.runs,
        p99Room: summary.capacity.p99Room,
        p99Round: summary.capacity.p99Round,
      }
    : null,
  issues,
};
console.log(JSON.stringify(result, null, 2));
if (!result.passed) {
  process.exitCode = 1;
}
