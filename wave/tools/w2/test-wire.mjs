import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { defaultNative, root, startHost } from './host.mjs';
import { onlineCases } from './online.mjs';
import { playabilityCases, modeRecoveryCase } from './playability.mjs';
import { protocolEffectsCase } from './protocol-effects.mjs';

const { values } = parseArgs({
  options: {
    snapshot: { type: 'string', default: process.env.WAVE_SNAPSHOT },
    'native-dir': { type: 'string', default: process.env.WAVE_NATIVE_DIR ?? defaultNative },
    'output-dir': { type: 'string', default: path.join(root, '../reports/wave/W2') },
    browser: { type: 'string', default: process.env.CHROME_PATH },
    stage: { type: 'string', default: 'W2' },
    'bootstrap-only': { type: 'boolean' },
  },
});
if (values.stage === 'W3') {
  const { runW3 } = await import('../w3/test-wire.mjs');
  if (!process.argv.includes('--output-dir')) {
    values['output-dir'] = path.join(root, '../reports/wave/W3');
  }
  await runW3(values);
  process.exit(process.exitCode ?? 0);
}
assert.equal(values.stage, 'W2');
const output = path.resolve(values['output-dir']);
await mkdir(output, { recursive: true });

function revision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

const report = {
  schemaVersion: 1,
  stage: 'W2',
  status: 'failed',
  revision: process.env.WAVE_REVISION ?? revision(),
  node: process.version,
  cases: {},
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fixture = JSON.parse(await readFile(path.join(root, 'data/wire/20221030/bootstrap.json')));
const sources = [
  'CMakeLists.txt',
  'cmake/Dependencies.cmake',
  'cmake/dependencies.lock.json',
  'data/wire/20221030/bootstrap.json',
  'data/wire/20221030/w2-lobby-replay.json',
  'package-lock.json',
  'package.json',
  'server/app/bootstrap_session.cpp',
  'server/app/bootstrap_session.hpp',
  'server/app/garden.cpp',
  'server/app/garden.hpp',
  'server/app/garden_session.cpp',
  'server/app/garden_session.hpp',
  'server/net/host.cpp',
  'server/sim/model.hpp',
  'server/sim/waves.cpp',
  'server/wire/bootstrap.cpp',
  'server/wire/bootstrap.hpp',
  'server/wire/garden_projection.cpp',
  'server/wire/garden_projection.hpp',
  'tests/native/w2.cpp',
  'tests/native/w2_garden.cpp',
  'tests/native/w1.cpp',
  'tests/scenarios/garden-w2.hpp',
  'tools/w2/dev.mjs',
  'tools/w2/host.mjs',
  'tools/w2/codec.mjs',
  'tools/w2/online.mjs',
  'tools/w2/playability.mjs',
  'tools/w2/protocol-effects.mjs',
  'web/ubuntu-700.css',
  'web/ubuntu-LICENCE.txt',
  'web/4iCv6KVjbNBYlgoCxCvjvWyNL4U.woff2',
  'web/4iCv6KVjbNBYlgoCxCvjtGyNL4U.woff2',
  'web/4iCv6KVjbNBYlgoCxCvjvGyNL4U.woff2',
  'web/4iCv6KVjbNBYlgoCxCvjs2yNL4U.woff2',
  'web/4iCv6KVjbNBYlgoCxCvjvmyNL4U.woff2',
  'web/4iCv6KVjbNBYlgoCxCvjsGyN.woff2',
  'tools/w2/test-wire.mjs',
  'web/index.html',
  'web/local.js',
  'web/reference.css',
  'web/resources-20221030.json',
];
const openCases = ['W2-02', 'W2-03', 'W2-04', 'W2-05', 'W2-07', 'W2-08', 'W2-09', 'W2-10', 'W2-11'];

async function observeLabels(page) {
  await page.addInitScript(() => {
    // Observe the original canvas text without changing rendering or game state.
    const draw = CanvasRenderingContext2D.prototype.fillText;
    window.waveLabels = new Set();
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      window.waveLabels.add(text);
      return draw.call(this, text, ...args);
    };
  });
}

