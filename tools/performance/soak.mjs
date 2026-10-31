#!/usr/bin/env node
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {startTestServer} from '../lib/test-server.mjs';
import {launchBrowser} from '../lib/browser-harness.mjs';
import {treeIdentity} from '../lib/identity.mjs';
import {atomicJson} from '../verification/io.mjs';
import {machine,artifact} from './common.mjs';
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const minutes=Number(option('--minutes','30')),root=path.resolve(option('--root','dist-next'));
if(!Number.isFinite(minutes)||minutes<30)throw new Error('The resource soak requires at least 30 real minutes');
const target=await treeIdentity(root,['.']),manifest=JSON.parse(await readFile(path.join(root,'build-manifest.json'),'utf8'));
const diagnostics=await artifact('build/client/dev/test-api.js');
const fixture=await startTestServer(root,{diagnostics:true}),browser=await launchBrowser({args:['--no-first-run','--disable-background-networking','--enable-precise-memory-info']});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('recordResourceSample',async sample=>{
    await atomicJson('reports/performance/client/resource-soak-progress.json',{startedAt,root,source:manifest.inputs,sample});
    console.log(JSON.stringify({elapsedMs:sample.elapsedMs,created:sample.created,frames:sample.frames,resources:sample.resources,heap:sample.heap}));
  });
  const startedAt=new Date().toISOString();
  await page.goto(fixture.origin+'/?test=1');await page.waitForFunction(()=>window.__florr&&document.fonts.status==='loaded');
  const result=await page.evaluate(async minutes=>{
    const f=window.__florr;f.freeze();
    const player={handle:1,typeId:1,kind:1,speciesId:0,x:0,y:0,angle:0,health:100,maxHealth:100,healthKnown:true,maxHealthKnown:true,level:1,flags:1};
    f.setSnapshot([player]);const start=performance.now(),samples=[];let cycles=0,created=0,frames=0,rendering=true;
    const countFrame=()=>{++frames;if(rendering)requestAnimationFrame(countFrame);};requestAnimationFrame(countFrame);
    while(performance.now()-start<minutes*60000) {
      const entities=[player];
      for(let i=0;i<100;i++)entities.push({handle:1000+cycles*100+i,typeId:i%35+1,kind:4,speciesId:i%35+1,x:i%20*45-450,y:Math.floor(i/20)*45-90,angle:0,health:0,maxHealth:0,flags:128});
      f.setSnapshotAt(entities,performance.now());created+=100;
      f.setCamera(Math.cos(cycles*.3)*250,Math.sin(cycles*.3)*100);
      await new Promise(resolve=>setTimeout(resolve,1000));
      if(cycles%10===0) {
        const sample={elapsedMs:performance.now()-start,created,frames,heap:performance.memory?.usedJSHeapSize??null,...f.performanceState()};
        samples.push(sample);await window.recordResourceSample(sample);
      }
      cycles++;
    }
    f.setSnapshotAt([player],performance.now());for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
    rendering=false;
    return {durationMs:performance.now()-start,cycles,created,frames,samples,final:f.performanceState(),heap:performance.memory?.usedJSHeapSize??null};
  },minutes);
  const stable=target.sha256===(await treeIdentity(root,['.'])).sha256&&diagnostics.sha256===(await artifact(diagnostics.path)).sha256;
  const bounded=s=>s.resources.labels<=1024&&s.resources.measurements<=4096&&s.resources.owners<=4096&&s.resources.rasterBytes<=32*1024*1024&&s.resources.paths<=1024&&s.resources.layouts<=1024&&s.pending<=1;
  const report={kind:'renderer-resource-soak',startedAt,finishedAt:new Date().toISOString(),machine:machine(),browser:browser.version(),target,source:manifest.inputs,diagnostics,drivers:await Promise.all(['tools/performance/soak.mjs','tools/performance/common.mjs'].map(artifact)),stable,errors,...result,
    passed:stable&&!errors.length&&result.durationMs>=minutes*60000&&result.created>=10000&&result.frames>=minutes*60*30&&result.samples.length>=minutes*5&&result.samples.every(bounded)&&bounded(result.final)&&result.final.resources.owners<=32&&result.final.visuals.drops===0};
  await atomicJson(option('--out','reports/performance/client/resource-soak.json'),report);console.log(JSON.stringify({passed:report.passed,created:result.created,durationMs:result.durationMs,final:result.final}));if(!report.passed)process.exitCode=1;
} finally {await browser.close();await fixture.close();}
