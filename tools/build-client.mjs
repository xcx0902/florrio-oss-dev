#!/usr/bin/env node
/** Compile into a fresh staging tree so removed TS sources cannot survive. */
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { treeIdentity } from './lib/identity.mjs';
import { assertVerificationOwner } from './verification/io.mjs';
await assertVerificationOwner();
await mkdir('build', { recursive: true });
const stage = `build/client.stage-${randomUUID()}`, previous = `build/client.previous-${randomUUID()}`;
const lock = await open('build/client.lock', 'wx');
const inputs = () => treeIdentity('.', ['client/src', 'client/tsconfig.json']);
try {
  const before = await inputs();
  const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'client/tsconfig.json', '--outDir', stage], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`TypeScript compilation failed: ${result.status ?? result.signal}`);
  if (before.sha256 !== (await inputs()).sha256) throw new Error('TypeScript inputs changed during compilation');
  const exists = await stat('build/client').then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  if (exists) await rename('build/client', previous);
  try { await rename(stage, 'build/client'); } catch (error) { if (exists) await rename(previous, 'build/client'); throw error; }
  if (exists) await rm(previous, { recursive: true });
} finally { await rm(stage, { recursive: true, force: true }); await lock.close(); await rm('build/client.lock', { force: true }); }
