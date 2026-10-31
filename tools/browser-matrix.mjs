#!/usr/bin/env node
/** R23's required Chromium desktop/touch suite. A missing browser is a failure. */
import { captureTap } from './run-tap.mjs';
import { assertVerificationOwner } from './verification/io.mjs';
await assertVerificationOwner();
const name = 'chromium';
let result;
try {
  const run = await captureTap({ name: 'browser', output: 'reports/browser-tests.tap', command: process.execPath,
    args: ['tools/run-tests.mjs', 'client-integration', '--test-reporter=tap'],
    env: { ...process.env, BROWSER: name, CLIENT_ROOT: process.env.CLIENT_ROOT || 'dist-next' } });
  result = { name, status: run.passed ? 'pass' : 'fail', exitCode: run.metadata.exitCode,
    runId: run.metadata.runId, target: run.metadata.target, recording: run.recording, issues: run.metadata.result.issues };
} catch (error) {
  result = { name, status: 'fail', reason: String(error.message || error) };
}
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'pass') process.exitCode = 1;
