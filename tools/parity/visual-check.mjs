#!/usr/bin/env node
/**
 * Visual gate for the reconstructed client (R19.2).
 *
 * For every benchmark scene this script obtains the reconstructed client's
 * canvas screenshot and diffs it against the archived client's golden:
 *
 *   boot-menu   -> `run-client-scenario.mjs` (menu path, new client)
 *   other seven -> `run-client-engine-scenario.mjs` (C++ engine state, new client)
 *
 * One Chromium instance decodes and diffs all pairs. The JSON report is the
 * machine-readable gate (`tests/parity/visual/report.json`); exit code 1 when
 * any scene exceeds the ratio or per-channel delta budget.
 *
 * Usage:
 *   node tools/parity/visual-check.mjs                 # run runners + diff
 *   node tools/parity/visual-check.mjs --skip-run      # diff existing artifacts
 *   node tools/parity/visual-check.mjs --scenario move --scenario damage
 */
import { chromiumExecutable } from '../lib/chromium.mjs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { evidence } from '../verification-evidence.mjs';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const flag = name => args.includes(name);
const repoRoot = path.resolve('.');
const output = path.resolve(option('--out', 'tests/parity/visual'));
const engineOutput = path.resolve(option('--engine-out', 'tests/parity/next-engine'));
const menuOutput = path.resolve(option('--menu-out', path.join(output, 'menu')));
const maxRatio = Number(option('--max-ratio', 0.001));
const maxDelta = Number(option('--max-delta', 8));
const scenarios = ['boot-menu', 'garden-idle', 'move', 'attack', 'equip', 'damage', 'death', 'spawn'];
const selected = args.filter((value, index) => index > 0 && args[index - 1] === '--scenario');
if (new Set(selected).size !== selected.length || selected.some(name => !scenarios.includes(name))) throw new Error('invalid or duplicate visual scenario');
if (![maxRatio, maxDelta].every(value => Number.isFinite(value) && value >= 0) || maxRatio > 1 || maxDelta > 255) throw new Error('invalid visual threshold');

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

if (!flag('--skip-run')) {
  const engine = await run(process.execPath, [
    'tools/parity/run-client-engine-scenario.mjs', '--all',
    '--out', engineOutput,
  ]);
  if (engine.code !== 0) {
    process.stderr.write(engine.stderr || engine.stdout);
    throw new Error(`engine-state client runner failed with ${engine.code}`);
  }
  const menu = await run(process.execPath, [
    'tools/parity/run-client-scenario.mjs', '--scenario', 'boot-menu',
    '--out', menuOutput, '--repeat', '1', '--update',
  ]);
  if (menu.code !== 0) {
    process.stderr.write(menu.stderr || menu.stdout);
    throw new Error(`menu client runner failed with ${menu.code}`);
  }
}

const pairs = selected.length
  ? scenarios.filter(name => selected.includes(name))
  : scenarios;

async function playwrightPath() {
  if (process.env.PLAYWRIGHT_CORE) return process.env.PLAYWRIGHT_CORE;
  for (const candidate of ['node_modules/playwright-core/index.mjs', 'node_modules/playwright/node_modules/playwright-core/index.mjs']) {
    if (existsSync(candidate)) return path.resolve(candidate);
  }
  throw new Error('playwright-core is required for the visual gate');
}
const { chromium } = await import(pathToFileURL(await playwrightPath()).href);
const chromePath = chromiumExecutable();

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = name => name === 'boot-menu'
  ? {
      expected: path.join(repoRoot, 'tests/parity/golden/boot-menu/screenshot.png'),
      actual: path.join(menuOutput, 'boot-menu/screenshot.png'),
    }
  : {
      expected: path.join(repoRoot, 'tests/parity/golden', name, 'screenshot.png'),
      actual: path.join(engineOutput, name, 'screenshot.png'),
    };

const report = { evidence: await evidence(),
  schema: 1,
  generatedAt: new Date().toISOString(),
  thresholds: { maxRatio, maxDelta },
  comparison: 'archived-client golden screenshot vs reconstructed client screenshot',
  scenarios: [],
  passed: true,
};
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-first-run', '--disable-background-networking'],
});
try {
  const page = await browser.newPage();
  for (const name of pairs) {
    const files = paths(name);
    const entry = { name, expected: files.expected, actual: files.actual };
    if (!existsSync(files.expected) || !existsSync(files.actual)) {
      entry.passed = false;
      entry.error = !existsSync(files.expected) ? 'missing golden screenshot' : 'missing reconstructed screenshot';
      report.scenarios.push(entry);
      report.passed = false;
      continue;
    }
    const expected = await readFile(files.expected);
    const actual = await readFile(files.actual);
    entry.expectedSha256 = sha256(expected);
    entry.actualSha256 = sha256(actual);
    if (entry.expectedSha256 === entry.actualSha256) {
      Object.assign(entry, { exact: true, changed: 0, pixels: 1280 * 720, ratio: 0, max: 0, mean: 0, passed: true });
      report.scenarios.push(entry);
      console.log(`${name}: exact`);
      continue;
    }
    const diff = await page.evaluate(async ([left, right]) => {
      async function load(base64) {
        const image = new Image();
        image.src = 'data:image/png;base64,' + base64;
        await image.decode();
        return image;
      }
      const a = await load(left), b = await load(right);
      if (a.width !== b.width || a.height !== b.height) {
        return { sizeMismatch: true, a: [a.width, a.height], b: [b.width, b.height] };
      }
      const canvas = document.createElement('canvas');
      canvas.width = a.width;
      canvas.height = a.height;
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
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = a.width;
      outputCanvas.height = a.height;
      const outputContext = outputCanvas.getContext('2d');
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
      return {
        width: a.width,
        height: a.height,
        changed,
        pixels: a.width * a.height,
        ratio: changed / (a.width * a.height),
        max,
        mean: sum / (a.width * a.height),
        diffImage: outputCanvas.toDataURL('image/png'),
      };
    }, [expected.toString('base64'), actual.toString('base64')]);
    Object.assign(entry, diff);
    delete entry.diffImage;
    if (diff.diffImage) {
      await mkdir(path.join(output, 'diff'), { recursive: true });
      await writeFile(path.join(output, 'diff', `${name}.png`),
        Buffer.from(diff.diffImage.split(',')[1], 'base64'));
      entry.diff = path.relative(repoRoot, path.join(output, 'diff', `${name}.png`));
    }
    entry.passed = Boolean(!diff.sizeMismatch && diff.ratio <= maxRatio && diff.max <= maxDelta);
    if (!entry.passed) report.passed = false;
    report.scenarios.push(entry);
    console.log(`${name}: ${(entry.ratio * 100).toFixed(3)}% changed, max ${entry.max}, mean ${entry.mean.toFixed(2)}`);
  }
} finally {
  await browser.close();
}
await mkdir(output, { recursive: true });
await writeFile(path.join(output, pairs.length === scenarios.length ? 'report.json' : 'report-partial.json'), JSON.stringify(report, null, 2) + '\n');
const summary = report.scenarios.map(item => ({
  name: item.name,
  passed: item.passed,
  ratio: item.ratio !== undefined ? Number((item.ratio * 100).toFixed(3)) : null,
  max: item.max ?? null,
}));
console.log(JSON.stringify({ passed: report.passed, thresholds: report.thresholds, scenarios: summary }, null, 2));
if (!report.passed) process.exitCode = 1;
