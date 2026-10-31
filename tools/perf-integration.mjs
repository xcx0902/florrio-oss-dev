#!/usr/bin/env node
/** Real browser -> product Worker/WASM -> decoder -> receiver -> Canvas. */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { evidence,newRunId,sameEvidence,treeIdentity } from './verification-evidence.mjs';
import { atomicJson,assertVerificationOwner } from './verification/io.mjs';
import { browserWorkloads } from './performance/browser.mjs';
import { distribution,machine,artifact } from './performance/common.mjs';
import { completedSteps, integrationAcceptance } from './performance/acceptance.mjs';
await assertVerificationOwner();
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const root=path.resolve(option('--root','dist-next')),frames=Number(option('--frames','600')),repeats=Number(option('--repeats','5'));
if(!Number.isInteger(frames)||frames<60||!Number.isInteger(repeats)||repeats<5)throw new Error('frames >=60 and repetitions >=5 required');
const before=await evidence(),target=await treeIdentity(root,['.']),runId=process.env.VERIFY_RUN_ID??newRunId();
const manifest=JSON.parse(await readFile(path.join(root,'build-manifest.json'),'utf8'));
const sourceMatchesDelivery=manifest.inputs?.sha256===before.source.sha256;
const result=await browserWorkloads({root,frames,repeats,integration:true,profiles:args.includes('--all-profiles')?undefined:['desktop']});
for(const scenario of result.results)for(const run of scenario.runs){
  const steps=completedSteps(run.requests);
  const workers=run.requests.filter(r=>r.worker);
  const d=a=>a.length?distribution(a):null;
  run.stepRoundTripMs=d(steps.durations);run.workerThinkMs=d(workers.map(r=>r.worker.thinkMs).filter(Number.isFinite));
  run.inputToWorkerMs=d(workers.map(r=>r.worker.receivedAt-r.sentAt).filter(n=>Number.isFinite(n)&&n>=0));
  run.workerToMainMs=d(workers.map(r=>r.receivedAt-r.worker.completedAt).filter(n=>Number.isFinite(n)&&n>=0));
  run.decodeApplyMs=d(run.decode.map((n,i)=>n+(run.apply[i]??0)));
  run.messagesPerCompletedStep=steps.requestCount/steps.durations.length;
  run.completedStepRequests=steps.requestCount;run.boundaryRequests=steps.boundaryRequests;
  run.pendingMax=Math.max(0,...run.requests.map(r=>r.pending));
}
const stable=sameEvidence(before,await evidence())&&target.sha256===(await treeIdentity(root,['.'])).sha256;
const acceptance=integrationAcceptance(result,{frames,repeats});
const report={schema:4,runId,kind:'integration-performance',evidence:before,target,machine:machine(),configuration:{frames,repeats,warmupFrames:60,fixedStepMs:50,worker:'real product manual clock; default population; trusted input plus real suicide/respawn'},drivers:await Promise.all(['tools/performance/browser.mjs','tools/performance/common.mjs','tools/performance/acceptance.mjs','build/client/dev/test-api.js'].map(artifact)),...result,stable,sourceMatchesDelivery,...acceptance,
 budget:{renderCpuP95Ms:8,decodeApplyP95Ms:2,pendingStepMax:1},passed:stable&&sourceMatchesDelivery&&acceptance.passed};
const output=option('--out',`reports/performance/integration/${runId}.json`);await atomicJson(output,report);await atomicJson('reports/perf-integration.json',report);
console.log(JSON.stringify({output,passed:report.passed},null,2));if(!report.passed)process.exitCode=1;
