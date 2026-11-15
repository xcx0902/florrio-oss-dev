import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { client } from '../w2/online.mjs';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8080/' },
    browser: {
      type: 'string',
      default:
        process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    'insecure-local': { type: 'boolean', default: false },
    output: { type: 'string', default: path.resolve('reports/wave/preview/browser') },
  },
});
const url = new URL(values.url);
assert.ok(
  !values['insecure-local'] || url.hostname === 'localhost',
  'Certificate bypass is only permitted for local test certificates',
);
await mkdir(values.output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: values.browser,
  args: ['--no-proxy-server', ...(values['insecure-local'] ? ['--ignore-certificate-errors'] : [])],
});
const entries = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 400));
const wait = async (condition, message) => {
  const until = Date.now() + 15000;
  while (!condition() && Date.now() < until) {
    await settle();
  }
  assert.ok(condition(), message);
};
try {
  const a = await client(browser, url.href, 'preview-A');
  entries.push(a);
  await settle();
  await a.page.mouse.click(412, 373);
  await a.page.keyboard.type('Preview A');
  await a.page.mouse.click(632, 402);
  await a.page.waitForFunction(() => location.hash.startsWith('#wavelocal-'));
  const invite = new URL(a.page.url()).hash;
  const b = await client(browser, new URL(invite, url).href, 'preview-B');
  entries.push(b);
  await b.page.waitForFunction(() => window.waveLabels.has('Preview A'));
  assert.notEqual(a.guest, b.guest);
  await a.page.screenshot({ path: path.join(values.output, 'squad.png') });
  await a.page.mouse.click(660, 256);
  await b.page.mouse.click(660, 256);
  await wait(
    () => a.current?.control && b.current?.control,
    'Both original clients enter the shared match',
  );
  await a.page.mouse.move(700, 384);
  await settle();
  assert.ok(
    a.commands.some((command) => command.opcode === 9),
    'Original mouse controls produce server commands',
  );
  await a.page.screenshot({ path: path.join(values.output, 'playing.png') });
  const state = await a.context.storageState();
  await a.context.close();
  const resumed = await client(browser, new URL(invite, url).href, 'preview-A-restored', state);
  entries.push(resumed);
  await wait(() => resumed.current?.control, 'Original client reconnects into the match');
  assert.equal(resumed.guest, a.guest, 'Saved profile survives a new browser context');
  await resumed.page.screenshot({ path: path.join(values.output, 'reconnected.png') });
  for (const entry of entries) {
    assert.deepEqual(
      entry.errors,
      [],
      'Original clients have no runtime or protocol decode errors',
    );
    assert.ok(
      entry.sockets.every((socket) => new URL(socket).origin === url.origin.replace(/^http/, 'ws')),
      'All sockets use the deployed origin',
    );
    assert.ok(
      entry.requests.every(
        (request) => request.startsWith(url.origin + '/') || /^(data|blob):/.test(request),
      ),
      'No retired discovery or external asset requests',
    );
  }
  const report = {
    status: 'passed',
    url: url.origin,
    browser: browser.version(),
    checks: [
      'same-origin assets and discovery',
      'two distinct guests',
      'squad invitation',
      'both original clients enter game',
      'mouse input',
      'profile and match reconnect',
    ],
    clients: entries.map((entry) => ({
      snapshots: entry.snapshots.length,
      errors: entry.errors,
      sockets: entry.sockets,
    })),
  };
  await writeFile(path.join(values.output, 'smoke.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