async function replayLobby(browser, host) {
  const replay = JSON.parse(
    await readFile(path.join(root, 'data/wire/20221030/w2-lobby-replay.json')),
  );
  assert.equal(
    replay.snapshotSha256,
    host.snapshot.find(({ file }) => file === 'client.wasm').sha256,
  );
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    locale: 'en-US',
  });
  try {
    let socket;
    const frames = [];
    const observation = { status: 'failed', kind: 'synthetic-replay', frames };
    report.cases['W2-02-replay'] = observation;
    function send(replies) {
      for (const reply of replies) {
        const bytes = Buffer.from(reply.hex, 'hex');
        assert.equal(bytes.length, reply.length);
        frames.push(reply);
        socket.send(bytes);
      }
    }
    await context.routeWebSocket('**/wave/socket', (route) => {
      socket = route;
      let greeted = false;
      socket.onMessage((message) => {
        const bytes = Buffer.from(message);
        frames.push({
          kind: 'captured',
          direction: 'client-to-server',
          length: bytes.length,
          hex: bytes.toString('hex'),
        });
        if (!greeted) {
          assert.equal(bytes.toString('hex'), fixture.socket.request.hex);
          greeted = true;
          send(replay.initial);
        }
      });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await observeLabels(page);
    await page.goto(host.url);
    await page.waitForFunction(() => window.waveLabels.has('Ready'), null, { timeout: 8000 });
    // The canvas animates into its idle menu coordinates.
    await page.waitForTimeout(450);
    await page.mouse.click(412, 373);
    await page.keyboard.type('Wave A');
    await page.mouse.click(632, 402);
    await page.waitForFunction(() => window.waveLabels.has('Creating...'), null, { timeout: 3000 });
    send(replay.afterCreate);
    await page.waitForFunction(
      () => location.hash.endsWith('-ROOM') && window.waveLabels.has('Wave B'),
      null,
      { timeout: 4000 },
    );
    const labels = await page.evaluate(() => [...window.waveLabels]);
    const screenshot = 'W2-02-replay.png';
    await page.screenshot({ path: path.join(output, screenshot) });
    assert.ok(labels.includes('Wave A') && labels.includes('Wave B'));
    assert.deepEqual(errors, []);
    Object.assign(observation, {
      status: 'passed',
      screenshot,
      labels,
      invite: new URL(page.url()).hash,
    });
  } finally {
    await context.close();
  }
}

async function browserCase(browser, host, label) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    locale: 'en-US',
    userAgent: 'Wave W2 fixture',
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    const frames = [];
    const errors = [];
    const events = [];
    const requests = [];
    const started = performance.now();
    const capture = (event) => ({
      sequence: events.length + 1,
      relativeMs: Math.round(performance.now() - started),
      ...event,
    });
    report.cases[label] = { frames, requests, errors, events };
    page.on('request', (request) => {
      requests.push({ method: request.method(), url: request.url() });
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (['log', 'warning', 'error'].includes(message.type())) {
        events.push(capture({ level: message.type(), text: message.text() }));
      }
    });
    page.on('websocket', (socket) => {
      events.push(capture({ event: 'open', url: socket.url() }));
      for (const [kind, direction] of [
        ['framesent', 'client-to-server'],
        ['framereceived', 'server-to-client'],
      ]) {
        socket.on(kind, ({ payload }) => {
          const bytes = Buffer.from(payload);
          const frame = {
            kind: 'captured',
            direction,
            url: socket.url(),
            length: bytes.length,
            hex: bytes.toString('hex'),
          };
          frames.push(frame);
          events.push(capture({ event: 'frame', ...frame }));
        });
      }
    });
    await observeLabels(page);
    await page.goto(host.url);
    await page.waitForFunction(
      () => localStorage.getItem('cp6_player_id') && window.waveLabels.has('Ready'),
      null,
      { timeout: 8000 },
    );
    const guest = await page.evaluate(() => localStorage.getItem('cp6_player_id'));
    const labels = await page.evaluate(() => [...window.waveLabels]);
    const screenshot = `${label}.png`;
    await page.screenshot({ path: path.join(output, screenshot) });
    const first = frames.find(({ direction }) => direction === 'client-to-server');
    assert.equal(first?.hex, fixture.socket.request.hex);
    assert.equal(first?.url, host.url.replace('http:', 'ws:') + 'wave/socket');
    assert.ok(labels.includes('Garden') && labels.includes('Squad'));
    assert.deepEqual(errors, []);
    Object.assign(report.cases[label], { guest, labels, screenshot, status: 'passed' });
    return guest;
  } finally {
    await context.close();
  }
}

