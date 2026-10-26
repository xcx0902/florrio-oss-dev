#!/usr/bin/env node
/** Fail before acceptance if the actual browser differs from the golden pin. */
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { chromiumExecutable } from './lib/chromium.mjs';

const expected = (await readFile(new URL('../.chromium-version', import.meta.url), 'utf8')).trim();
if (!/^\d+\.\d+\.\d+\.\d+$/.test(expected)) throw new Error('Invalid .chromium-version');
const browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true,
  args: ['--no-first-run', '--disable-background-networking'] });
try {
  const actual = browser.version();
  if (actual !== expected) throw new Error(`Chrome ${expected} is required by .chromium-version; got ${actual}. Set CHROME_PATH to the pinned executable.`);
  console.log(`Chrome ${actual}: matches the archived-client golden pin`);
} finally { await browser.close(); }
