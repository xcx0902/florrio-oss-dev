#!/usr/bin/env node
/** One writer, completed TAP, immutable run copy, atomic publication. */
import { startProcess } from './lib/process.mjs';
import { open, mkdir, readFile, rm } from 'node:fs/promises';
import { globSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { evidence, newRunId, sameEvidence, sha256, treeIdentity } from './verification-evidence.mjs';
import { parseTap } from './verification/tap.mjs';
import { atomicWrite, atomicJson, assertVerificationOwner, runDirectory } from './verification/io.mjs';

export async function captureTap({ name, output, command, args = [], root = process.cwd(), env = process.env }) {
  root = path.resolve(root);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name ?? '') || !command || !output)
    throw new Error('usage: run-tap.mjs NAME REPORT -- COMMAND ARGS...');
  const runId = env.VERIFY_RUN_ID ?? newRunId();
  const directory = runDirectory(root, runId);
  await assertVerificationOwner(root, env);
  output = path.resolve(root, output);
  await mkdir(directory, { recursive: true });
  await mkdir(path.dirname(output), { recursive: true });
  const handle = await open(`${output}.lock`, 'wx');
  let recordingHandle, active, interrupted = null;
  const recording = path.join(directory, `${name}.tap`);
  const metadata = { runId, startedAt: new Date().toISOString(), finishedAt: null, exitCode: null,
    command: [command, ...args], evidence: null, stable: false };
  const stop = signal => {
    interrupted = signal;
    active?.stop(signal);
  };
  const onInterrupt = () => stop('SIGINT'), onTerminate = () => stop('SIGTERM');
  try {
    // Invalidate published success even when acquiring the immutable file fails.
    await atomicJson(`${output}.meta.json`, metadata);
    recordingHandle = await open(recording, 'wx');
    const commandArgs = args.flatMap(arg => {
      if (!/[*?[]/.test(arg)) return [arg];
      const matches = [...globSync(arg, { cwd: root })].sort();
      if (!matches.length) throw new Error(`Test argument matched no files: ${arg}`);
      return matches;
    });
    metadata.command = [command, ...commandArgs];
    const before = { ...await evidence(root), runId };
    metadata.evidence = before;
    if (env.CLIENT_ROOT) metadata.target = { root: env.CLIENT_ROOT,
      ...await treeIdentity(root, [env.CLIENT_ROOT]) };
    await atomicJson(`${output}.meta.json`, metadata);
    process.once('SIGINT', onInterrupt); process.once('SIGTERM', onTerminate);
    active = startProcess(command === 'node' ? process.execPath : command, commandArgs,
      { cwd: root, env: { ...env, VERIFY_RUN_ID: runId }, stdio: ['ignore', recordingHandle.fd, 'inherit'] });
    const completion = await active.done;
    active = undefined;
    await recordingHandle.close(); recordingHandle = null;
    const tap = await readFile(recording);
    const parsed = parseTap(tap.toString('utf8'));
    const after = await evidence(root);
    let stable = sameEvidence(before, after);
    if (metadata.target) stable &&= metadata.target.sha256 === (await treeIdentity(root, [env.CLIENT_ROOT])).sha256;
    Object.assign(metadata, completion, { finishedAt: new Date().toISOString(), stable, sha256: sha256(tap), result: parsed });
    if (interrupted) { metadata.exitCode = 1; metadata.signal = interrupted; }
    await atomicJson(path.join(directory, `${name}.meta.json`), metadata);
    await atomicWrite(output, tap);
    await atomicJson(`${output}.meta.json`, metadata);
    const passed = metadata.exitCode === 0 && parsed.status === 'pass' && stable;
    return { passed, metadata, recording };
  } finally {
    process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onTerminate);
    await recordingHandle?.close().catch(() => {});
    await handle.close(); await rm(`${output}.lock`, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.indexOf('--') !== 2) throw new Error('usage: run-tap.mjs NAME REPORT -- COMMAND ARGS...');
  const result = await captureTap({ name: args[0], output: args[1], command: args[3], args: args.slice(4) });
  console.log(`${args[0]}: ${result.metadata.result.passed}/${result.metadata.result.total}, exit=${result.metadata.exitCode}, stable=${result.metadata.stable}, report=${result.recording}`);
  if (!result.passed) {
    console.error(result.metadata.error ?? result.metadata.result.issues.join('; '));
    process.exitCode = 1;
  }
}
