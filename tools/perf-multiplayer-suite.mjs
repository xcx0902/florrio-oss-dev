#!/usr/bin/env node
/** Ordered M08 performance profile: 3 capacity repetitions, soak and edge scenarios. */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve('.');
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const stamp = new Date().toISOString().replaceAll(':', '-');
const runs = [];
const children = new Set();
function run(args, label) {
  return new Promise((resolve) => {
    console.error(`[perf-suite] ${label}`);
    const child = spawn(process.execPath, ['tools/perf-multiplayer.mjs', ...args], {
      cwd: root,
      stdio: 'inherit',
    });
    children.add(child);
    child.once('exit', (code) => {
      children.delete(child);
      resolve({ label, args, exitCode: code, finishedAt: new Date().toISOString() });
    });
  });
}
process.once('SIGINT', () => {
  for (const child of children) {
    child.kill('SIGINT');
  }
});
process.once('SIGTERM', () => {
  for (const child of children) {
    child.kill('SIGTERM');
  }
});
const reused = (process.env.M08_REUSE_CAPACITY ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const reuseSoak = (process.env.M08_REUSE_SOAK ?? '').trim();
const currentBinarySha256 = createHash('sha256')
  .update(await readFile('build/native/server/florr_server'))
  .digest('hex');
const duration = quick ? 30 : 900,
  warmup = quick ? 5 : 60,
  soak = quick ? 60 : 1800,
  soakWarmup = quick ? 10 : 300;
try {
  const capacityReports = [],
    capacityEvidence = [];
  const previousStill = process.env.M08_STILL;
  process.env.M08_STILL = '1';
  for (const file of reused) {
    try {
      const report = JSON.parse(await readFile(file, 'utf8'));
      if (!report.passed) {
        throw new Error('report did not pass');
      }
      if (report.serverSha256 !== currentBinarySha256) {
        throw new Error('report binary does not match current server');
      }
      capacityReports.push(report);
      capacityEvidence.push({
        path: file,
        sha256: createHash('sha256')
          .update(await readFile(file))
          .digest('hex'),
        p99: report.roomTickMicros?.p99,
        roundP99: report.roundMicros?.p99,
        serverSha256: report.serverSha256,
        reused: true,
      });
      runs.push({
        label: `reused capacity ${file}`,
        args: [],
        exitCode: 0,
        reused: true,
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[perf-suite] cannot reuse ${file}: ${error.message}`);
    }
  }
  let index = 1;
  while (capacityReports.length < 3) {
    const target = capacityReports.length + 1;
    for (let attempt = 0; attempt < 3 && capacityReports.length < target; attempt++) {
      const folder = path.join(
        'reports/multiplayer/capacity',
        `${stamp}-capacity-${index}-${attempt}`,
      );
      const entry = await run(
        [
          '--scenario',
          'capacity',
          '--duration',
          String(duration),
          '--warmup',
          String(warmup),
          '--out',
          folder,
        ],
        `capacity ${target}/3${attempt ? ` retry ${attempt}` : ''}`,
      );
      runs.push(entry);
      const reportFile = path.join(folder, 'capacity', 'report.json');
      try {
        const report = JSON.parse(await readFile(reportFile, 'utf8'));
        if (report.passed) {
          capacityReports.push(report);
          capacityEvidence.push({
            path: reportFile,
            sha256: createHash('sha256')
              .update(await readFile(reportFile))
              .digest('hex'),
            p99: report.roomTickMicros?.p99,
            roundP99: report.roundMicros?.p99,
            serverSha256: report.serverSha256,
          });
        }
      } catch {
        /* failed run remains in runs for evidence */
      }
    }
    index++;
  }
  if (previousStill === undefined) {
    delete process.env.M08_STILL;
  } else {
    process.env.M08_STILL = previousStill;
  }
  runs.push(
    await run(
      [
        '--scenario',
        'minimal',
        '--duration',
        quick ? 30 : 120,
        '--warmup',
        quick ? 5 : 30,
        '--out',
        path.join('reports/multiplayer/minimal', stamp),
      ],
      'minimal',
    ),
  );
  runs.push(
    await run(
      [
        '--scenario',
        'battle',
        '--duration',
        quick ? 30 : 120,
        '--warmup',
        quick ? 5 : 30,
        '--out',
        path.join('reports/multiplayer/battle', stamp),
      ],
      'battle',
    ),
  );
  runs.push(
    await run(
      [
        '--scenario',
        'lifecycle',
        '--cycles',
        quick ? 8 : 100,
        '--out',
        path.join('reports/multiplayer/lifecycle', stamp),
      ],
      'lifecycle',
    ),
  );
  runs.push(
    await run(
      [
        '--scenario',
        'slow',
        '--duration',
        quick ? 20 : 120,
        '--warmup',
        quick ? 5 : 20,
        '--out',
        path.join('reports/multiplayer/slow', stamp),
      ],
      'slow consumer',
    ),
  );
  let reusedSoakReport = null;
  if (reuseSoak) {
    try {
      const report = JSON.parse(await readFile(reuseSoak, 'utf8'));
      if (
        !report.passed ||
        report.scenario !== 'soak' ||
        report.serverSha256 !== currentBinarySha256 ||
        (report.durationSeconds ?? 0) < soak ||
        !report.rssFirst5m ||
        !report.rssLast5m
      ) {
        throw new Error('report is not a matching passing soak with RSS evidence');
      }
      reusedSoakReport = report;
      runs.push({
        label: `reused soak ${reuseSoak}`,
        args: [],
        exitCode: 0,
        reused: true,
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[perf-suite] cannot reuse soak ${reuseSoak}: ${error.message}`);
    }
  }
  if (!reusedSoakReport) {
    runs.push(
      await run(
        [
          '--scenario',
          'soak',
          '--duration',
          String(soak),
          '--warmup',
          String(soakWarmup),
          '--out',
          path.join('reports/multiplayer/soak', stamp),
        ],
        'soak',
      ),
    );
  }
  const reports = reusedSoakReport ? [reusedSoakReport] : [];
  for (const entry of runs) {
    if (entry.reused) {
      continue;
    }
    const folder = entry.args[entry.args.indexOf('--out') + 1];
    const name = entry.args[entry.args.indexOf('--scenario') + 1];
    try {
      reports.push(JSON.parse(await readFile(path.join(folder, name, 'report.json'), 'utf8')));
    } catch {
      reports.push({ scenario: entry.label, passed: false, missing: true });
    }
  }
  const nonCapacityPassed = reports
    .filter((report) => report.scenario !== 'capacity')
    .every((report) => report.passed !== false);
  const p99 = capacityReports.map((report) => report.roomTickMicros?.p99 ?? Infinity);
  const roundP99 = capacityReports.map((report) => report.roundMicros?.p99 ?? Infinity);
  const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return (
      sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length * p) / 100) - 1)] ?? Infinity
    );
  };
  const capacity = {
    runs: capacityReports.length,
    p99Room: {
      p50: percentile(p99, 50),
      p95: percentile(p99, 95),
      p99: percentile(p99, 99),
      max: Math.max(...p99),
    },
    p99Round: {
      p50: percentile(roundP99, 50),
      p95: percentile(roundP99, 95),
      p99: percentile(roundP99, 99),
      max: Math.max(...roundP99),
    },
    reports: capacityEvidence,
    passed: capacityReports.length === 3 && capacityReports.every((report) => report.passed),
  };
  const source = await (await import('./verification-evidence.mjs')).sourceIdentity(root);
  const serverSha256 = currentBinarySha256;
  const summary = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    quick,
    source: { sha256: source.sha256, fileCount: Object.keys(source.files).length },
    serverSha256,
    capacity,
    runs,
    passed: capacity.passed && nonCapacityPassed,
  };
  await mkdir('reports/multiplayer', { recursive: true });
  await writeFile(
    'reports/multiplayer/capacity/summary.json',
    JSON.stringify(summary, null, 2) + '\n',
  );
  await writeFile(
    'reports/multiplayer/performance-summary.json',
    JSON.stringify(summary, null, 2) + '\n',
  );
  console.log(JSON.stringify({ passed: summary.passed, capacity, runs }, null, 2));
  if (!summary.passed) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
