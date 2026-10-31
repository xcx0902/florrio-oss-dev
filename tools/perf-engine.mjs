#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { evidence,newRunId,sameEvidence } from './verification-evidence.mjs';
import { atomicJson,assertVerificationOwner } from './verification/io.mjs';
import { distribution,machine,execute,artifact,scenarios } from './performance/common.mjs';
await assertVerificationOwner();
const args=process.argv.slice(2), option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const repeats=Number(option('--repeats','5'));
if(!Number.isInteger(repeats)||repeats<5) throw new Error('At least five repetitions are required');
const runId=process.env.VERIFY_RUN_ID??newRunId(), before=await evidence();
if(!args.includes('--no-build')) {
  for(const [cmd,a] of [['cmake',['-S','engine','-B','build/engine','-DCMAKE_BUILD_TYPE=Release']],['cmake',['--build','build/engine','--target','engine_benchmark','-j','6']],['emcmake',['cmake','-S','engine','-B','build/perf-wasm','-DCMAKE_BUILD_TYPE=Release']],['cmake',['--build','build/perf-wasm','--target','engine_benchmark','-j','6']]])
    await execute(cmd,a,{env:{...process.env,EM_CACHE:path.resolve('.emcache')}});
}
const results=[], binaries={native:option('--native','build/engine/engine_benchmark'),wasm:option('--wasm','build/perf-wasm/engine_benchmark.cjs')};
const binaryFiles=[binaries.native,binaries.wasm,binaries.wasm.replace(/\.cjs$/,'.wasm')];
const artifacts=await Promise.all(binaryFiles.map(artifact));
for(const [runtime,file] of Object.entries(binaries)) for(const scenario of scenarios) {
  const runs=[];
  for(let repeat=0;repeat<repeats;repeat++) {
    const r=JSON.parse(await execute(runtime==='native'?path.resolve(file):process.execPath,runtime==='native'?[scenario]:[file,scenario]));
    runs.push({...r,timing:distribution(r.samplesMs),phaseTiming:Object.fromEntries(Object.entries(r.phaseSamplesMs??{}).filter(([,samples])=>samples.length).map(([name,samples])=>[name,distribution(samples)]))});
  }
  if(new Set(runs.map(r=>r.digest)).size!==1) throw new Error(`Nondeterministic ${runtime}/${scenario}`);
  results.push({runtime,scenario,runs,median:distribution(runs.map(r=>r.timing.p50)).p50,p95Median:distribution(runs.map(r=>r.timing.p95)).p50,
    budget:runtime==='wasm'&&['idle-world','moving-combat'].includes(scenario)?{p95Ms:10,p99Ms:20,met:runs.every(r=>r.timing.p95<=10&&r.timing.p99<=20)}:null});
  console.log(`${runtime}/${scenario}: median ${results.at(-1).median.toFixed(3)} ms`);
}
const compare=option('--compare',null), baseline=compare?JSON.parse(await readFile(compare,'utf8')):null;
const comparisons=baseline?results.map(r=>{
  const old=baseline.results.find(b=>b.runtime===r.runtime&&b.scenario===r.scenario);
  if(!old) throw new Error('Missing baseline scenario');
  return {runtime:r.runtime,scenario:r.scenario,identical:r.runs[0].digest===old.runs[0].digest&&r.runs[0].snapshotBytes===old.runs[0].snapshotBytes,
    medianChangePercent:(r.median/old.median-1)*100,p95ChangePercent:(r.p95Median/old.p95Median-1)*100,beforeCounters:old.runs[0].counters,afterCounters:r.runs[0].counters};
}):[];
const finalArtifacts=await Promise.all(binaryFiles.map(artifact));
const stable=sameEvidence(before,await evidence())&&artifacts.every((a,i)=>a.sha256===finalArtifacts[i].sha256);
const completed=stable&&comparisons.every(c=>c.identical)&&results.every(r=>r.runs.every(n=>n.entities>0&&n.queueEnd===0));
const report={schema:4,runId,kind:'engine-performance',machine:machine(),evidence:before,configuration:{repeats,warmupTicks:200,ticks:2000,soakTicks:10000,fixedStepMs:50,compiler:await execute('c++',['--version']),emscripten:await execute('em++',['--version']),flags:'Release; -ffp-contract=off -fno-fast-math; ENGINE_PERF (separate library)'},drivers:await Promise.all(['tools/perf-engine.mjs','tools/performance/common.mjs','engine/tests/perf/benchmark.cpp','engine/include/engine/core/perf.hpp'].map(artifact)),binaries:artifacts,results,comparisons,stable,completed,passed:completed&&results.every(r=>r.budget?.met!==false)};
const output=option('--out',`reports/performance/engine/${runId}.json`);await atomicJson(output,report);await atomicJson('reports/perf-engine.json',report);
console.log(JSON.stringify({output,passed:report.passed,comparisons},null,2));if(!report.passed)process.exitCode=1;
