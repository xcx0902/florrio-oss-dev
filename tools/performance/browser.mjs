import { startTestServer } from '../lib/test-server.mjs';
import { launchBrowser, browserProfiles } from '../lib/browser-harness.mjs';
import { distribution } from './common.mjs';
// Installed identically for before/after. CPU samples include the actual app
// callback; benchmark's own rAF waiters do not clear the product canvas.
export function instrumentation() {
  const stats = window.__metrics = { draws:0, canvasOps:0, cpu:[], requests:[], packets:0, bytes:0, decode:[], apply:[], scans:0, cullingScans:0, sorts:0, longTasks:[] };
  const clear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect=function(...a) { if(this.canvas.id==='canvas')stats.draws++;return clear.apply(this,a); };
  for(const method of ['drawImage','fill','stroke','fillRect','strokeText','fillText','measureText','setTransform']) {
    const original=CanvasRenderingContext2D.prototype[method];
    CanvasRenderingContext2D.prototype[method]=function(...args) { stats.canvasOps++;return original.apply(this,args); };
  }
  const raf=window.requestAnimationFrame;
  window.requestAnimationFrame=callback=>raf.call(window,time=>{
    const start=performance.now(),draws=stats.draws;callback(time);
    if(stats.draws===draws)return;
    stats.cpu.push(performance.now()-start);
    const state=window.__florr?.performanceState?.();
    if(state)stats.cullingScans+=Math.max(0,state.frame.worldScans-state.frame.sorts);
  });
  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker {
    constructor(url,options) {
      const target=new URL(url,location.href);target.searchParams.set('perf','1');super(target,options);
      const inflight=new Map();
      this.addEventListener('message',event=>{
        const r=event.data, request=inflight.get(r.callbackId);
        if(r.data?.byteLength) {stats.packets++;stats.bytes+=r.data.byteLength;}
        if(request&&r.finalResponse) {request.duration=performance.now()-request.at;request.receivedAt=performance.timeOrigin+performance.now();request.worker=r.timing;inflight.delete(r.callbackId);}
      });
      const post=this.postMessage.bind(this);
      this.postMessage=(request,transfer)=>{
        const record={func:request.funcName,at:performance.now(),sentAt:performance.timeOrigin+performance.now(),pending:inflight.size+1};stats.requests.push(record);inflight.set(request.callbackId,record);
        return post(request,transfer??[]);
      };
    }
  };
  try {new PerformanceObserver(list=>{for(const e of list.getEntries())stats.longTasks.push(e.duration);}).observe({entryTypes:['longtask']});}catch{}
}
async function prepare(page,origin) {
  await page.addInitScript(instrumentation);
  await page.addInitScript(()=>{localStorage.setItem('florr-menu',JSON.stringify({mobs:Array.from({length:40},(_,i)=>i+1),petals:Array.from({length:40},(_,i)=>i+1)}));});
  await page.goto(origin+'/index.html?test=1',{waitUntil:'load'});
  await page.waitForFunction(()=>window.__florr&&document.fonts.status==='loaded');
  await page.evaluate(async()=>{
    const m=window.__metrics,w=window.__florr.world;
    const {playerLoadoutSlots}=await import('/state/snapshot-projection.js');
    window.__performanceLoadout=()=>playerLoadoutSlots(w.healthyPlayer());
    for(const key of ['all','renderable']) {const old=w[key].bind(w);w[key]=function*(...args){m.scans++;yield*old(...args);};}
    const {SnapshotDecoder}=await import('/net/snapshot-decoder.js');
    const old=SnapshotDecoder.prototype.decode;SnapshotDecoder.prototype.decode=function(...args){const at=performance.now();try{return old.apply(this,args);}finally{m.decode.push(performance.now()-at);}};
    const apply=w.applyDeltaSnapshot.bind(w);w.applyDeltaSnapshot=(...args)=>{const at=performance.now();try{return apply(...args);}finally{m.apply.push(performance.now()-at);}};
    const sort=Array.prototype.sort;Array.prototype.sort=function(...args){if(this.length>10)m.sorts++;return sort.apply(this,args);};
  });
}
export async function browserWorkloads({root,frames=600,repeats=5,integration=false,profiles=['desktop','retina','touch'],scenarios=['moving-camera','visible-text-drops','gallery','death-transition']}) {
  const fixture=await startTestServer(root,{diagnostics:true}), browser=await launchBrowser({args:['--no-first-run','--disable-background-networking','--enable-precise-memory-info']});
  const results=[],errors=[];
  try {
    for(const profile of profiles) for(const scenario of integration?['live-combat-lifecycle']:scenarios) {
      const runs=[];
      for(let repeat=0;repeat<repeats;repeat++) {
        const page=await browser.newPage(browserProfiles[profile]);page.on('pageerror',e=>errors.push(e.message));
        try {
          await prepare(page,fixture.origin);
          if(integration) {
            await page.keyboard.press('Enter');
            await page.waitForFunction(()=>window.__florr.world.healthyPlayer(),null,{timeout:20000});
            // Populate a reserve through real HUD input before the measured combat.
            const points=await page.evaluate(async()=>{
              const {getHudLayout}=await import('/render/ui.js'),f=window.__florr;
              const l=getHudLayout(innerWidth,innerHeight,f.world.healthyPlayer().level??1,false);
              return {from:{x:l.equippedX*l.scale,y:l.equippedY*l.scale},to:{x:l.storageX*l.scale,y:l.storageY*l.scale}};
            });
            await page.mouse.move(points.from.x,points.from.y);await page.mouse.down();await page.waitForTimeout(100);
            await page.mouse.move(points.to.x,points.to.y,{steps:8});await page.waitForTimeout(100);await page.mouse.up();
            await page.waitForFunction(()=>{const s=window.__performanceLoadout();return s?.[0]===0&&s?.[5]>0;});
            await page.keyboard.press('Digit1');
            await page.waitForFunction(()=>{const s=window.__performanceLoadout();return s?.[0]>0&&s?.[5]===0;});
            await page.keyboard.down('KeyD');await page.mouse.move(900,400);await page.mouse.down();
          } else {
            await page.evaluate(scenario=>{
              const f=window.__florr;f.freeze();const entities=[];
              const types=[4,6,12,14,22,1,2,3];
              for(let i=0;i<866;i++)entities.push({handle:0x3e858000+(i+1)*16384,typeId:types[i%types.length],kind:scenario==='visible-text-drops'&&i%3===0?4:2,speciesId:i%5,x:scenario==='visible-text-drops'?(i%40)*30-600:(i%40)*900-18000,y:scenario==='visible-text-drops'?Math.floor(i/40)*25-250:Math.floor(i/40)*700-7000,angle:(i%7)*.9,health:25,maxHealth:25,healthKnown:true,maxHealthKnown:true,level:1,flags:0});
              entities.unshift({handle:0x3e858000,typeId:1,kind:1,speciesId:0,x:0,y:0,angle:0,health:100,maxHealth:100,healthKnown:true,maxHealthKnown:true,level:1,flags:1});
              for(let i=0;i<5;i++)entities.push({handle:0x3e858000+(900+i)*16384,typeId:1,kind:3,speciesId:1,x:Math.cos(i/5*Math.PI*2)*40,y:Math.sin(i/5*Math.PI*2)*40,angle:i,health:10,maxHealth:10,healthKnown:true,maxHealthKnown:true,level:1,flags:0});
              if(scenario==='gallery')entities[0].health=0;
              f.setSnapshot(entities);
            },scenario);
            if(scenario==='gallery') {
              const {width,height}=page.viewportSize();
              const scale=Math.fround(Math.max(.7,Math.fround(Math.max(width*.000521,height*.000926))));
              await page.mouse.click(275*scale,height-19*scale);
              await page.waitForFunction(()=>window.__florr.ui.menuPanel==='Mobs');
            }
          }
          const result=await page.evaluate(async({frameCount,scenario,integration})=>{
            const f=window.__florr,m=window.__metrics,intervals=[];
            let previous=performance.now();
            for(let i=0;i<60;i++)await new Promise(requestAnimationFrame);
            if(scenario==='death-transition')f.setSnapshotAt([...f.world.all()].map(e=>e.kind===1?{...e,health:0}:e),performance.now());
            m.cpu=[];m.decode=[];m.apply=[];m.scans=0;m.cullingScans=0;m.sorts=0;m.canvasOps=0;m.requests=[];m.packets=0;m.bytes=0;m.longTasks=[];
            const heapStart=performance.memory?.usedJSHeapSize??null,draws=m.draws;
            previous=performance.now();
            for(let frame=0;frame<frameCount;frame++) {
              await new Promise(requestAnimationFrame);const now=performance.now();intervals.push(now-previous);previous=now;
              if(!integration&&scenario!=='gallery')f.setCamera(Math.cos(frame/60)*300,Math.sin(frame/60)*200);
            }
            const kinds={};for(const e of f.world.all())kinds[e.kind]=(kinds[e.kind]??0)+1;
            return {frames:frameCount,intervals,cpu:m.cpu,decode:m.decode,apply:m.apply,scans:m.scans+m.cullingScans,sorts:m.sorts,canvasOps:m.canvasOps,requests:m.requests,packets:m.packets,bytes:m.bytes,longTasks:m.longTasks,drawFrames:m.draws-draws,totalEntities:f.world.count,kinds,heapStart,heapEnd:performance.memory?.usedJSHeapSize??null,resources:f.performanceState?.()??null};
          },{frameCount:frames,scenario,integration});
          if(integration) {
            await page.keyboard.up('KeyD');await page.mouse.up();
            await page.evaluate(()=>window.__florr.suicide());
            await page.waitForFunction(()=>window.__florr.ui.dead,null,{timeout:10000});
            await page.waitForFunction(()=>!window.__florr.world.playerEntity(),null,{timeout:10000});
            await page.keyboard.press('Enter');
            await page.waitForFunction(()=>!window.__florr.ui.started,null,{timeout:10000});
            await page.keyboard.press('Enter');
            await page.waitForFunction(()=>window.__florr.world.healthyPlayer(),null,{timeout:15000});
            result.lifecycle={equipment:true,died:true,respawned:true,pending:await page.evaluate(()=>window.__florr.performanceState?.().pending??null)};
          }
          runs.push({...result,frameMs:distribution(result.intervals),renderCpuMs:distribution(result.cpu),decodeMs:result.decode.length?distribution(result.decode):null,applyMs:result.apply.length?distribution(result.apply):null});
          console.log(`${integration?'integration':'renderer'}/${profile}/${scenario} ${repeat+1}/${repeats}: CPU p95 ${runs.at(-1).renderCpuMs.p95.toFixed(3)} ms`);
        } finally {await page.close();}
      }
      results.push({profile,viewport:browserProfiles[profile],scenario,runs,medianCpuP95:distribution(runs.map(r=>r.renderCpuMs.p95)).p50,medianRafP95:distribution(runs.map(r=>r.frameMs.p95)).p50});
    }
    return {browser:browser.version(),results,errors};
  } finally {await browser.close();await fixture.close();}
}
