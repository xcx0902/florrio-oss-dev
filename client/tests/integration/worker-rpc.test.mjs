/** Worker RPC contracts: init/think/flush and streamed intermediate packets. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { browser, origin, start, stop } from '../support/worker-fixture.mjs';

before(start);
after(stop);

test('engine worker responds to init/think/flush', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
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
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
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
