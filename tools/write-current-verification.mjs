#!/usr/bin/env node
/** Ledger from one recorded run. Live files are diagnostic when no run snapshot exists. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { evidence, sameEvidence, sha256, treeIdentity } from './verification-evidence.mjs';
import { parseTap } from './verification/tap.mjs';
import { rowPassed } from './verification/report-status.mjs';
import { assessReport, reportPaths, tapPaths, requiredSteps } from './verification/gates.mjs';
import { atomicJson, assertVerificationOwner, readJson, runDirectory } from './verification/io.mjs';

export async function writeCurrentVerification({ root = process.cwd(), output = 'reports/current-verification.json',
  runId = process.env.VERIFY_RUN_ID ?? null } = {}) {
  root = path.resolve(root);
  await assertVerificationOwner(root);
  const latest = await readJson(path.join(root, 'reports/latest-run.json'));
  runId ??= latest?.runId ?? null;
  const folder = runId ? runDirectory(root, runId) : null;
  const run = folder ? await readJson(path.join(folder, 'run.json')) : null;
  const current = { ...await evidence(root), runId };
  const owner = await readJson(path.join(root, 'reports/verification.lock'));
  const activeOwner = owner?.runId === runId && owner?.token === process.env.VERIFY_LOCK_TOKEN
    && typeof owner?.token === 'string' && owner.token.length > 0;
  const isCurrent = metadata => runId !== null && metadata?.runId === runId
    && metadata.evidence?.runId === runId && sameEvidence(metadata.evidence, current);
  const knownGaps = [];
  let delivery = null;
  try {
    delivery = { root: 'dist-next', manifestSha256: sha256(await readFile(path.join(root, 'dist-next/build-manifest.json'))),
      wasmSha256: sha256(await readFile(path.join(root, 'dist-next/server.wasm'))),
      sha256: (await treeIdentity(root, ['dist-next'])).sha256 };
  } catch { knownGaps.push('R29: delivery tree/manifest is missing.'); }
  if (!run || run.invalid || !runId || run.runId !== runId || run.evidence?.runId !== runId
    || !sameEvidence(run.evidence, current) || run.stable !== true)
    knownGaps.push('R33: no stable complete acceptance run for the current source/client/oracle hashes.');
  if (!activeOwner && (run?.passed !== true || !Number.isFinite(Date.parse(run?.finishedAt))))
    knownGaps.push('R33: acceptance run has not completed successfully.');
  if (!run?.delivery || !delivery || run.delivery.sha256 !== delivery.sha256
    || run.delivery.manifestSha256 !== delivery.manifestSha256 || run.delivery.wasmSha256 !== delivery.wasmSha256)
    knownGaps.push('R29: delivery identity differs from the accepted run.');
  const steps = Array.isArray(run?.steps) ? run.steps.filter(step => step && typeof step === 'object') : [];
  const interval = (start, end) => Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end))
    && Date.parse(start) <= Date.parse(end);
  const within = (start, end, step) => step && interval(start, end) && interval(step.startedAt, step.finishedAt)
    && Date.parse(start) >= Date.parse(step.startedAt) && Date.parse(end) <= Date.parse(step.finishedAt);
  for (const name of requiredSteps) {
    const matching = steps.filter(step => step.name === name);
    if (matching.length !== 1 || matching[0].exitCode !== 0 || matching[0].signal || matching[0].error
      || !interval(matching[0].startedAt, matching[0].finishedAt))
      knownGaps.push(`Run step ${name}: missing, incomplete or failed.`);
  }
  if (JSON.stringify(steps.filter(step => step.name !== 'ledger').map(step => step.name)) !== JSON.stringify(requiredSteps)
    || steps.length !== run?.steps?.length
    || steps.filter(step => step.name === 'ledger').length > 1
    || steps.some((step, index) => index && Date.parse(step.startedAt) < Date.parse(steps[index - 1].finishedAt)))
    knownGaps.push('R33: acceptance steps are not the required serial sequence.');
  if (!activeOwner) {
    const ledger = steps.find(step => step.name === 'ledger');
    if (!ledger || steps.at(-1) !== ledger || ledger.exitCode !== 0 || ledger.error || ledger.signal
      || !interval(ledger.startedAt, ledger.finishedAt) || !interval(run?.startedAt, run?.finishedAt)
      || Date.parse(steps[0]?.startedAt) < Date.parse(run?.startedAt)
      || Date.parse(ledger.finishedAt) > Date.parse(run?.finishedAt))
      knownGaps.push('R33: final run or ledger step is missing, incomplete or failed.');
  }
  if (run?.error) knownGaps.push(`Run: ${run.error}`);
  async function tap(name, source) {
    const file = folder ? path.join(folder, `${name}.tap`) : path.join(root, source);
    let bytes;
    try { bytes = await readFile(file); }
    catch (error) { if (error.code === 'ENOENT') return { status: 'missing', source, recording: file }; throw error; }
    const metadata = await readJson(file + '.meta.json');
    // Per-run metadata is NAME.meta.json, not NAME.tap.meta.json.
    const meta = folder ? await readJson(path.join(folder, `${name}.meta.json`)) : metadata;
    const parsed = parseTap(bytes.toString('utf8'));
    const stepName = { delivery: 'delivery smoke', browser: 'browser matrix' }[name] ?? name;
    const finished = within(meta?.startedAt, meta?.finishedAt, steps.find(step => step.name === stepName));
    const fresh = finished && meta.exitCode === 0 && meta.stable === true && meta.sha256 === sha256(bytes) && isCurrent(meta);
    let status = parsed.status === 'fail' || (meta?.exitCode !== undefined && meta?.exitCode !== null && meta.exitCode !== 0) ? 'fail' : fresh ? 'pass' : 'stale';
    if (['delivery', 'browser'].includes(name) && (meta?.target?.root !== 'dist-next' || meta.target.sha256 !== delivery?.sha256)) status = 'stale';
    return { ...parsed, status, source, recording: path.relative(root, file), runId: meta?.runId ?? null,
      startedAt: meta?.startedAt ?? null, finishedAt: meta?.finishedAt ?? null, exitCode: meta?.exitCode ?? null,
      sha256: sha256(bytes), evidence: meta?.evidence ?? null, target: meta?.target ?? null };
  }
  const tests = {};
  for (const [name, file] of Object.entries(tapPaths)) tests[name] = await tap(name, file);
  const parity = {};
  for (const [name, source] of Object.entries(reportPaths)) {
    const snapshots = steps.flatMap(step => step.reports?.[name] ? [{ ...step.reports[name], step }] : []);
    const snapshot = snapshots.length === 1 ? snapshots[0] : null;
    let value, digest = null, recorded = false;
    if (folder && snapshot?.path === `artifacts/${name}.json`) {
      try {
        const bytes = await readFile(path.join(folder, snapshot.path));
        digest = sha256(bytes); value = JSON.parse(bytes); recorded = digest === snapshot.sha256
          && value?.generatedAt === snapshot.generatedAt && within(value?.generatedAt, value?.generatedAt, snapshot.step);
      } catch { value = { invalid: true }; }
    } else value = await readJson(path.join(root, source));
    let assessment = assessReport(name, value, current, { runId, delivery });
    if (assessment.passed && !recorded) assessment = { ...assessment, status: 'unrecorded', passed: false };
    parity[name] = { ...assessment, kind: name === 'next' ? 'self-consistency' : name === 'originalEngine' ? 'protocol'
      : name === 'visual' ? 'render-isolation' : name === 'production' ? 'production-integration'
      : name === 'performance' ? 'performance' : 'equivalence',
      equivalence: !['next', 'originalEngine', 'production', 'performance'].includes(name),
      source, recording: recorded ? path.relative(root, path.join(folder, snapshot.path)) : null, sha256: digest,
      generatedAt: value?.generatedAt ?? null, runId: value?.evidence?.runId ?? null,
      evidence: value?.evidence ?? null, thresholds: value?.thresholds,
      scenarios: Array.isArray(value?.scenarios) ? value.scenarios.map(row => ({ name: row?.scenario ?? row?.name, passed: rowPassed(row),
        ratio: row?.ratio, max: row?.max, issueCount: row?.issueCount,
        profiles: Array.isArray(row?.profiles) ? row.profiles.map(item => ({ name: item?.profile, passed: rowPassed(item), checks: item?.checks })) : undefined })) : undefined };
  }
  for (const [name, value] of Object.entries(tests)) if (value.status !== 'pass') knownGaps.push(`Tests ${name}: ${value.status}.`);
  for (const [name, value] of Object.entries(parity)) if (!value.passed) knownGaps.push(`${name}: ${value.status}${value.coverage ? '' : ' (incomplete scenario coverage)'}.`);
  if (!parity.hornet.passed) knownGaps.push('R04: native callback presence cannot substitute for a passing original-vs-C++ Hornet fixture.');
  if (!parity.renderCommands.passed) knownGaps.push('R13: complete commands, state attributes, arguments and paths must pass the strict comparison.');
  if (!parity.visual.passed) knownGaps.push('R14/R19: all eight archived-vs-next visual scenarios must pass ratio <=0.001 and max <=8.');
  if (!parity.production.passed) knownGaps.push('R29: the actual dist-next must pass all 24 production recordings (eight scenarios by desktop/retina/touch).');
  const build = await readJson(path.join(root, 'reports/build.json'));
  const modules = Object.fromEntries(Object.entries(build?.modules ?? {}).filter(([, value]) => value && typeof value === 'object').map(([name, value]) => [name, {
    recovered: value.recoveredFunctions?.length ?? 0, remaining: value.remainingMachineFunctions,
    bytes: value.bytes, sha256: value.sha256, matchesReference: value.matchesReference }]));
  const totals = Object.values(modules).reduce((sum, row) => ({ recovered: sum.recovered + row.recovered,
    remaining: sum.remaining + (row.remaining ?? 0) }), { recovered: 0, remaining: 0 });
  if (!sameEvidence(current, await evidence(root))
    || (delivery && delivery.sha256 !== (await treeIdentity(root, ['dist-next'])).sha256))
    knownGaps.push('R33: source, client, oracle or delivery changed while writing the ledger.');
  const report = { schema: 3, generatedAt: new Date().toISOString(), runId, evidence: current, delivery,
    run: folder ? path.relative(root, path.join(folder, 'run.json')) : null, build: { modules, totals }, tests, parity,
    visual: parity.visual, renderCommands: parity.renderCommands,
    browserScope: 'Chromium desktop/retina/touch; Firefox/WebKit/physical devices are non-goals (R23).',
    passed: knownGaps.length === 0, knownGaps };
  if (folder) await atomicJson(path.join(folder, 'current-verification.json'), report);
  await atomicJson(path.resolve(root, output), report);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), index = args.indexOf('--out');
  if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith('--'))) throw new Error('--out requires a file');
  const report = await writeCurrentVerification({ output: index >= 0 ? args[index + 1] : undefined });
  console.log(JSON.stringify({ runId: report.runId, passed: report.passed, tests: report.tests, knownGaps: report.knownGaps }, null, 2));
  if (args.includes('--strict') && !report.passed) process.exitCode = 1;
}