async function malformed(browser, host) {
  const page = await browser.newPage();
  try {
    await page.goto(host.url + 'endpoint/florrio-waves-0/findEach/');
    return await page.evaluate(
      async ({ request, url }) => {
        const cases = {
          truncatedHello: [[48, 98]],
          beforeHello: [[0x20, 0x1e, 0xb8]],
          repeatedHello: [request, request],
          truncatedAck: [request, [0x20, 0x1e]],
          maximumLength: [new Array(4096).fill(48)],
          excessiveLength: [new Array(4097).fill(48)],
          excessiveLarge: [new Array(65536).fill(48)],
        };
        const results = {};
        for (const [name, inputs] of Object.entries(cases)) {
          const closeCodes = [];
          const attempts = name.startsWith('excessive') ? 20 : 1;
          for (let attempt = 0; attempt < attempts; ++attempt) {
            results[name] = await new Promise((resolve, reject) => {
              const socket = new WebSocket(url);
              const timer = setTimeout(() => {
                socket.close();
                reject(new Error(`Timed out waiting for ${name} close`));
              }, 5000);
              const received = [];
              socket.binaryType = 'arraybuffer';
              socket.onopen = () => {
                for (const input of inputs) {
                  socket.send(Uint8Array.from(input));
                }
              };
              socket.onmessage = (event) => received.push([...new Uint8Array(event.data)]);
              socket.onclose = (event) => {
                clearTimeout(timer);
                resolve({ code: event.code, received });
              };
            });
            closeCodes.push(results[name].code);
          }
          results[name].closeCodes = closeCodes;
        }
        return results;
      },
      {
        request: [...Buffer.from(fixture.socket.request.hex, 'hex')],
        url: host.url.replace('http:', 'ws:') + 'wave/socket',
      },
    );
  } finally {
    await page.close();
  }
}

let host;
let browser;
try {
  report.sources = await Promise.all(
    sources.map(async (file) => ({ file, sha256: hash(await readFile(path.join(root, file))) })),
  );
  report.sourceSha256 = hash(JSON.stringify(report.sources));
  report.native = execFileSync(
    'ctest',
    [
      '--test-dir',
      path.resolve(values['native-dir']),
      '--output-on-failure',
      '--no-tests=error',
      '-L',
      '^w2$',
    ],
    { encoding: 'utf8' },
  );
  report.nativeBinary = hash(await readFile(path.resolve(values['native-dir'], 'wave_host')));
  host = await startHost({ snapshot: values.snapshot, nativeDir: values['native-dir'], port: 0 });
  report.snapshot = host.snapshot;
  for (const { file, sha256 } of host.snapshot) {
    const response = await fetch(host.url + file);
    assert.ok(response.ok);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), sha256);
  }
  report.productionTestEndpoints = {
    state: (await fetch(host.url + 'wave/test/state')).status,
    step: (await fetch(host.url + 'wave/test/step/1', { method: 'POST' })).status,
  };
  assert.deepEqual(report.productionTestEndpoints, { state: 404, step: 400 });
  browser = await chromium.launch({
    executablePath: values.browser,
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost', '--no-proxy-server'],
  });
  report.browser = browser.version();
  const a = await browserCase(browser, host, 'W2-01-A');
  const bad = await malformed(browser, host);
  report.cases['W2-06'] = { status: 'failed', inputs: bad };
  for (const [name, result] of Object.entries(bad)) {
    const expected = name.startsWith('excessive') ? 1009 : 1002;
    assert.ok(
      result.closeCodes.every((code) => code === expected),
      `${name}: ${result.closeCodes}`,
    );
    if (expected === 1002) {
      assert.deepEqual(result.received.at(-1), [0, 0], name);
    }
  }
  const b = await browserCase(browser, host, 'W2-01-B');
  assert.notEqual(a, b);
  report.cases['W2-06'].status = 'passed';
  await replayLobby(browser, host);
  report.status = 'bootstrap-passed';
  if (!values['bootstrap-only']) {
    report.fixtureBinary = hash(
      await readFile(path.resolve(values['native-dir'], 'wave_host_fixture')),
    );
    await playabilityCases({
      browser,
      snapshot: values.snapshot,
      nativeDir: values['native-dir'],
      output,
      report,
    });
    await modeRecoveryCase({
      browser,
      snapshot: values.snapshot,
      nativeDir: values['native-dir'],
      output,
      report,
    });
    await protocolEffectsCase({
      browser,
      snapshot: values.snapshot,
      nativeDir: values['native-dir'],
      output,
      report,
    });
    await onlineCases({
      browser,
      snapshot: values.snapshot,
      nativeDir: values['native-dir'],
      output,
      report,
    });
    assert.ok(openCases.every((name) => report.cases[name]?.status === 'passed'));
    report.status = 'passed';
  }
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const name of openCases) {
    report.cases[name] ??= { status: 'pending' };
  }
  try {
    await browser?.close();
    await host?.stop();
  } finally {
    await writeFile(path.join(output, 'wire.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
if (report.status === 'bootstrap-passed' && !values['bootstrap-only']) {
  console.error(`W2-01 and W2-06 passed. W2 remains open (${openCases.join(', ')}).`);
  process.exitCode = 1;
}
