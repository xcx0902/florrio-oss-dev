/** The only Playwright loader, browser resolver and product profile table. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { chromiumExecutable } from './chromium.mjs';
export const browserProfiles = Object.freeze({ desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  retina: { viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 },
  touch: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } });
export async function playwright() {
  return process.env.PLAYWRIGHT_CORE ? import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_CORE)).href) : import('playwright-core');
}
export async function launchBrowser(options = {}) {
  const { chromium } = await playwright();
  if (process.env.BROWSER && process.env.BROWSER !== 'chromium') throw new Error(`Unsupported product browser ${process.env.BROWSER}`);
  if (process.env.BROWSER_WS_ENDPOINT) return chromium.connect(process.env.BROWSER_WS_ENDPOINT);
  const browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true, args: ['--no-first-run', '--disable-background-networking'], ...options });
  try { await assertBrowserVersion(browser); return browser; } catch (error) { await browser.close(); throw error; }
}
export async function assertBrowserVersion(browser) {
  const expected = (await readFile(new URL('../../.chromium-version', import.meta.url), 'utf8')).trim();
  if (browser.version() !== expected) throw new Error(`Chrome ${expected} is required; got ${browser.version()}`);
}
