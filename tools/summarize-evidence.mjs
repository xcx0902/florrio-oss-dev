#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const summary = {};
for (const name of ['javascript-application', 'client-wasm', 'sp_server-wasm']) {
  const file = `reports/evidence/${name}.json.gz`;
  const bytes = gunzipSync(await fs.readFile(path.join(root, file)));
  const evidence = JSON.parse(bytes);
  summary[name] = {
    file, evidenceId: evidence.evidence_id,
    canonicalJsonSha256: createHash('sha256').update(bytes).digest('hex'),
    subject: evidence.subject, provider: evidence.provider,
    operation: evidence.operation, limitations: evidence.limitations,
    facts: name === 'javascript-application'
      ? { statistics: evidence.normalized_result.statistics, summary: evidence.normalized_result.summary }
      : { validation: evidence.normalized_result.validation, runtimeExecution: evidence.normalized_result.runtime_execution,
        networkFetch: evidence.normalized_result.network_fetch, toolProfile: evidence.normalized_result.tool_profile },
  };
}
await fs.writeFile(path.join(root, 'reports/evidence/summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log('Verified and summarized three complete compressed REA Evidence records.');
