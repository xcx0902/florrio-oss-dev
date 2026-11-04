#!/usr/bin/env node
/**
 * Install the exact clang-format and cmake-format versions used by the format
 * gate. The virtual environment lives under the ignored `.emcache/` directory;
 * nothing is installed into the product tree. Schema-generated output is
 * written verbatim by `tools/generate.mjs` and never uses these tools.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PRODUCT_ROOT, formatToolLock, resolveTool } from './lib/format-tools.mjs';

const environment = path.join(PRODUCT_ROOT, '.emcache/tools/format');
const windows = process.platform === 'win32';
const python = path.join(environment, windows ? 'Scripts/python.exe' : 'bin/python');
const pip = path.join(environment, windows ? 'Scripts/pip.exe' : 'bin/pip');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: PRODUCT_ROOT, stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(python)) {
  run('python3', ['-m', 'venv', environment]);
}
const packages = Object.values(formatToolLock().packages);
run(pip, ['install', '--disable-pip-version-check', '--no-input', ...packages]);
for (const name of ['clang-format', 'cmake-format']) {
  const tool = resolveTool(name, { pathLookup: false });
  console.log(`${tool.name} ${tool.version}: ${tool.command}`);
}
