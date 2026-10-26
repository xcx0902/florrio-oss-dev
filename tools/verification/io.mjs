/** Atomic publication and ownership checks for verification writers. */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';

export function runDirectory(root, runId) {
  if (typeof runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId))
    throw new Error('Invalid verification run id');
  return path.join(root, 'reports/runs', runId);
}

export async function atomicWrite(file, bytes) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}
export const atomicJson = (file, value) => atomicWrite(file, JSON.stringify(value, null, 2) + '\n');

export async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) return { invalid: true, error: `Invalid JSON: ${file}` };
    throw error;
  }
}

export async function assertVerificationOwner(root = '.', env = process.env) {
  const lock = await readJson(path.join(root, 'reports/verification.lock'));
  if (lock === null && !await lstat(path.join(root, 'reports/verification.lock')).then(() => true, error => {
    if (error.code === 'ENOENT') return false; throw error;
  })) return;
  if (!lock || typeof lock.token !== 'string' || !lock.token
    || typeof lock.runId !== 'string' || !lock.runId || !env.VERIFY_LOCK_TOKEN
    || lock.token !== env.VERIFY_LOCK_TOKEN || lock.runId !== env.VERIFY_RUN_ID)
    throw new Error('Another verification run owns the reports; wait for it to finish');
}
