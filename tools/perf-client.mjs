#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { evidence,newRunId,sameEvidence,treeIdentity } from './verification-evidence.mjs';
import { atomicJson,assertVerificationOwner } from './verification/io.mjs';
import { browserWorkloads } from './performance/browser.mjs';
import { machine, artifact } from './performance/common.mjs';
import { rendererAcceptance } from './performance/acceptance.mjs';
await assertVerificationOwner();
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const root=path.resolve(option('--root','dist-next')),frames=Number(option('--frames','600')),repeats=Number(option('--repeats','5'));
if(!Number.isInteger(frames)||frames<60||!Number.isInteger(repeats)||repeats<5)throw new Error('frames >=60 and repetitions >=5 required');
const before=await evidence(),target=await treeIdentity(root,['.']),runId=process.env.VERIFY_RUN_ID??newRunId();
const manifest=JSON.parse(await readFile(path.join(root,'build-manifest.json'),'utf8'));
const sourceMatchesDelivery=manifest.inputs?.sha256===before.source.sha256;
const result=await browserWorkloads({root,frames,repeats,profiles:args.includes('--desktop-only')?['desktop']:undefined});
const stable=sameEvidence(before,await evidence())&&target.sha256===(await treeIdentity(root,['.'])).sha256;
const primary=result.results.find(r=>r.profile==='desktop'&&r.scenario==='moving-camera'),sample=primary.runs[0];
const acceptance=rendererAcceptance(result,{frames,repeats});
const report={schema:4,runId,kind:'renderer-performance',evidence:before,target,machine:machine(),configuration:{frames,repeats,warmupFrames:60},drivers:await Promise.all(['tools/performance/browser.mjs','tools/performance/common.mjs','tools/performance/acceptance.mjs','build/client/dev/test-api.js'].map(artifact)),...result,stable,sourceMatchesDelivery,...acceptance,
 frameMs:sample.frameMs,frames,fps:1000/sample.frameMs.mean,entities:sample.totalEntities,drawFrames:sample.drawFrames,
 budget:{fps:55,rafP95Ms:20,renderCpuP95Ms:8,strictMaxMs:50},
 passed:stable&&sourceMatchesDelivery&&acceptance.passed};
const output=option('--out',`reports/performance/client/${runId}.json`);await atomicJson(output,report);await atomicJson('reports/perf.json',report);console.log(JSON.stringify({output,passed:report.passed},null,2));if(!report.passed)process.exitCode=1;
