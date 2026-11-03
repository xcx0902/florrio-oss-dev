#!/usr/bin/env node
/**
 * M08 multiplayer gate profile. Requires a passing, source-identical offline
 * ledger, then binds online-only delivery, real dual-browser cases, a native
 * package, deployment smoke and capacity/soak to one immutable run id.
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { sha256, sourceIdentity, treeIdentity } from './verification-evidence.mjs';
import { atomicJson } from './verification/io.mjs';
import { multiplayerGates, multiplayerGatesPassed } from './verification/gates.mjs';
import { startProcess } from './lib/process.mjs';

const args = process.argv.slice(2);
const profile = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'all';
if (!['functional', 'all'].includes(profile)) {
  throw new Error(`Unknown profile ${profile}`);
}
const runId =
  process.env.VERIFY_RUN_ID ??
  `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
const folder = path.join('reports/multiplayer/runs', runId),
  reportFile = path.join(folder, 'run.json');
await mkdir(folder, { recursive: true });
await mkdir('reports/multiplayer', { recursive: true });
const lock = await open(path.join(folder, 'lock'), 'wx');
const report = {
  schema: 1,
  profile,
  runId,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  passed: false,
  steps: [],
  offline: null,
  source: null,
  delivery: null,
  package: null,
  environment: {},
  gates: [],
};
let active,
  interrupted = false;
const stop = (signal) => {
  interrupted = true;
  active?.stop(signal);
};
const onInterrupt = () => stop('SIGINT'),
  onTerminate = () => stop('SIGTERM');
async function publish() {
  await atomicJson(reportFile, report);
}
async function execute(gate, index) {
  if (interrupted) {
    throw new Error('Verification interrupted');
  }
  const command = gate.script
    ? process.execPath
    : process.env.npm_execpath
      ? process.execPath
      : 'npm';
  const commandArgs = gate.script
    ? [gate.script, ...(gate.args ?? [])]
    : process.env.npm_execpath
      ? [process.env.npm_execpath, 'run', gate.npm]
      : ['run', gate.npm];
  const step = {
    name: gate.name,
    runId,
    command: [command, ...commandArgs],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
  };
  report.steps.push(step);
  await publish();
  console.log(`[${runId}] ${gate.name}`);
  const logfile = path.join(folder, `${String(index).padStart(2, '0')}.log`),
    log = await open(logfile, 'wx');
  try {
    active = startProcess(command, commandArgs, {
      env: {
        ...process.env,
        VERIFY_RUN_ID: runId,
        VERIFY_LOCK_TOKEN: randomUUID(),
        CLIENT_ROOT: 'dist-multiplayer',
      },
      timeoutMs: gate.timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    active.child.stdout.pipe(process.stdout, { end: false });
    active.child.stderr.pipe(process.stderr, { end: false });
    const chunks = [];
    active.child.stdout.on('data', (data) => chunks.push(data));
    active.child.stderr.on('data', (data) => chunks.push(data));
    Object.assign(step, await active.done);
    active = undefined;
    const bytes = Buffer.concat(chunks);
    await log.writeFile(bytes);
    step.log = logfile;
    step.logSha256 = sha256(bytes);
  } finally {
    await log.close();
  }
  step.finishedAt = new Date().toISOString();
  step.reports = [];
  if (step.exitCode === 0) {
    for (const file of gate.reports ?? []) {
      step.reports.push({ path: file, sha256: sha256(await readFile(file)) });
    }
  }
  await publish();
  if (step.exitCode !== 0) {
    throw new Error(`${gate.name} failed (exit ${step.exitCode})`);
  }
}
try {
  await lock.writeFile(JSON.stringify({ runId, pid: process.pid, profile }) + '\n');
  await mkdir(folder, { recursive: true });
  const current = JSON.parse(await readFile('reports/current-verification.json', 'utf8'));
  if (!current.passed || current.status !== 'passed') {
    throw new Error('Offline profile has not passed; run npm run test:all first');
  }
  const source = await sourceIdentity('.');
  if (current.inputs?.source?.sha256 !== source.sha256) {
    throw new Error(
      `Offline ledger source ${current.inputs?.source?.sha256 ?? 'missing'} != current ${source.sha256}; run npm run test:all`,
    );
  }
  report.offline = {
    runId: current.runId,
    ledgerSha256: sha256(await readFile(`reports/runs/${current.runId}/run.json`)),
    source: current.inputs.source,
  };
  report.source = source;
  report.environment = {
    platform: process.platform,
    arch: process.arch,
    release: execFileSync('uname', ['-r'], { encoding: 'utf8' }).trim(),
    node: process.version,
    cmake: execFileSync('cmake', ['--version'], { encoding: 'utf8' }).split('\n')[0],
    compiler: process.env.CXX ?? 'default',
  };
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  await publish();
  const selected = profile === 'functional' ? multiplayerGates.slice(0, -1) : multiplayerGates;
  for (const [index, gate] of selected.entries()) {
    await execute(gate, index);
  }
  const finalSource = await sourceIdentity('.');
  report.delivery = {
    treeSha256: (await treeIdentity('.', ['dist-multiplayer'])).sha256,
    manifestSha256: sha256(await readFile('dist-multiplayer/build-manifest.json')),
  };
  const manifest = JSON.parse(await readFile('dist-multiplayer/build-manifest.json'));
  const packageDirs = (await import('node:fs/promises'))
    .readdir('release/multiplayer', { withFileTypes: true })
    .catch(() => []);
  const packageName = (await packageDirs)
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.startsWith(
          `${manifest.server.version}-${manifest.source.sha256.slice(0, 12)}-${runId}`,
        ),
    )
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  if (packageName) {
    const packageDir = path.join('release/multiplayer', packageName);
    const packageManifest = JSON.parse(
      await readFile(path.join(packageDir, 'release-manifest.json'), 'utf8'),
    );
    report.package = {
      path: packageDir,
      version: packageManifest.version,
      target: packageManifest.target,
      manifestSha256: sha256(await readFile(path.join(packageDir, 'release-manifest.json'))),
      serverSha256: packageManifest.server.sha256,
      clientFiles: packageManifest.client.files.files,
    };
  }
  report.delivery.version = manifest.server.version;
  report.delivery.server = {
    version: manifest.server.version,
    sha256: manifest.server.sha256,
    nativeSource: manifest.server.nativeSource,
  };
  report.delivery.protocol = manifest.protocol;
  report.delivery.clientFiles = manifest.client.totals;
  report.stable =
    report.source.sha256 === finalSource.sha256 &&
    report.delivery.treeSha256 === (await treeIdentity('.', ['dist-multiplayer'])).sha256 &&
    report.package?.serverSha256 === manifest.server.sha256;
  report.gates = report.steps.map((step) => step.name);
  report.passed =
    !interrupted &&
    report.stable &&
    multiplayerGatesPassed(
      profile === 'functional'
        ? report.steps.concat([
            {
              name: 'multiplayer capacity and soak',
              exitCode: 0,
              finishedAt: 'skipped',
              logSha256: '0'.repeat(64),
            },
          ])
        : report.steps,
    );
} catch (error) {
  report.error = error.message;
  console.error(error.message);
} finally {
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  report.finishedAt = new Date().toISOString();
  try {
    await publish();
    await atomicJson('reports/multiplayer/current-verification.json', {
      ...report,
      status: report.passed ? 'passed' : 'failed',
      generatedAt: report.finishedAt,
      ledgerSha256: sha256(await readFile(reportFile)),
    });
  } finally {
    await lock.close();
    await rm(path.join(folder, 'lock'), { force: true });
  }
}
console.log(`${runId}: ${report.passed ? 'PASS' : 'FAIL'} (${reportFile})`);
if (!report.passed) {
  process.exitCode = 1;
}
