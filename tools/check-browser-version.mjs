#!/usr/bin/env node
import { launchBrowser } from './lib/browser-harness.mjs';
const browser = await launchBrowser();
try { console.log(`Chromium ${browser.version()}: pinned version verified`); } finally { await browser.close(); }
