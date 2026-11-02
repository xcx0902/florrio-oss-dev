import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startTestServer } from '../../../tools/lib/test-server.mjs';
import { launchBrowser } from '../../../tools/lib/browser-harness.mjs';
import { evidence, sameEvidence } from '../../../tools/verification-evidence.mjs';
import { startNativeServer } from '../support/native-server.mjs';
import { startLatencyProxy } from '../support/latency-proxy.mjs';
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];

test('sustained keyboard movement draws a continuous body and camera with prediction on and off', {timeout:90000}, async()=>{
  const initial=await evidence();
  const http=await startTestServer(path.resolve(process.env.CLIENT_ROOT || 'dist-next')),browser=await launchBrowser();
  const rows=[];let passed=false;
  try {
    for(const rttMs of [0,80,250])for(const prediction of [true,false]) {
      const jitterMs=rttMs ? 20 : 0,native=await startNativeServer(http.origin);
      const proxy=await startLatencyProxy(native.port,{rttMs,jitterMs});
      const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const row={rttMs,jitterMs,prediction};rows.push(row);
      try {
        await context.route('**/connection.json',route=>route.fulfill({json:{profile:'network',url:`ws://127.0.0.1:${proxy.port}/ws`,roomId:'garden',prediction}}));
        await page.goto(http.origin);await page.waitForFunction(()=>document.querySelector('#menu-controls input'));
        await page.evaluate(async()=>{const app=window.__smoothApp=(await import('/main.js')).app;app.menuControls.keyboardMovement=true;});
        await page.locator('#menu-controls input').fill('Alice');await page.mouse.move(640,360);
        await page.waitForTimeout(400);await page.keyboard.press('Enter');
        await page.waitForFunction(()=>window.__smoothApp.session.phase==='playing' && Math.abs(window.__smoothApp.world.selfState.positionX)<1000);
        await page.waitForFunction(()=>window.__smoothApp.network.clock.sampleCount>0);await page.waitForTimeout(600);
        await page.evaluate(()=>{
          const app=window.__smoothApp;window.__smoothFrames=[];
          const frame=app.renderer.frame;
          app.renderer.frame=(...args)=>{
            frame(...args);const entity=app.world.healthyPlayer();if(!entity)return;
            const body=app.renderer.playerTransform.get(entity,args[0],{x:app.camera.panX,y:app.camera.panY});
            window.__smoothFrames.push({at:args[0],x:body.x,y:body.y,cameraX:app.camera.x,cameraY:app.camera.y});
          };
        });
        await page.keyboard.down('KeyD');await page.waitForTimeout(4200);await page.keyboard.up('KeyD');
        row.frames=await page.evaluate(()=>window.__smoothFrames);
        // Ignore acceleration / initial in-flight inputs. Measure every normal
        // rendered frame, rather than just first response and final convergence.
        const frames=row.frames.filter(frame=>frame.at-row.frames[0].at>1400),bodySpeeds=[],cameraSpeeds=[];
        for(let i=1;i<frames.length;i++) {
          const dt=frames[i].at-frames[i-1].at;if(dt<8 || dt>40)continue;
          bodySpeeds.push((frames[i].x-frames[i-1].x)/dt);
          cameraSpeeds.push((frames[i].cameraX-frames[i-1].cameraX)/dt);
        }
        row.measurements=[bodySpeeds,cameraSpeeds].map(speeds=>({frames:speeds.length,
          stalled:speeds.filter(speed=>Math.abs(speed)<.001).length,backward:speeds.filter(speed=>speed<-.001).length,
          p05:percentile(speeds,.05),median:percentile(speeds,.5),p95:percentile(speeds,.95),max:Math.max(...speeds)}));
        for(const measured of row.measurements) {
          const detail=JSON.stringify({rttMs,jitterMs,prediction,measured});
          assert.ok(measured.frames>=100,detail);
          assert.ok(measured.median>.2 && measured.median<.45,detail);
          assert.equal(measured.backward,0,detail);
          assert.ok(measured.stalled<=measured.frames*.01,detail);
          assert.ok(measured.p05>=measured.median*.6 && measured.p95<=measured.median*1.5,detail);
          assert.ok(measured.max<=measured.median*1.8,detail);
        }
        assert.ok(frames.every(frame=>Math.abs(frame.x-frame.cameraX)<.002 && Math.abs(frame.y-frame.cameraY)<.002),
          'camera and actual drawn body follow the same sampled position');
        assert.deepEqual(errors,[]);
      } finally {await context.close();await proxy.close();await native.close();}
    }
    passed=true;
  } finally {
    await browser.close();await http.close();await mkdir('reports/multiplayer/jitter-fix',{recursive:true});
    const stable=sameEvidence(initial,await evidence());
    await writeFile('reports/multiplayer/jitter-fix/smoothness.json',JSON.stringify({passed:passed&&stable,stable,
      runId:process.env.VERIFY_RUN_ID??null,evidence:initial,transport:'native server with ordered TCP delay / jitter',
      viewport:{width:1280,height:720},rows},null,2)+'\n');
    assert.ok(stable,'sources and built client remained unchanged during the browser measurement');
  }
});
