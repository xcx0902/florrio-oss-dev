#!/usr/bin/env node
/** One pinned Chromium process, isolated contexts for all product scenarios. */
import { playwright, assertBrowserVersion } from './lib/browser-harness.mjs';
import { chromiumExecutable } from './lib/chromium.mjs';
import { runProcess } from './lib/process.mjs';
const { chromium } = await playwright();
const server = await chromium.launchServer({ headless: true, executablePath: chromiumExecutable(), args: ['--no-first-run', '--disable-background-networking', '--enable-precise-memory-info'] });
let connection;
try {
  connection = await chromium.connect(server.wsEndpoint()); await assertBrowserVersion(connection); await connection.close(); connection = undefined;
  const env = { ...process.env, BROWSER_WS_ENDPOINT: server.wsEndpoint(), CLIENT_ROOT: 'dist-next' };
  for (const script of ['tools/browser-matrix.mjs', 'tools/smoke-entrypoints.mjs', 'tools/perf-client.mjs']) {
    const result = await runProcess(process.execPath, [script], { env });
    if (result.exitCode) throw new Error(`${script} failed: ${result.exitCode}`);
  }
} finally { await connection?.close(); await server.close(); }
