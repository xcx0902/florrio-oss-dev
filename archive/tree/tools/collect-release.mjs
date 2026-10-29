import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { verifyArchiveRehearsal, verifyRehearsalTimestamp } from './verification/release-rehearsal.mjs';

// Aggregate only completed bound acceptance runs and actual archive operations.
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const moduleAt = p => pathToFileURL(path.join(root, p)).href;
const { evidence, sameEvidence, sha256, treeIdentity } = await import(moduleAt('tools/verification-evidence.mjs'));
const { requiredSteps, assessReport } = await import(moduleAt('tools/verification/gates.mjs'));
const { parseTap } = await import(moduleAt('tools/verification/tap.mjs'));
const readJson = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const args = process.argv.slice(2);
const historyIndex = args.indexOf('--history');
const historyRoot = path.resolve(historyIndex < 0 ? '/tmp/florr-release-archive' : args[historyIndex + 1]);
if (historyIndex >= 0) args.splice(historyIndex, 2);
const ids = args;
assert.equal(ids.length, 3, 'requires two pre-move IDs and the post-move ID');
assert.equal(new Set(ids).size, 3);
const current = await evidence();
const latest = await readJson('reports/latest-run.json');
assert.equal(latest.runId, ids[2]);
const summaries = [];
const nativeTargets = JSON.parse(execFileSync('ctest', ['--test-dir', 'build/engine', '--show-only=json-v1'],
  { encoding:'utf8' })).tests.map(test => test.name).sort();
assert.equal(new Set(nativeTargets).size, nativeTargets.length);
assert.ok(['engine_tests','engine_sim_tests','engine_peer_visibility_tests',
  'engine_schema_contracts','engine_schema_contracts_checker'].every(name => nativeTargets.includes(name)),
  'required native and schema targets must be registered');
let finalArtifacts;
for (const [index, id] of ids.entries()) {
  assert.match(id, /^[0-9A-Za-zT.:-]+$/);
  const folder = path.join('reports/runs', id);
  const run = await readJson(path.join(folder, 'run.json'));
  const ledger = await readJson(path.join(folder, 'current-verification.json'));
  assert.equal(run.passed, true); assert.equal(run.stable, true); assert.ok(run.finishedAt);
  assert.equal(ledger.passed, true); assert.deepEqual(ledger.knownGaps, []);
  assert.equal(run.runId, id); assert.equal(ledger.runId, id);
  assert.ok(sameEvidence(run.evidence, current)); assert.ok(sameEvidence(ledger.evidence, current));
  assert.deepEqual(run.steps.map(s => s.name), [...requiredSteps, 'ledger']);
  assert.ok(run.steps.every(s => s.exitCode === 0 && s.finishedAt && !s.error && !s.signal));
  const artifacts = {};
  for (const step of run.steps) for (const [name, snapshot] of Object.entries(step.reports ?? {})) {
    assert.ok(snapshot.path && !snapshot.error);
    const bytes = await fs.readFile(path.join(folder, snapshot.path));
    assert.equal(sha256(bytes), snapshot.sha256);
    artifacts[name] = JSON.parse(bytes);
  }
  for (const [name, result] of Object.entries(ledger.tests)) {
    const bytes = await fs.readFile(path.join(root, result.recording));
    assert.equal(sha256(bytes), result.sha256);
    assert.equal(parseTap(bytes.toString('utf8')).status, 'pass');
    assert.equal(result.status, 'pass');
  }
  for (const [name, result] of Object.entries(ledger.parity)) {
    assert.equal(result.passed, true, name);
    assert.equal(assessReport(name, artifacts[name], current, {runId:id,delivery:run.delivery}).passed, true, name);
  }
  const compactTests = Object.fromEntries(Object.entries(ledger.tests).map(([name, x]) =>
    [name, { total: x.total, passed: x.passed, failed: x.failed, status: x.status }]));
  summaries.push({ runId: id, phase: index < 2 ? 'pre-move' : 'post-move', startedAt: run.startedAt,
    finishedAt: run.finishedAt, evidence: run.evidence, delivery: run.delivery,
    steps: run.steps.map(s => ({ name: s.name, exitCode: s.exitCode })), tests: compactTests,
    nativeSuites: { targets: nativeTargets, passed: true },
    performance: { frames: artifacts.performance.frames, entities: artifacts.performance.entities,
      fps: artifacts.performance.fps, frameMs: artifacts.performance.frameMs, heap: artifacts.performance.heap },
    ledger: path.join(folder, 'current-verification.json'), run: path.join(folder, 'run.json') });
  if (index === 2) finalArtifacts = artifacts;
}
assert.ok(Date.parse(summaries[0].finishedAt) <= Date.parse(summaries[1].startedAt));
assert.ok(Date.parse(summaries[1].finishedAt) <= Date.parse(summaries[2].startedAt));
assert.equal(latest.delivery.sha256, (await treeIdentity(root, ['dist-next'])).sha256);
assert.ok(summaries.every(s => s.delivery.wasmSha256 === latest.delivery.wasmSha256));

