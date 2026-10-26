#!/usr/bin/env node
/** Verified copy / move / restore of the frozen oracle. Default is read-only.
 * Move leaves compatibility links so existing reference and oracle paths keep
 * working. Do not execute --move before the final acceptance checks pass.
 */
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, symlink, lstat, readlink, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { atomicWrite, atomicJson, readJson } from './verification/io.mjs';
import { evidence, sameEvidence, treeIdentity } from './verification-evidence.mjs';
import { requiredSteps, tapPaths } from './verification/gates.mjs';

const defaults = ['source/game', 'source/javascript', 'source/wasm', 'web', 'upstream', 'reports'];
const gameDependencies = ['source/runtime', 'source/semantic'];
// Only current acceptance publications may replace pre-move report files.
// All other existing reports (including old run evidence) remain immutable.
const liveReports = new Set(['current-verification.json', 'latest-run.json', 'perf.json',
  'entrypoint-smoke.json', 'entrypoints/default.png', 'entrypoints/reference.png',
  ...Object.values(tapPaths).flatMap(file => [file.slice('reports/'.length), file.slice('reports/'.length) + '.meta.json'])]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function tree(directory, { inventory = false } = {}) {
  const hash = createHash('sha256');
  let files = 0, bytes = 0;
  const entries = [];
  async function visit(folder, prefix = '') {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.name === '.DS_Store') continue;
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) await visit(path.join(folder, entry.name), relative);
      else if (entry.isFile()) {
        const body = await readFile(path.join(folder, entry.name));
        hash.update(relative).update('\0').update(body);
        files++; bytes += body.length;
        if (inventory) entries.push({ path: relative, bytes: body.length, sha256: digest(body) });
      } else throw new Error(`Archive refuses a nested symlink/special file: ${relative}`);
    }
  }
  await visit(directory);
  return { files, bytes, sha256: hash.digest('hex'), ...(inventory ? { entries } : {}) };
}
const same = (a, b) => a.files === b.files && a.bytes === b.bytes && a.sha256 === b.sha256;

async function frozenReportKeys(root, entries) {
  const reference = await readJson(path.join(root, 'reference/manifest.json'));
  if (reference && (reference.invalid || !reference.keyFiles || typeof reference.keyFiles !== 'object' || Array.isArray(reference.keyFiles)))
    throw new Error('Frozen report manifest is invalid');
  const actual = new Map(entries.map(entry => [entry.path, entry]));
  const keys = new Set();
  for (const [name, expected] of Object.entries(reference?.keyFiles ?? {})) {
    if (!name.startsWith('reports/')) continue;
    const relative = name.slice('reports/'.length), file = actual.get(relative);
    if (!file || !expected || file.bytes !== expected.bytes || file.sha256 !== expected.sha256)
      throw new Error(`Frozen report identity differs: ${name}`);
    keys.add(relative);
  }
  return keys;
}

async function createReportPolicy(root, entries) {
  const frozen = await frozenReportKeys(root, entries);
  const immutableFiles = entries.filter(entry => !liveReports.has(entry.path) || frozen.has(entry.path));
  return { schema: 1, immutableFiles, sha256: digest(JSON.stringify(immutableFiles)) };
}

async function verifyReportPolicy(root, entries, policy) {
  const fail = detail => { throw new Error(`Restore archive identity differs: reports (${detail})`); };
  if (policy?.schema !== 1 || !Array.isArray(policy.immutableFiles)
    || policy.sha256 !== digest(JSON.stringify(policy.immutableFiles))) fail('invalid report policy');
  const actual = new Map(entries.map(entry => [entry.path, entry])), seen = new Set();
  for (const expected of policy.immutableFiles) {
    if (!expected || typeof expected.path !== 'string' || seen.has(expected.path)
      || !Number.isSafeInteger(expected.bytes) || expected.bytes < 0
      || typeof expected.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expected.sha256)) fail('invalid immutable file');
    seen.add(expected.path);
    const file = actual.get(expected.path);
    if (!file || file.bytes !== expected.bytes || file.sha256 !== expected.sha256) fail(expected.path);
  }
  // Frozen keys win even if a future oracle names a normally live report.
  await frozenReportKeys(root, entries);
}

