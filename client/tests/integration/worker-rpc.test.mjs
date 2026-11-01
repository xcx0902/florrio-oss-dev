/** Worker RPC contracts: init/think/flush and streamed intermediate packets. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { browser, origin, start, stop } from '../support/worker-fixture.mjs';
import { freezeAndDrain } from '../../../tools/performance/browser.mjs';

before(start);
after(stop);

async function delayWorkerStep(page,error=null) {
    await page.addInitScript(error=>{
      const NativeWorker=window.Worker;
      window.Worker=class extends NativeWorker {
        postMessage(message,transfer) {
          if(window.__delayNextStep&&message.funcName==='step') {
            window.__delayNextStep=false;window.__stepDelayed=true;
            setTimeout(()=>{
              if(error)this.dispatchEvent(new MessageEvent('message',{data:{callbackId:message.callbackId,finalResponse:true,error}}));
              else super.postMessage(message,transfer??[]);
            },300);
          } else super.postMessage(message,transfer??[]);
        }
      };
    },error);
    await page.goto(origin+'/index.html?profile=offline&test=1',{waitUntil:'load'});
    await page.waitForFunction(()=>window.__florr);
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>window.__florr.world.healthyPlayer()
      &&window.__florr.ui.status===''&&window.__florr.performanceState().pending===0);
    await page.evaluate(()=>{window.__delayNextStep=true;});
    await page.waitForFunction(()=>window.__stepDelayed&&window.__florr.performanceState().pending===1);
}

test('performance teardown drains an outstanding real Worker step before sampling pending', async()=>{
  const page=await browser.newPage();
  try {
    await delayWorkerStep(page);
    assert.equal(await freezeAndDrain(page),0);
    // More than one scheduling interval proves the producer remains frozen.
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.__florr.performanceState().pending),0);
  } finally {await page.close();}
});

test('performance teardown rejects a failed Worker completion instead of reporting a successful drain', async()=>{
  const page=await browser.newPage();
  try {
    await delayWorkerStep(page,'injected step failure');
    await assert.rejects(freezeAndDrain(page),/Worker drain failed: injected step failure/);
    assert.equal(await page.evaluate(()=>window.__florr.performanceState().pending),0);
  } finally {await page.close();}
});

test('engine worker responds to init/think/flush', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html?profile=offline&test=1', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const worker = new Worker('server-worker.js?manual=1');
    const messages = [];
    const errors = [];
    worker.onmessage = event => messages.push(event.data);
    worker.onerror = event => errors.push(String(event.message || event));
    worker.postMessage({ funcName: 'sp_server_init', callbackId: -1 });
    worker.postMessage({ funcName: 'sp_server_think', callbackId: 0 });
    worker.postMessage({ funcName: 'sp_server_flush', callbackId: 1 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    worker.terminate();
    return { messages, errors };
  });
  await page.close();
  assert.deepEqual(result.errors, []);
  assert.equal(result.messages.length, 4);
  assert.deepEqual(result.messages.map(message => message.callbackId), [-1, 0, 1, 1]);
  assert.equal(result.messages[2].finalResponse, false);
  assert.ok(result.messages[3].finalResponse === true);
  assert.ok(result.messages.every(message => message.error === undefined));
});

test('worker client forwards intermediate packets', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html?profile=offline&test=1', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { ServerWorkerClient } = await import('/net/worker.js');
    const client = new ServerWorkerClient('stream-test-worker.js');
    const packets = [];
    const final = await client.requestStream('sp_server_flush', undefined, (data, isFinal) => {
      packets.push({ data: Array.from(data), final: isFinal });
    });
    client.terminate();
    return { packets, final: final ? Array.from(final) : null };
  });
  await page.close();
  assert.deepEqual(result.packets, [
    { data: [1, 2], final: false },
    { data: [3], final: true },
  ]);
  assert.deepEqual(result.final, [3]);
});

test('one atomic step preserves send, think, flush packet order and enforces backpressure', async()=>{
  const page=await browser.newPage();
  try {
    await page.goto(origin+'/index.html?profile=offline&test=1',{waitUntil:'load'});
    const result=await page.evaluate(async()=>{
      const {ServerWorkerClient}=await import('/net/worker.js');
      const {InputPacketEncoder}=await import('/net/input.js');
      const client=new ServerWorkerClient(),encoder=new InputPacketEncoder();
      await client.init();const packets=[];
      const first=client.step([encoder.spawn('Step')],p=>packets.push([...p]));
      let refused=false;try{await client.step([],()=>{});}catch{refused=true;}
      await first;const pending=client.pendingCount;
      const second=[];await client.step([encoder.input(1,0,100)],p=>second.push([...p]));
      client.terminate();return {packets:packets.length,second:second.length,pending,refused,after:client.pendingCount};
    });
    assert.deepEqual(result,{packets:1,second:1,pending:0,refused:true,after:0});
  } finally {await page.close();}
});
