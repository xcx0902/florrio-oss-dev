/** Run-scoped product verification identities; no historical inputs. */
import { randomUUID } from 'node:crypto';
import { buildInputs, verificationInputs, treeIdentity } from './lib/identity.mjs';
export { sha256, treeIdentity } from './lib/identity.mjs';
export const sourceIdentity = buildInputs;
export async function evidence(root = process.cwd()) {
  const compact = identity => ({ schema: identity.schema, sha256: identity.sha256, fileCount: Object.keys(identity.files).length });
  return { runId: process.env.VERIFY_RUN_ID ?? null, source: compact(await buildInputs(root)), verification: compact(await verificationInputs(root)),
    client: compact(await treeIdentity(root, ['build/client', 'build/wasm/server.wasm', 'client/static'])) };
}
export function newRunId() { return `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`; }
export function sameEvidence(left, right) {
  return ['source', 'verification', 'client'].every(key => typeof left?.[key]?.sha256 === 'string' && /^[a-f0-9]{64}$/.test(left[key].sha256) && left[key].schema === right?.[key]?.schema && left[key].sha256 === right?.[key]?.sha256);
}