function validateSources(sources) {
  if (!Array.isArray(sources) || !sources.length) throw new Error('Archive sources must be a nonempty array');
  for (const source of sources) {
    if (typeof source !== 'string' || !source || source.includes('\\') || source.split('/').some(part => !part || part === '..' || part === '.') || path.isAbsolute(source)
      || source === 'legacy' || source.startsWith('legacy/')) throw new Error(`Unsafe archive source: ${source}`);
  }
  if (sources.some((source, index) => sources.some((other, otherIndex) => index !== otherIndex && (source === other || source.startsWith(other + '/')))))
    throw new Error('Archive sources overlap');
}

export async function archiveLegacy({ root = '.', mode = 'dry-run', sources = defaults, requireAcceptance = true, onProgress = async () => {} } = {}) {
  root = path.resolve(root);
  if (!['dry-run', 'copy', 'move', 'restore'].includes(mode)) throw new Error(`Unknown archive mode: ${mode}`);
  validateSources(sources);
  if (mode !== 'dry-run' && existsSync(path.join(root, 'reports/verification.lock')))
    throw new Error('Wait for the active verification writer before archiving');
  if (mode !== 'dry-run') {
    const operation = await readJson(path.join(root, 'legacy/archive-operation.json'));
    if (operation && (operation.invalid || operation.state !== 'complete'))
      throw new Error('Archive recovery is required; inspect the retained transaction before another operation');
  }
  if (mode === 'move' && requireAcceptance) {
    const ledger = await readJson(path.join(root, 'reports/current-verification.json'));
    const run = await readJson(path.join(root, 'reports/latest-run.json'));
    if (ledger?.passed !== true || run?.passed !== true || run.stable !== true || !run.finishedAt || !ledger.runId
      || ledger.runId !== run.runId || ledger.evidence?.runId !== run.runId || run.evidence?.runId !== run.runId
      || !Array.isArray(ledger.knownGaps) || ledger.knownGaps.length || run.error
      || !sameEvidence(ledger.evidence, run.evidence) || !sameEvidence(ledger.evidence, await evidence(root))
      || !Array.isArray(run.steps) || ![...requiredSteps, 'ledger'].every(name => {
        const steps = run.steps.filter(step => step?.name === name);
        return steps.length === 1 && steps[0].exitCode === 0 && !steps[0].error && !steps[0].signal
          && Number.isFinite(Date.parse(steps[0].startedAt)) && Number.isFinite(Date.parse(steps[0].finishedAt))
          && Date.parse(steps[0].finishedAt) >= Date.parse(steps[0].startedAt);
      }) || !Number.isFinite(Date.parse(run.finishedAt))
      || !ledger.delivery?.sha256 || ledger.delivery.sha256 !== run.delivery?.sha256
      || ledger.delivery.sha256 !== (await treeIdentity(root, ['dist-next'])).sha256)
      throw new Error('Final archive move requires a complete passing current mainline run, ledger and delivery identity');
  }
  let recorded = null;
  if (mode === 'restore') {
    recorded = JSON.parse(await readFile(path.join(root, 'legacy/archive-manifest.json'), 'utf8'));
    if (sources === defaults) sources = recorded.sources.map(entry => entry.source);
    if (!['move', 'copy'].includes(recorded.mode)) throw new Error('No completed archive move/copy to restore');
  }
  validateSources(sources);
  // Never follow a parent link outside the selected root.
  for (const source of sources) {
    for (const relative of [source.split('/').slice(0, -1).join('/'), `legacy/${source}`.split('/').slice(0, -1).join('/')]) {
      let parent = root;
      for (const part of relative.split('/').filter(Boolean)) {
        parent = path.join(parent, part);
        const info = await lstat(parent).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        if (info && !info.isDirectory()) throw new Error(`Archive parent must be a real directory: ${parent}`);
      }
    }
  }
  const plan = [];
  // Preflight every source before any mutation. Existing copy targets must be
  // exact for move/restore; a stale copy can be refreshed with --copy first.
  for (const source of sources) {
    const original = path.join(root, source), target = path.join(root, 'legacy', source);
    const info = await lstat(original).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (mode === 'restore') {
      if (!existsSync(target)) throw new Error(`Restore archive is missing: ${source}`);
      if (!(await lstat(target)).isDirectory()) throw new Error(`Archive target must be a real directory: ${source}`);
      const expected = recorded.sources?.find(entry => entry.source === source);
      const reportPolicy = recorded.mode === 'move' && source === 'reports' ? expected?.reportPolicy : undefined;
      const { entries, ...actual } = await tree(target, { inventory: !!reportPolicy });
      if (reportPolicy) await verifyReportPolicy(root, entries, reportPolicy);
      else if (!expected || !same(expected, actual)) throw new Error(`Restore archive identity differs: ${source}`);
      const copyOnly = recorded.mode === 'copy' && info?.isDirectory();
      if (copyOnly && !same(actual, await tree(original))) throw new Error(`Restore copy differs from original: ${source}`);
      if (info && !copyOnly && (!info.isSymbolicLink() || path.resolve(path.dirname(original), await readlink(original)) !== target))
        throw new Error(`Restore would overwrite ${source}`);
      // Pin the entire current tree for this transaction, including every new
      // report. Restore renames it intact and verifies this fresh full hash.
      plan.push({ source, ...actual, ...(reportPolicy ? { reportPolicy } : {}), original, target, copyOnly });
      continue;
    }
    if (!info) continue;
    if (info.isSymbolicLink()) {
      if (path.resolve(path.dirname(original), await readlink(original)) !== target) throw new Error(`Unexpected symlink ${source}`);
      if (mode === 'copy') throw new Error(`Restore moved sources before copying: ${source}`);
      if (!(await lstat(target)).isDirectory()) throw new Error(`Archive target must be a real directory: ${source}`);
      const manifest = await readJson(path.join(root, 'legacy/archive-manifest.json'));
      const expected = manifest?.sources?.find(entry => entry.source === source);
      const reportPolicy = mode === 'move' && source === 'reports' ? expected?.reportPolicy : undefined;
      const { entries, ...identity } = await tree(target, { inventory: !!reportPolicy });
      if (reportPolicy) await verifyReportPolicy(root, entries, reportPolicy);
      else if (mode === 'move' && (!expected || !same(expected, identity))) throw new Error(`Moved archive identity differs: ${source}`);
      plan.push({ source, ...identity, ...(reportPolicy ? { reportPolicy } : {}), original, target, alreadyMoved: true });
      continue;
    }
    if (existsSync(target) && !(await lstat(target)).isDirectory()) throw new Error(`Archive target must be a real directory: ${source}`);
    const { entries, ...identity } = await tree(original, { inventory: mode === 'move' && source === 'reports' });
    const reportPolicy = entries ? await createReportPolicy(root, entries) : undefined;
    if (mode === 'move' && existsSync(target) && !same(identity, await tree(target)))
      throw new Error(`Existing archive differs: ${source}; refresh and verify with --copy before --move`);
    plan.push({ source, ...identity, ...(reportPolicy ? { reportPolicy } : {}), original, target });
  }
  // ESM resolves imports from the archived module's real path. These bridges
  // sit beside, never inside, the archived oracle trees.
  const game = plan.find(entry => entry.source === 'source/game');
  const bridgeManifest = recorded ?? await readJson(path.join(root, 'legacy/archive-manifest.json'));
  const bridges = [];
  if (game && (mode === 'move' || (mode === 'restore' && recorded.mode === 'move'))) {
    const savedBridges = bridgeManifest?.dependencyBridges ?? [];
    if (!Array.isArray(savedBridges) || new Set(savedBridges.map(entry => entry?.path)).size !== savedBridges.length
      || savedBridges.some(entry => !gameDependencies.some(dependency => entry?.path === `legacy/${dependency}` && entry.target === dependency)))
      throw new Error('Unexpected dependency bridge metadata');
    for (const dependency of gameDependencies) {
      if (sources.some(source => dependency === source || dependency.startsWith(source + '/')))
        throw new Error(`Archive dependency must remain in place: ${dependency}`);
      const relative = `legacy/${dependency}`, link = path.join(root, relative), target = path.join(root, dependency);
      const info = await lstat(link).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      const targetInfo = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      const saved = bridgeManifest?.dependencyBridges?.find(entry => entry.path === relative);
      const existing = mode === 'restore' || game.alreadyMoved;
      if (existing && !saved) {
        if (info || (mode === 'move' && targetInfo)) throw new Error(`Unexpected dependency bridge: ${relative}`);
        continue; // Older manifests without bridges retain their strict tree checks.
      }
      if (!targetInfo && !info && !saved) continue;
      if (!targetInfo?.isDirectory()) throw new Error(`Dependency target must be a real directory: ${dependency}`);
      const identity = await tree(target);
      if (existing && (saved.target !== dependency || !same(saved, identity)))
        throw new Error(`Dependency bridge identity differs: ${dependency}`);
      if (existing ? !info?.isSymbolicLink() || path.resolve(path.dirname(link), await readlink(link)) !== target : info)
        throw new Error(`Unexpected dependency bridge: ${relative}`);
      bridges.push({ path: relative, target: dependency, ...identity });
    }
  }
  const publicPlan = () => plan.map(({ original, target, ...entry }) => entry);
  if (mode === 'dry-run') return { mode, sources: publicPlan() };
  if (!plan.length) throw new Error('Archive plan is empty');
  await mkdir(path.join(root, 'legacy'), { recursive: true });
  const lock = await open(path.join(root, 'legacy/.archive.lock'), 'wx');
  const transaction = path.join(root, 'legacy', `.archive-transaction-${randomUUID()}`);
  const journal = path.join(root, 'legacy/archive-operation.json');
  const metadataPaths = ['archive-manifest.json', 'README.md', 'archive-operation.json'].map(file => path.join(root, 'legacy', file));
  const previousMetadata = [];
  const undo = [];
  let committed = false, rollbackFailed = false;
  try {
    for (const file of metadataPaths) previousMetadata.push(await readFile(file).catch(error => {
      if (error.code === 'ENOENT') return null; throw error;
    }));
    await mkdir(transaction);
    const progress = state => atomicJson(journal, { mode, state, transaction: path.relative(root, transaction),
      dependencyBridges: bridges, sources: publicPlan() });
    await progress('in-progress');
    async function move(from, to) {
      await mkdir(path.dirname(to), { recursive: true });
      await rename(from, to);
      undo.push(async () => { await mkdir(path.dirname(from), { recursive: true }); await rename(to, from); });
    }
    async function verifyBridge(bridge) {
      const link = path.join(root, bridge.path), target = path.join(root, bridge.target);
      const info = await lstat(link);
      if (!info.isSymbolicLink() || path.resolve(path.dirname(link), await readlink(link)) !== target
        || !(await lstat(target)).isDirectory() || !same(bridge, await tree(target)))
        throw new Error(`Dependency bridge identity differs: ${bridge.path}`);
    }
    for (const bridge of bridges) {
      const link = path.join(root, bridge.path), target = path.join(root, bridge.target);
      if (mode === 'move' && !game.alreadyMoved) {
        if (!same(bridge, await tree(target))) throw new Error(`Dependency bridge identity differs: ${bridge.target}`);
        await mkdir(path.dirname(link), { recursive: true });
        await symlink(path.relative(path.dirname(link), target), link, 'dir');
        undo.push(() => rm(link));
      }
      await verifyBridge(bridge);
    }
    for (const [index, entry] of plan.entries()) {
      if (entry.alreadyMoved && mode !== 'restore') continue;
      // Recheck immediately before moving any original. Backups are retained
      // until every operation and the final metadata publication has succeeded.
      if (!same(entry, await tree(mode === 'restore' ? entry.target : entry.original)))
        throw new Error(`Archive input changed during operation: ${entry.source}`);
      await mkdir(path.dirname(mode === 'restore' ? entry.original : entry.target), { recursive: true });
      if (mode === 'copy') {
        const staging = path.join(transaction, `stage-${index}`);
        await cp(entry.original, staging, { recursive: true });
        if (!same(entry, await tree(staging))) throw new Error(`Copy verification failed: ${entry.source}`);
        if (existsSync(entry.target)) await move(entry.target, path.join(transaction, `target-${index}`));
        await move(staging, entry.target);
      } else if (mode === 'move') {
        if (existsSync(entry.target)) {
          if (!same(entry, await tree(entry.target))) throw new Error(`Existing archive differs: ${entry.source}`);
          const backup = path.join(transaction, `original-${index}`);
          await move(entry.original, backup);
          if (!same(entry, await tree(backup))) throw new Error(`Original changed before move: ${entry.source}`);
        } else await move(entry.original, entry.target);
        await symlink(path.relative(path.dirname(entry.original), entry.target), entry.original, 'dir');
        undo.push(() => rm(entry.original));
      } else if (entry.copyOnly) {
        await move(entry.target, path.join(transaction, `copy-${index}`));
      } else {
        const link = await lstat(entry.original).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        if (link) {
          const destination = await readlink(entry.original);
          await rm(entry.original);
          undo.push(() => symlink(destination, entry.original, 'dir'));
        }
        await move(entry.target, entry.original);
      }
      const actual = await tree(mode === 'restore' ? entry.original : entry.target);
      if (!same(entry, actual)) throw new Error(`Post-operation verification failed: ${entry.source}`);
      entry.completed = true;
      await progress('in-progress');
      await onProgress({ source: entry.source, mode, completed: true });
    }
    for (const bridge of bridges) {
      await verifyBridge(bridge);
      if (mode === 'restore') {
        await move(path.join(root, bridge.path), path.join(transaction, `bridge-${path.basename(bridge.target)}`));
        await onProgress({ source: bridge.path, mode, completed: true, dependencyBridge: true });
      }
    }
    const manifest = { schema: 4, generatedAt: new Date().toISOString(), mode,
      compatibilityLinks: mode === 'move', dependencyBridges: mode === 'move' ? bridges : [], sources: publicPlan() };
    await atomicJson(metadataPaths[0], manifest);
    await atomicWrite(metadataPaths[1], [
      '# Legacy oracle archive', '', `Verified operation: ${mode}.`, '',
      mode === 'move' ? 'Oracle directories live here. Compatibility symlinks preserve existing reference paths.'
        : mode === 'restore' ? 'Oracle directories were restored to their original locations.' : 'Verified copies are retained here; originals remain in place.',
      '', 'Use `node tools/archive-legacy.mjs --restore` to verify and restore a move.',
      'Use `node tools/archive-legacy.mjs --copy` to refresh an existing rehearsal copy.',
      'The final --move requires a current passing mainline ledger and delivery identity.',
      'Failed operations roll back assets and metadata. A recovery-required journal retains backups for inspection.', '',
    ].join('\n'));
    await atomicJson(journal, { ...manifest, state: 'complete' });
    committed = true;
    return manifest;
  } catch (error) {
    const failures = [];
    for (const rollback of undo.reverse()) { try { await rollback(); } catch (failure) { failures.push(failure.message); } }
    if (!failures.length) {
      for (const [index, bytes] of previousMetadata.entries()) {
        try { if (bytes === null) await rm(metadataPaths[index], { force: true }); else await atomicWrite(metadataPaths[index], bytes); }
        catch (failure) { failures.push(failure.message); }
      }
    }
    rollbackFailed = failures.length > 0;
    if (rollbackFailed) {
      await atomicJson(journal, { mode, state: 'recovery-required', transaction: path.relative(root, transaction),
        error: error.message, rollbackErrors: failures, dependencyBridges: bridges, sources: publicPlan() });
      throw new AggregateError([error, ...failures.map(message => new Error(message))], 'Archive rollback needs recovery; backups retained');
    }
    throw error;
  } finally {
    if (!rollbackFailed) await rm(transaction, { recursive: true, force: true }).catch(error => {
      if (!committed) throw error;
      console.error(`Archive completed; retained cleanup directory ${transaction}: ${error.message}`);
    });
    await lock.close(); await rm(path.join(root, 'legacy/.archive.lock'), { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const modes = ['copy', 'move', 'restore'].filter(mode => process.argv.includes(`--${mode}`));
  if (modes.length > 1) throw new Error('Choose only one of --copy, --move, --restore');
  console.log(JSON.stringify(await archiveLegacy({ mode: modes[0] ?? 'dry-run' }), null, 2));
}