async function archiveTree(directory) {
  const hash = createHash('sha256'); let files = 0, bytes = 0;
  async function visit(folder, prefix = '') {
    for (const entry of (await fs.readdir(folder, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      if (entry.name === '.DS_Store') continue;
      const rel = path.posix.join(prefix, entry.name), full = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(full, rel);
      else { assert.ok(entry.isFile(), `unexpected archived entry ${rel}`); const body = await fs.readFile(full);
        hash.update(rel).update('\0').update(body); files++; bytes += body.length; }
    }
  }
  await visit(directory); return { files, bytes, sha256: hash.digest('hex') };
}
const manifest = await readJson('legacy/archive-manifest.json');
const journal = await readJson('legacy/archive-operation.json');
assert.equal(manifest.mode, 'move'); assert.equal(journal.state, 'complete');
assert.equal(manifest.compatibilityLinks, true);
assert.deepEqual(manifest.sources.map(x=>x.source), ['source/game','source/javascript','source/wasm','web','upstream','reports']);
const archiveChecks = [];
for (const entry of manifest.sources) {
  assert.ok((await fs.lstat(entry.source)).isSymbolicLink());
  const real = await fs.realpath(entry.source), target = path.join(root, 'legacy', entry.source);
  assert.equal(real, target); assert.ok((await fs.lstat(target)).isDirectory());
  const actual = await archiveTree(target);
  if (entry.source !== 'reports') for (const key of ['files','bytes','sha256']) assert.equal(actual[key], entry[key]);
  else {
    const policy = entry.reportPolicy; assert.equal(policy.schema, 1);
    assert.equal(sha256(JSON.stringify(policy.immutableFiles)), policy.sha256);
    for (const file of policy.immutableFiles) {
      const body = await fs.readFile(path.join(target, file.path));
      assert.equal(body.length, file.bytes, file.path); assert.equal(sha256(body), file.sha256, file.path);
    }
  }
  archiveChecks.push({ source: entry.source, realDirectory: path.relative(root, real), compatibilityLink: true,
    inventoryAtMove: { files:entry.files,bytes:entry.bytes,sha256:entry.sha256 }, actualAtVerification: actual,
    immutableFilesVerified: entry.reportPolicy?.immutableFiles.length ?? null });
}
assert.equal(manifest.dependencyBridges.length, 2);
for (const bridge of manifest.dependencyBridges) {
  assert.ok((await fs.lstat(bridge.path)).isSymbolicLink());
  assert.equal(await fs.realpath(bridge.path), path.join(root, bridge.target));
  const actual = await archiveTree(bridge.target);
  for (const key of ['files','bytes','sha256']) assert.equal(actual[key], bridge[key]);
}
assert.ok(!existsSync('reports/verification.lock'));
assert.ok(!existsSync('legacy/.archive.lock'));
assert.ok(!(await fs.readdir('legacy')).some(x=>x.startsWith('.archive-transaction-')));
const operationNames = ['01-copy.json','02-move.json','04-restore.json','06-copy.json','07-final-move.json'];
const operations = [];
for (const [index, name] of operationNames.entries()) {
  const operation = await readJson(path.join(historyRoot,name));
  assert.equal(operation.mode, ['copy','move','restore','copy','move'][index]);
  assert.ok(Number.isFinite(Date.parse(operation.generatedAt)));
  if (index) assert.ok(Date.parse(operations.at(-1).generatedAt) <= Date.parse(operation.generatedAt));
  operations.push(operation);
}
assert.ok(Date.parse(summaries[1].finishedAt) <= Date.parse(operations[0].generatedAt));
assert.ok(Date.parse(operations.at(-1).generatedAt) <= Date.parse(summaries[2].startedAt));
assert.deepEqual(operations.at(-1),manifest);
const referenceManifest = await fs.readFile('reference/manifest.json');
const rehearsalVerification = await verifyArchiveRehearsal({ historyRoot, evidence: current,
  deliverySha256: summaries[1].delivery.sha256, reference: JSON.parse(referenceManifest),
  referenceSha256: sha256(referenceManifest),
  intervals: [{ prefix:'03-moved',lower:operations[1],upper:operations[2] },
    { prefix:'05-restored',lower:operations[2],upper:operations[3] }] });
const restoredPaths = await readJson(path.join(historyRoot,'04-restored-paths.json'));
verifyRehearsalTimestamp(restoredPaths.generatedAt, { lower:operations[2], upper:operations[3] });
assert.ok(restoredPaths.sources.every(x=>x.realDirectory && !x.symlink));
assert.deepEqual(restoredPaths.sources.map(x=>x.path),manifest.sources.map(x=>x.source));
assert.equal(restoredPaths.bridgesRemoved,true); assert.equal(restoredPaths.noLocks,true);
const historyFiles = (await fs.readdir(historyRoot)).sort();
const history = [];
await fs.mkdir('reports/release-rehearsal', {recursive:true});
for (const name of historyFiles) {
  const body = await fs.readFile(path.join(historyRoot,name));
  await fs.writeFile(path.join('reports/release-rehearsal',name), body);
  history.push({ file:path.join('reports/release-rehearsal',name),bytes:body.length,sha256:sha256(body) });
}
const buildManifest = await readJson('dist-next/build-manifest.json');
const visual = finalArtifacts.visual, commands = finalArtifacts.renderCommands;
const report = {
  schema:1, generatedAt:new Date().toISOString(), localAcceptancePassed:true,
  remoteCi:{executed:false,reason:'This checkout has no .git directory or configured remote; no remote Ubuntu CI result is claimed.'},
  runs:summaries, evidence:{...current,runId:ids[2]}, delivery:{...latest.delivery,
    artifactsSha256:buildManifest.artifactsSha256, totals:buildManifest.totals,
    serverWasmBytes:(await fs.stat('dist-next/server.wasm')).size, compilerVersion:buildManifest.engineBuild.compilerVersion},
  strictEngine:{passed:finalArtifacts.engineState.strictPassed,scenarios:finalArtifacts.engineState.scenarios.length},
  soak:{passed:finalArtifacts.engineSoak.strictPassed,ticks:finalArtifacts.engineSoak.soakTicks,
    scenarios:finalArtifacts.engineSoak.scenarios.map(x=>({name:x.scenario,ticks:x.ticks,mismatchedTicks:x.mismatchedTicks}))},
  hornet:{passed:finalArtifacts.hornet.passed,fixtures:finalArtifacts.hornet.fixtures.map(x=>({name:x.name,passed:x.passed}))},
  canvas:{passed:commands.passed,tolerance:commands.tolerance,scenarios:commands.scenarios.map(x=>({name:x.scenario,
    frames:x.comparedFrames,expectedOps:x.expectedOps,actualOps:x.actualOps,issueCount:x.issueCount}))},
  pixels:{passed:visual.passed,thresholds:visual.thresholds,scenarios:visual.scenarios.map(x=>({name:x.name??x.scenario,
    changed:x.changed,pixels:x.pixels,ratio:x.ratio,max:x.max,passed:x.passed}))},
  originalClient:{passed:finalArtifacts.originalEngine.passed,kind:finalArtifacts.originalEngine.kind,
    equivalence:finalArtifacts.originalEngine.equivalence,engineRoot:finalArtifacts.originalEngine.engineRoot,
    wasmSha256:finalArtifacts.originalEngine.engineWasmSha256,scenarios:finalArtifacts.originalEngine.scenarios.map(row=>({
      name:row.scenario,passed:row.passed,checks:row.checks,gamePaint:row.canvas.gamePaint,lifecycle:row.lifecycle,
      deviations:row.deviations,maxSequence:Math.max(...row.samples.map(sample=>sample.sequence))}))},
  production:{passed:finalArtifacts.production.integrationPassed,recordings:finalArtifacts.production.scenarios.reduce((n,x)=>n+x.profiles.length,0),
    root:finalArtifacts.production.root},
  archive:{mode:manifest.mode,generatedAt:manifest.generatedAt,manifest:'legacy/archive-manifest.json',
    manifestSha256:sha256(await fs.readFile('legacy/archive-manifest.json')),sources:archiveChecks,
    dependencyBridges:manifest.dependencyBridges,restoreRehearsal:true,postMoveFullAcceptance:true,rehearsalVerification,history},
  noActiveLocks:true,knownLocalGaps:[]
};
await fs.writeFile('reports/release-acceptance.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({written:'reports/release-acceptance.json',runs:ids,localAcceptancePassed:true,
  tests:summaries[2].tests,canvas:report.canvas,pixels:report.pixels,production:report.production,
  originalClient:report.originalClient,delivery:report.delivery,remoteCi:report.remoteCi},null,2));
