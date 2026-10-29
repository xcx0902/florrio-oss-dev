#!/usr/bin/env node
/** R23's required Chromium desktop/touch suite. A missing browser is a failure. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromiumExecutable } from './lib/chromium.mjs';
import { captureTap } from './run-tap.mjs';
import { assertVerificationOwner } from './verification/io.mjs';

await assertVerificationOwner();

const local = ['node_modules/playwright-core/index.mjs', 'node_modules/playwright/node_modules/playwright-core/index.mjs']
  .find(candidate => existsSync(candidate));
const playwrightPath = process.env.PLAYWRIGHT_CORE || local;
if (!playwrightPath) throw new Error('playwright-core is required');
const playwright = await import(pathToFileURL(path.resolve(playwrightPath)).href);
const name = process.env.BROWSER || 'chromium';
if (name !== 'chromium') throw new Error(`R23 supports Chromium only; unsupported BROWSER=${name}`);
let result;
try {
  const executablePath = chromiumExecutable();
  const browser = await playwright.chromium.launch({ headless: true, executablePath,
    args: ['--no-first-run', '--disable-background-networking'] });
  await browser.close();
  const run = await captureTap({ name: 'browser', output: 'reports/browser-tests.tap', command: process.execPath,
    args: ['tools/run-tests.mjs', 'client-integration', '--test-reporter=tap'],
    env: { ...process.env, BROWSER: name, CHROME_PATH: executablePath ?? '', CLIENT_ROOT: process.env.CLIENT_ROOT || 'dist-next' } });
  result = { name, status: run.passed ? 'pass' : 'fail', exitCode: run.metadata.exitCode,
    runId: run.metadata.runId, target: run.metadata.target, recording: run.recording, issues: run.metadata.result.issues };
} catch (error) {
  result = { name, status: 'fail', reason: String(error.message || error) };
}
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'pass') process.exitCode = 1;
