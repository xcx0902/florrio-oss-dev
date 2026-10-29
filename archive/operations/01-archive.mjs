#!/usr/bin/env node
/**
 * One-time 01-archive-and-disable migration.
 *
 * Reads the committed working tree from the repository root, moves the
 * historical oracle material under archive/tree with its original relative
 * path, removes the root compatibility links, creates the product reports
 * directory, and writes archive/inventory.json plus archive/migration-map.json.
 *
 * This file is historical evidence. It is not a build script, not an npm script
 * and not part of any active workflow.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, readlinkSync, renameSync, cpSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const archiveRoot = path.join(root, 'archive/tree');
const rel = (base, target) => path.relative(base, target).split(path.sep).join('/');
const lstat = target => { try { return lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean));

const actions = [];
const action = (source, disposition, reason, productReplacement = null, extra = {}) => actions.push({ source, disposition, reason, productReplacement, ...extra });

// Directories archived as a whole, preserving their repository-relative path.
for (const [source, reason, replacement] of [
  ['legacy', 'Original upstream web tree, recovered JS/WASM source, historical reports and the earlier archive manifests leave the active tree.', null],
  ['source', 'Reverse-engineering runtime, semantic extracts, decompiled views, recovered source and original asset copies are reference-only. Product data that was still needed is promoted first.', 'schema/transport.json (packet XOR key)'],
  ['reference', 'Frozen upstream identity manifests and transport tarball are historical reference, not build input.', null],
  ['test', 'Function-level oracle tests. Product contracts were migrated to tests/unit and tests/tools before this move.', 'tests/unit/protocol-contracts.test.mjs; tests/tools/'],
  ['tests/parity', 'Parity scenarios, goldens, recordings, screenshots and comparators compared against the archived client/engine.', null],
  ['engine/tests/oracle', 'Native oracle evidence and the native-state replay executable; the CMake engine_native_replay target was removed.', null],
  ['tools/parity', 'Browser injectors, virtual clocks, trace comparators and parity scenario drivers.', null],
  ['tools/probes', 'Live and native menu probes that instantiate archived artifacts.', null],
  ['dist', 'Locally generated historical delivery tree. Kept as a sample under archive/tree; also present in reference/frozen-trees.tar.gz. This directory was gitignored, so it is not part of a fresh clone.', null],
  ['dist-readable', 'Locally generated readable recovery tree. Kept as a sample under archive/tree; also present in reference/frozen-trees.tar.gz. This directory was gitignored, so it is not part of a fresh clone.', null],
  ['dist-reference', 'Locally generated reference build. Kept as a sample under archive/tree; also present in reference/frozen-trees.tar.gz. This directory was gitignored, so it is not part of a fresh clone.', null],
  ['tools/vendor', 'Local vendored dependency cache used only by the archived recovery tooling. Not source history and not part of a fresh clone.', null],
]) action(source, 'archive', reason, replacement);

// Individual reverse-engineering and probe tools.
// This generator was replaced by a CHANGELOG.md reader at the same active
// path; its previous body is archived under an explicit historical name.
const archiveRenames = new Map([['tools/gen-menu-content.mjs', 'tools/gen-menu-content-from-wasm.mjs']]);
actions.push({ source: 'tools/gen-menu-content.mjs', destination: 'tools/gen-menu-content-from-wasm.mjs',
  disposition: 'archive', productReplacement: 'tools/gen-menu-content.mjs', alreadyArchived: true,
  reason: 'Old generator parsed the frozen web/client.wasm changelog table. It was replaced by a generator that reads the project CHANGELOG.md; this archive copy is the frozen-WASM version.' });
const toolSources = [
  'tools/build.mjs',
  'tools/recover-javascript.mjs',
  'tools/javascript-recovery-names.mjs',
  'tools/recover-wasm.mjs',
  'tools/extract-closure-plans.mjs',
  'tools/verify-javascript.mjs',
  'tools/lib/readable-wasm.mjs',
  'tools/lib/wasm-binary.mjs',
  'tools/fetch-upstream.sh',
  'tools/reference-manifest.mjs',
  'tools/refreeze-reference.mjs',
  'tools/prepare-reference.mjs',
  'tools/verify-reference.mjs',
  'tools/archive-legacy.mjs',
  'tools/inventory-remaining.mjs',
  'tools/write-reconstruction-report.mjs',
  'tools/write-verification-report.mjs',
  'tools/summarize-evidence.mjs',
  'tools/probe-game.mjs',
  'tools/probe-entity-defaults.mjs',
  'tools/probe-menu.mjs',
  'tools/probe-menu-canvas.mjs',
  'tools/probe-menu-details.mjs',
  'tools/layout-probe.mjs',
  'tools/split-catalogs.mjs',
  'tools/derive-petal-combat.mjs',
  'tools/derive-drop-chances.mjs',
  'tools/collect-release.mjs',
  'tools/write-current-verification.mjs',
  'tools/verification/gates.mjs',
  'tools/verification/report-status.mjs',
  'tools/verification/release-rehearsal.mjs',
];
for (const source of toolSources)
  action(source, 'archive', 'Reverse-engineering, probe, frozen-reference or historical reporting tool; no current product consumer.', null);

// Root probe entrypoint.
action('probe-life.mjs', 'archive', 'Directly calls loadOriginal and archived source/game modules.', null);

// Native test helper for the removed archived-client adapter.
action('engine/tests/unit/test_original_client_adapter.hpp', 'archive',
  'Independent decoder for OriginalClientSnapshotWriter and the archived original_client_* stream; the implementation and its callers were removed from the product.', null);

// Client tests whose inputs are the archived oracle, parity goldens or source tree.
const archivedClientTests = [
  'angle-interpolation.test.mjs', 'arena-boundary.test.mjs', 'camera-golden.test.mjs', 'camera-input.test.mjs',
  'camera-projection.test.mjs', 'drop-art.test.mjs', 'entity-art.test.mjs', 'hud-golden.test.mjs',
  'menu-golden.test.mjs', 'menu-input-parity.test.mjs', 'pan.test.mjs', 'petal-art.test.mjs',
  'petal-motion.test.mjs', 'recharge.test.mjs', 'render-camera.test.mjs', 'render-golden.test.mjs',
  'rendering-parity.test.mjs', 'species-animation.test.mjs', 'text-cache.test.mjs', 'ui-detail-parity.test.mjs',
  'world-transform.test.mjs', 'zone-warning.test.mjs',
];
for (const name of archivedClientTests)
  action(`client/tests/${name}`, 'archive', 'Test input or expected value comes from the archived original, parity golden or source tree; product behaviour remains covered by the retained client suite.', null);
for (const name of ['rendering-oracle.mjs', 'petal-oracle.mjs', 'drop-oracle.mjs'])
  action(`client/tests/helpers/${name}`, 'archive', 'Original-WASM comparison helper; the product recording context was extracted to recording-canvas.mjs.', 'client/tests/helpers/recording-canvas.mjs');
action('client/tests/fixtures/menu-details-native.json', 'archive', 'Native menu fixture produced from archived artifacts; no retained product test reads it.', null);

// Historical documents and evidence.
const docSources = [
  'goal.md', 'audit.gpt61sol.md',
  'docs/function-recovery.md', 'docs/parity.md', 'docs/release-acceptance.md', 'docs/audit-resolution.md',
  'docs/legacy.md', 'docs/ui-repair.md', 'docs/schema-coverage.md', 'docs/adr/0002-visual-gate.md',
  'docs/semantics/ui-detail-parity.md',
  'docs/parity-death-2026-10-27.md', 'docs/parity-death-menu-ui-2026-10-28.md', 'docs/parity-fixes-2026-10-27.md',
  'docs/parity-menu-zone-2026-10-27.md', 'docs/parity-passives-pets-2026-10-27.json',
  'docs/parity-passives-pets-2026-10-27.md', 'docs/parity-projectiles-2026-10-27.md',
  'docs/parity-rendering-2026-10-27.md', 'docs/parity-tooltip-death-row-2026-10-28.md',
  'docs/parity-validation-2026-10-27.json', 'docs/parity-web-slow-cheats-2026-10-28.md',
];
for (const source of docSources)
  action(source, 'archive', 'Historical work record, parity report or original-evidence document; product rules live in the rewritten active docs.', null);

// Specimen copies: the original active docs are rewritten in place, so preserve
// the pre-rewrite text and its original evidence as archive-only provenance.
const copies = [
  ['docs/semantics', 'docs/semantics', 'Pre-rewrite semantics documents retained as the archived source table for original function numbers, offsets and differential evidence.'],
  ['README.md', 'docs/readmes/README.md', 'Pre-rewrite root README specimen.'],
  ['engine/README.md', 'docs/readmes/engine-README.md', 'Pre-rewrite engine README specimen.'],
  ['client/README.md', 'docs/readmes/client-README.md', 'Pre-rewrite client README specimen.'],
  ['schema/README.md', 'docs/readmes/schema-README.md', 'Pre-rewrite schema README specimen.'],
];
action('schema/generated/layout-probe.json', 'archive', 'Frozen original-layout probe (artifact hash, decoded record bytes and table bases) is historical evidence. The active schema gate now checks only YAML against the compiler.', 'schema/layout/*.yaml + engine/tests/unit/test_schema_contracts.cpp');

for (const [source, destination, reason] of copies)
  actions.push({ source, destination, disposition: 'copy', reason, productReplacement: source });

// Compatibility links are removed, not moved into the archive. They are
// recorded in the inventory with their lstat type and readlink target.
const removedLinks = [
  ['web', 'Compatibility link to legacy/web.'],
  ['upstream', 'Compatibility link to legacy/upstream.'],
  ['reports', 'Compatibility link to legacy/reports; replaced by a real product reports directory.'],
];
const linkRecords = [];

// --- execute ---------------------------------------------------------------
const removed = [];
for (const entry of actions) {
  if (entry.alreadyArchived) { removed.push(`${entry.source} (already archived as ${entry.destination})`); continue; }
  const sourcePath = path.join(root, entry.source);
  const stat = lstat(sourcePath);
  const destinationPath = path.join(archiveRoot, entry.destination ?? entry.source);
  if (!stat) {
    if (lstat(destinationPath)) { removed.push(`${entry.source} (already moved)`); continue; }
    throw new Error(`archive source missing: ${entry.source}`);
  }
  mkdirSync(path.dirname(destinationPath), { recursive: true });
  if (entry.disposition === 'copy') {
    if (lstat(destinationPath)) continue; // preserve the first specimen copy
    cpSync(sourcePath, destinationPath, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
  } else {
    renameSync(sourcePath, destinationPath);
    removed.push(entry.source);
  }
}

for (const [name, reason] of removedLinks) {
  const target = path.join(root, name), stat = lstat(target);
  if (!stat) continue;
  if (!stat.isSymbolicLink()) {
    // reports/ is the intended real product directory after the first pass.
    if (name === 'reports' && stat.isDirectory()) continue;
    throw new Error(`expected a symlink, found ${name}`);
  }
  const linkTarget = readlinkSync(target);
  linkRecords.push({ originalPath: name, archivePath: null, type: 'symlink', bytes: Buffer.byteLength(linkTarget), sha256: null, linkTarget, tracked: tracked.has(name), disposition: 'remove-generated', reason });
  unlinkSync(target);
}
const reportsPath = path.join(root, 'reports');
if (lstat(reportsPath)?.isSymbolicLink()) unlinkSync(reportsPath);
mkdirSync(reportsPath, { recursive: true });
writeFileSync(path.join(reportsPath, '.gitkeep'), '');

// --- inventory -------------------------------------------------------------
const copyMap = actions.filter(entry => entry.disposition === 'copy').map(entry => ({
  archive: (entry.destination ?? entry.source).replace(/\/$/, ''),
  original: entry.source.replace(/\/$/, ''),
}));
function originalFor(archivePath) {
  for (const [originalPath, archivedPath] of archiveRenames)
    if (archivePath === archivedPath) return { originalPath, origin: 'moved' };
  for (const mapping of copyMap) {
    if (archivePath === mapping.archive) return { originalPath: mapping.original, origin: 'copy' };
    if (archivePath.startsWith(mapping.archive + '/'))
      return { originalPath: mapping.original + archivePath.slice(mapping.archive.length), origin: 'copy' };
  }
  return { originalPath: archivePath, origin: 'moved' };
}
const entries = [];
function walk(directory) {
  for (const name of readdirSync(directory, { withFileTypes: true })) {
    if (name.name === '.DS_Store') continue;
    const full = path.join(directory, name.name), stat = lstatSync(full);
    const archivePath = rel(archiveRoot, full);
    const { originalPath, origin } = originalFor(archivePath);
    const trackedFile = tracked.has(originalPath);
    if (stat.isSymbolicLink()) {
      const linkTarget = readlinkSync(full);
      entries.push({ originalPath, archivePath, type: 'symlink', bytes: Buffer.byteLength(linkTarget), sha256: null, linkTarget, tracked: trackedFile, origin });
    } else if (stat.isDirectory()) {
      walk(full);
    } else if (stat.isFile()) {
      const bytes = readFileSync(full);
      entries.push({ originalPath, archivePath, type: 'file', bytes: bytes.length, sha256: sha256(bytes), linkTarget: null, tracked: trackedFile, origin,
        note: trackedFile ? undefined : generatedNote(archivePath) });
    }
  }
}
function generatedNote(archivePath) {
  if (/^legacy\/reports\//.test(archivePath)) return 'Locally generated historical report; gitignored, not guaranteed in a fresh clone.';
  if (/^tests\/parity\//.test(archivePath)) return 'Locally generated parity recording/golden; gitignored, not guaranteed in a fresh clone.';
  if (/^dist(-readable|-reference)?\//.test(archivePath)) return 'Locally generated delivery tree; gitignored, not guaranteed in a fresh clone.';
  if (/^tools\/vendor\//.test(archivePath)) return 'Local dependency cache; gitignored, not guaranteed in a fresh clone.';
  return undefined;
}
walk(archiveRoot);
entries.push(...linkRecords);
entries.sort((left, right) => left.originalPath.localeCompare(right.originalPath) || (left.archivePath ?? '').localeCompare(right.archivePath ?? ''));

const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root }).toString();
const inventory = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  workingTreeDirty: dirty.length > 0,
  workingTreeSignature: sha256(dirty),
  archiveRoot: 'archive/tree',
  note: 'Entries are files and symlinks only. Symlinks record their literal readlink target; directories are implied by the paths. Entries marked tracked:false were gitignored local artifacts and must not be assumed present in a fresh clone.',
  totals: {
    entries: entries.length,
    files: entries.filter(entry => entry.type === 'file').length,
    symlinks: entries.filter(entry => entry.type === 'symlink').length,
    bytes: entries.reduce((sum, entry) => sum + (entry.type === 'file' ? entry.bytes : 0), 0),
    untracked: entries.filter(entry => entry.tracked === false).length,
  },
  entries,
};
writeFileSync(path.join(root, 'archive/inventory.json'), JSON.stringify(inventory, null, 2) + '\n');

const migrationMap = {
  schema: 1,
  generatedAt: inventory.generatedAt,
  sourceCommit: head,
  dispositions: ['archive', 'retain-product', 'replace', 'remove-generated', 'copy'],
  actions: actions.map(entry => ({
    originalPath: entry.source,
    archivePath: entry.destination ?? entry.source,
    disposition: entry.disposition,
    productReplacement: entry.productReplacement,
    reason: entry.reason,
  })),
  removedCompatibilityLinks: linkRecords.map(entry => ({ originalPath: entry.originalPath, linkTarget: entry.linkTarget,
    disposition: 'remove-generated', replacement: 'real reports/ directory' , reason: entry.reason })),
  retainedProduct: [
    { originalPath: 'schema/transport.json', disposition: 'replace', replaces: 'source/semantic/server-catalogs.json#packetXorKeyHex', reason: '256-byte packet XOR key is product protocol data; generator no longer reads the archive.' },
    { originalPath: 'tests/unit/protocol-contracts.test.mjs', disposition: 'replace', replaces: 'test/protocol-contracts.test.mjs', reason: 'Protocol compilation and wire round-trip stay active; original-material assertions were removed.' },
    { originalPath: 'tests/tools/delivery.test.mjs', disposition: 'replace', replaces: 'test/tools-delivery.test.mjs', reason: 'Delivery failure paths stay active.' },
    { originalPath: 'tests/tools/verification.test.mjs', disposition: 'replace', replaces: 'test/tools-runner.test.mjs', reason: 'Runner failure, lock and interruption paths stay active; parity-specific cases moved to the archive.' },
    { originalPath: 'client/tests/helpers/recording-canvas.mjs', disposition: 'replace', replaces: 'client/tests/helpers/rendering-oracle.mjs#RenderingCanvas', reason: 'Product tests need the recording context, not the original-WASM probe.' },
    { originalPath: 'schema/content/changelog.json', disposition: 'replace', replaces: 'client/src/schema/menu-content.ts (original changelog table)', reason: 'Menu updates now describe this project, not the 2020 upstream client.' },
  ],
  excludedGenerated: [
    { path: 'build/', reason: 'Local compiler output; recreated by the product build.' },
    { path: 'dist-next/', reason: 'Product delivery output; recreated by build:dist-next.' },
    { path: 'node_modules/', reason: 'Dependency cache.' },
    { path: '.emcache/', reason: 'Emscripten cache.' },
  ],
};
writeFileSync(path.join(root, 'archive/migration-map.json'), JSON.stringify(migrationMap, null, 2) + '\n');
console.log(JSON.stringify({ moved: removed.length, copied: copies.length, entries: entries.length, bytes: inventory.totals.bytes }, null, 2));
