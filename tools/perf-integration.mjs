#!/usr/bin/env node
/** Real C++ packets through the current TS decoder and authoritative receiver. */
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SnapshotDecoder } from '../build/client/net/snapshot-decoder.js';
import { DENSE_GROUPS, DENSE_GROUP_SPECS } from '../build/client/state/field-types.js';
import { WorldState } from '../build/client/state/world.js';
import { evidence, newRunId, sameEvidence } from './verification-evidence.mjs';
import { atomicJson, assertVerificationOwner } from './verification/io.mjs';
await assertVerificationOwner();
const before = await evidence(), folder = await mkdtemp(path.join(os.tmpdir(), 'florr-perf-integration-'));
try {
  const file = path.join(folder, 'packets.bin');
  const result = spawnSync('build/engine/engine_native_snapshot_fixture', [file], { encoding: 'utf8', timeout: 30000 });
  if (result.status) throw new Error(result.stderr || 'Native integration fixture failed');
  const bytes = await readFile(file), packets = [];
  if (bytes.subarray(0, 4).toString('ascii') !== 'FLRR' || bytes[4] !== 1) throw new Error('Invalid native fixture header');
  const plans = DENSE_GROUPS.map(group => ({ offset: group.offset, specs: DENSE_GROUP_SPECS[group.offset] ?? [] }));
  let offset = 6;
  while (offset < bytes.length) { const length = bytes.readUInt32LE(offset); offset += 4; if (length > bytes.length - offset) throw new Error('Invalid native packet file'); packets.push(bytes.subarray(offset, offset + length)); offset += length; }
  if (packets.length !== bytes[5]) throw new Error('Invalid native fixture packet count');
  const start = performance.now(); let decoded = 0, count = 0;
  for (let repeat = 0; repeat < 500; repeat++) {
    const decoder = new SnapshotDecoder(plans), world = new WorldState();
    for (const packet of packets) { const snapshot = decoder.decode(packet); if (!snapshot) throw new Error('Invalid native snapshot'); world.applyDeltaSnapshot(snapshot, decoded++ * 50); }
    count += world.count;
  }
  const report = { runId: process.env.VERIFY_RUN_ID ?? newRunId(), kind: 'integration-performance', evidence: before, packets: decoded, finalEntities: count, elapsedMs: performance.now() - start,
    passed: decoded > 0 && sameEvidence(before, await evidence()) };
  await atomicJson('reports/perf-integration.json', report); console.log(JSON.stringify(report, null, 2)); if (!report.passed) process.exitCode = 1;
} finally { await rm(folder, { recursive: true, force: true }); }
