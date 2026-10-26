#!/usr/bin/env node
/** R13 gate: compare every trailing-frame command, attribute, argument and referenced Path2D. */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { compareCanvasFrames } from './canvas-state-diff.mjs';
import { evidence, sha256, scenarioNames } from '../verification-evidence.mjs';
import { atomicJson, assertVerificationOwner } from '../verification/io.mjs';
await assertVerificationOwner();
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.lastIndexOf(name); return i < 0 ? fallback : args[i + 1]; };
const goldenRoot = path.resolve(option('--golden', 'tests/parity/golden'));
const nextRoot = path.resolve(option('--next', 'tests/parity/next-engine'));
const output = path.resolve(option('--out', 'tests/parity/next-engine/command-diff.json'));
const tolerance = Number(option('--tolerance', '0.0001'));
const reportOnly = args.includes('--diagnostic');
const scenarios = scenarioNames;
const rows = [];
for (const scenario of scenarios) {
  const goldenFile = path.join(goldenRoot, scenario, 'canvas.json');
  const nextFile = path.join(nextRoot, scenario, 'canvas.json');
  if (!existsSync(goldenFile) || !existsSync(nextFile)) {
    rows.push({ scenario, passed: false, error: 'missing canvas trace' });
    continue;
  }
  const goldenBytes = await readFile(goldenFile), nextBytes = await readFile(nextFile);
  const golden = JSON.parse(goldenBytes), next = JSON.parse(nextBytes);
  const diff = compareCanvasFrames(golden, next, { tolerance, requiredFrames: 3 });
  const a = golden.frames?.at(-1)?.ops ?? [], b = next.frames?.at(-1)?.ops ?? [];
  let prefix = 0;
  while (prefix < Math.min(a.length, b.length) && a[prefix][1] === b[prefix][1]) prefix++;
  rows.push({ scenario, ...diff, goldenOps: diff.expectedOps, nextOps: diff.actualOps, lastFrameOpcodePrefix: prefix,
    goldenSha256: sha256(goldenBytes), nextSha256: sha256(nextBytes),
    comparedTimes: { golden: golden.frames?.map(frame => frame?.time), next: next.frames?.map(frame => frame?.time) } });
}
const report = { generatedAt: new Date().toISOString(), evidence: await evidence(),
  kind: 'equivalence', strict: true, reportOnly, tolerance, passed: rows.every(row => row.passed), scenarios: rows };
await atomicJson(output, report);
for (const row of rows) console.log(`${row.scenario}: ${row.passed ? 'PASS' : 'FAIL'} ${row.issueCount ?? row.error} differences, ${row.goldenOps ?? 0}/${row.nextOps ?? 0} ops`);
if (!report.passed && !reportOnly) process.exitCode = 1;
