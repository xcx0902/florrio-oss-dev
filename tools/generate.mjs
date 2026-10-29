#!/usr/bin/env node
/**
 * Unified product schema generator.
 *
 *   node tools/generate.mjs           # validate, compute all outputs, then write
 *   node tools/generate.mjs --check   # read-only: fail on missing/stale/extra output
 *
 * Every input is validated and every output is computed before the first write.
 */
import path from 'node:path';
import { buildOutputs } from './schema/outputs.mjs';
import { checkOutputs, writeOutputs } from './schema/write.mjs';

const args = process.argv.slice(2);
const known = new Set(['--check']);
for (const arg of args) if (!known.has(arg)) throw new Error(`unknown option ${arg}`);
const root = path.resolve('.');
const { outputs, summary } = await buildOutputs(root);
if (args.includes('--check')) {
  const count = await checkOutputs(root, outputs);
  console.log(JSON.stringify({ mode: 'check', ...summary, verified: count }));
} else {
  const result = await writeOutputs(root, outputs);
  console.log(JSON.stringify({ mode: 'generate', ...summary, written: result.written, manifest: result.manifest }));
}
