#!/usr/bin/env node
/**
 * Pixel diff for two PNG screenshots. Decoding uses Chrome (already required by
 * the parity runner) so no image library is needed.
 *
 * usage: node tools/parity/screenshot-diff.mjs expected.png actual.png [--out diff.png]
 *        [--max-ratio 0.001] [--max-delta 8]
 */
import { chromiumExecutable } from '../lib/chromium.mjs';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const files = args.filter(value => !value.startsWith('--') && !args[args.indexOf(value) - 1]?.startsWith('--'));
const [expectedFile, actualFile] = files;
if (!expectedFile || !actualFile) {
  console.error('usage: node tools/parity/screenshot-diff.mjs <expected.png> <actual.png> [--out diff.png] [--max-ratio 0.001] [--max-delta 8]');
  process.exit(2);
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = await readFile(expectedFile);
const actual = await readFile(actualFile);
const result = { expected: expectedFile, actual: actualFile, expectedSha256: sha256(expected), actualSha256: sha256(actual) };
if (result.expectedSha256 === result.actualSha256) {
  result.equal = true;
  result.exact = true;
  result.changed = 0;
  result.ratio = 0;
  result.max = 0;
} else {
  const chromePath = chromiumExecutable();
  const localPlaywright = ['node_modules/playwright-core/index.mjs', 'node_modules/playwright/node_modules/playwright-core/index.mjs'].find(candidate => existsSync(candidate));
  const playwrightPath = process.env.PLAYWRIGHT_CORE || localPlaywright;
  if (!playwrightPath) throw new Error('playwright-core is required to decode screenshots; set PLAYWRIGHT_CORE');
  const { chromium } = await import(pathToFileURL(path.resolve(playwrightPath)).href);
  const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-first-run', '--disable-background-networking'] });
  try {
    const page = await browser.newPage();
    const diff = await page.evaluate(async ([left, right]) => {
      async function load(base64) {
        const image = new Image();
        image.src = 'data:image/png;base64,' + base64;
        await image.decode();
        return image;
      }
      const a = await load(left), b = await load(right);
      if (a.width !== b.width || a.height !== b.height) return { sizeMismatch: true, a: [a.width, a.height], b: [b.width, b.height] };
      const canvas = document.createElement('canvas');
      canvas.width = a.width; canvas.height = a.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(a, 0, 0);
      const first = context.getImageData(0, 0, a.width, a.height).data;
      context.clearRect(0, 0, a.width, a.height);
      context.drawImage(b, 0, 0);
      const second = context.getImageData(0, 0, a.width, a.height).data;
      let changed = 0, max = 0, sum = 0;
      for (let i = 0; i < first.length; i += 4) {
        let delta = 0;
        for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(first[i + c] - second[i + c]));
        if (delta > 0) changed++;
        if (delta > max) max = delta;
        sum += delta;
      }
      const output = document.createElement('canvas');
      output.width = a.width; output.height = a.height;
      const outputContext = output.getContext('2d');
      const image = outputContext.createImageData(a.width, a.height);
      for (let i = 0; i < first.length; i += 4) {
        let delta = 0;
        for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(first[i + c] - second[i + c]));
        image.data[i] = delta ? 255 : first[i] * 0.25;
        image.data[i + 1] = delta ? 0 : first[i + 1] * 0.25;
        image.data[i + 2] = delta ? 0 : first[i + 2] * 0.25;
        image.data[i + 3] = 255;
      }
      outputContext.putImageData(image, 0, 0);
      return { width: a.width, height: a.height, changed, pixels: a.width * a.height, ratio: changed / (a.width * a.height), max, mean: sum / (a.width * a.height), diffImage: output.toDataURL('image/png') };
    }, [expected.toString('base64'), actual.toString('base64')]);
    Object.assign(result, diff);
    if (diff.diffImage && option('--out', null)) {
      await writeFile(option('--out'), Buffer.from(diff.diffImage.split(',')[1], 'base64'));
      result.diffFile = option('--out');
    }
    delete result.diffImage;
  } finally {
    await browser.close();
  }
  const maxRatio = Number(option('--max-ratio', 0.001));
  const maxDelta = Number(option('--max-delta', 8));
  result.equal = Boolean(!result.sizeMismatch && result.ratio <= maxRatio && result.max <= maxDelta);
  result.thresholds = { maxRatio, maxDelta };
}
console.log(JSON.stringify(result, null, 2));
if (!result.equal) process.exitCode = 1;
