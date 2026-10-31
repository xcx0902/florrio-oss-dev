import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { buildInputs, verificationInputs } from '../../tools/lib/identity.mjs';
import { releaseEvidence } from '../../tools/verification/release.mjs';
import { gates, gatesPassed } from '../../tools/verification/gates.mjs';
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'florr-structure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ['engine/src', 'archive', 'tests', 'reports', 'tools', 'client/src']) await mkdir(path.join(root, folder), { recursive: true });
  await writeFile(path.join(root, 'engine/src/live.cpp'), '// product');
  return root;
}
test('build identity excludes tests, archived oracles and reports; verification includes current tests', async t => {
  const root = await fixture(t), before = await buildInputs(root), verification = await verificationInputs(root);
  await writeFile(path.join(root, 'archive/oracle.wasm'), 'old bytes');
  await writeFile(path.join(root, 'reports/old.json'), 'old reports');
  await writeFile(path.join(root, 'tests/live.test.mjs'), 'test');
  assert.equal((await buildInputs(root)).sha256, before.sha256);
  assert.notEqual((await verificationInputs(root)).sha256, verification.sha256);
  await writeFile(path.join(root, 'engine/src/live.cpp'), '// changed product');
  assert.notEqual((await buildInputs(root)).sha256, before.sha256);
});
test('undeclared symbolic links in product input fail without following them', async t => {
  const root = await fixture(t); await symlink('../../archive', path.join(root, 'engine/src/link'));
  await assert.rejects(buildInputs(root), /symlink/);
});
test('release rejects uncompleted or inherited successful ledgers', async t => {
  const root = await fixture(t);
  for (const report of [{ passed: true }, { schema: 5, passed: true, stable: true, finishedAt: new Date().toISOString(), steps: [] }]) {
    await writeFile(path.join(root, 'reports/current-verification.json'), JSON.stringify(report));
    await assert.rejects(releaseEvidence(root), /completed, passed current verification/);
  }
});
test('one gate table rejects omitted, reordered and unhashed results', () => {
  const steps = gates.map(gate => ({ name: gate.name, exitCode: 0, finishedAt: 'now', logSha256: 'a'.repeat(64) }));
  assert.ok(gatesPassed(steps)); assert.equal(gatesPassed(steps.slice(1)), false);
  const swapped = [...steps]; [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  assert.equal(gatesPassed(swapped), false);
  assert.equal(gatesPassed(steps.map((step, i) => i === 3 ? { ...step, exitCode: 1 } : step)), false);
  assert.equal(gatesPassed(steps.map((step, i) => i === 3 ? { ...step, logSha256: 'abc' } : step)), false);
});


test('performance distributions preserve raw samples and expose tail latency; invalid samples fail', async () => {
  const {distribution,scenarios}=await import('../../tools/performance/common.mjs');
  const raw=Array.from({length:100},(_,i)=>100-i),copy=[...raw];
  assert.deepEqual(distribution(raw),{count:100,mean:50.5,p50:51,p95:96,p99:100,max:100});
  assert.deepEqual(raw,copy);
  for(const values of [[],[NaN],[Infinity],[-1]])assert.throws(()=>distribution(values),/Invalid performance/);
  assert.equal(new Set(scenarios).size,9);
  assert.ok(scenarios.includes('lifecycle-soak'));
});


test('expanded renderer workload has a gate deadline above its 60 repetitions and browser regressions',()=>{
  const gate=gates.find(g=>g.script==='tools/browser-products.mjs');
  assert.ok(gate.timeoutMs>(60*(600+60)/60+90)*1000);
});

test('renderer completion cannot substitute a short/partial sample or ignore CPU budgets', async () => {
  const {rendererAcceptance,rendererScenarios}=await import('../../tools/performance/acceptance.mjs');
  const run={frames:600,drawFrames:600,totalEntities:872,cpu:Array(600).fill(1),intervals:Array(600).fill(16.7),frameMs:{p95:17,mean:16.7},renderCpuMs:{p95:4}};
  const result={errors:[],results:['desktop','retina','touch'].flatMap(profile=>rendererScenarios.map(scenario=>({profile,scenario,runs:Array.from({length:5},()=>({...run}))})))};
  assert.equal(rendererAcceptance(result,{frames:600,repeats:5}).passed,true);
  assert.equal(rendererAcceptance(result,{frames:120,repeats:5}).passed,false);
  assert.equal(rendererAcceptance({...result,results:result.results.slice(0,4)},{frames:600,repeats:5}).passed,false);
  result.results.at(-1).runs[0].renderCpuMs={p95:9};
  assert.equal(rendererAcceptance(result,{frames:600,repeats:5}).budgetMet,false);
});

test('integration acceptance checks decode/render tails and completed pending cleanup', async () => {
  const {integrationAcceptance}=await import('../../tools/performance/acceptance.mjs');
  const run={frames:600,totalEntities:25,packets:200,decode:[1],stepRoundTripMs:{count:200},lifecycle:{equipment:true,died:true,respawned:true,pending:0},renderCpuMs:{p95:1},decodeApplyMs:{p95:1},pendingMax:1};
  const result={errors:[],results:[{profile:'desktop',runs:Array.from({length:5},()=>({...run}))}]};
  assert.equal(integrationAcceptance(result,{frames:600,repeats:5}).passed,true);
  for(const patch of [{decodeApplyMs:{p95:3}},{renderCpuMs:{p95:9}},{pendingMax:2},{lifecycle:{...run.lifecycle,pending:1}}]) {
    const invalid={...result,results:[{profile:'desktop',runs:[{...run,...patch},...result.results[0].runs.slice(1)]}]};
    assert.equal(integrationAcceptance(invalid,{frames:600,repeats:5}).passed,false);
  }
});

test('step timing and request counts exclude partial sampling boundaries', async () => {
  const {completedSteps}=await import('../../tools/performance/acceptance.mjs');
  assert.deepEqual(completedSteps([
    {func:'step',at:1,duration:3}, {func:'step',at:51,duration:4}, {func:'step',at:101},
  ]),{durations:[3,4],requestCount:2,boundaryRequests:1});
  assert.deepEqual(completedSteps([
    {func:'sp_server_flush',at:0,duration:1},
    {func:'sp_server_send',at:10,duration:1},{func:'sp_server_think',at:11,duration:5},{func:'sp_server_flush',at:16,duration:2},
    {func:'sp_server_send',at:60,duration:1},{func:'sp_server_think',at:61},
  ]),{durations:[8],requestCount:3,boundaryRequests:3});
});

test('M4 acceptance publishes failure instead of inheriting an old passed summary', async t => {
  const root=await fixture(t), reportFile=path.join(root,'reports/performance/m4-acceptance.json');
  await mkdir(path.dirname(reportFile),{recursive:true});
  await writeFile(reportFile,JSON.stringify({passed:true,status:'passed'}));
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../tools/performance/verify.mjs',import.meta.url))],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,1);
  const report=JSON.parse(await readFile(reportFile,'utf8'));
  assert.equal(report.passed,false);assert.equal(report.status,'failed');
  assert.ok(report.startedAt&&report.finishedAt&&report.runId);
  assert.match(report.error,/ENOENT/);
});
