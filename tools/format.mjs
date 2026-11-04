#!/usr/bin/env node
/**
 * Format or verify every hand-written product text file.
 *
 *   node tools/format.mjs           # rewrite hand-written files in place
 *   node tools/format.mjs --check   # read-only verification (acceptance gate)
 *
 * File types are routed to a formatter that understands them; there is no
 * catch-all formatter. Schema-generated outputs are out of scope in both
 * modes: tools/generate.mjs writes its templates verbatim, `schema:check`
 * verifies their bytes, and only regeneration may change them
 * (`npm run schema:generate`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PRODUCT_ROOT, loadPrettier, resolveTool } from './lib/format-tools.mjs';

const args = process.argv.slice(2);
for (const arg of args) {
  if (arg !== '--check') {
    throw new Error(`unknown option ${arg}`);
  }
}
const check = args.includes('--check');

const IGNORED_DIRECTORIES = new Set([
  'archive',
  'node_modules',
  'build',
  'dist-next',
  'dist-multiplayer',
  'reports',
  'release',
  '.emcache',
  '.vscode',
  '.git',
  'public',
]);
const PRETTIER_EXTENSIONS = new Set([
  '.ts',
  '.mjs',
  '.js',
  '.json',
  '.yaml',
  '.yml',
  '.md',
  '.html',
  '.css',
]);
const CLANG_EXTENSIONS = new Set(['.cpp', '.hpp', '.h', '.inc']);
const CMAKE_EXTENSIONS = new Set(['.cmake']);
const NOT_FORMATTED = new Set(['package-lock.json']);

/**
 * Tracked plus untracked product files, without build trees or dependencies.
 * Git still lists a deleted-but-unstaged file, so paths absent from disk are
 * dropped: there is nothing left to format.
 */
function listProductFiles() {
  let files;
  try {
    files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: PRODUCT_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }).split('\0');
  } catch {
    files = walk(PRODUCT_ROOT, '');
  }
  return files.filter((file) => file && existsSync(path.join(PRODUCT_ROOT, file))).sort();
}

/** Fallback discovery for a source copy without Git metadata. */
function walk(directory, prefix) {
  const entries = [];
  for (const entry of readdirSync(path.join(directory, prefix), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      entries.push(...walk(directory, prefix ? `${prefix}/${entry.name}` : entry.name));
    } else if (entry.isFile()) {
      entries.push(prefix ? `${prefix}/${entry.name}` : entry.name);
    }
  }
  return entries;
}

function isIgnored(relative) {
  const parts = relative.split('/');
  if (parts.some((part) => IGNORED_DIRECTORIES.has(part))) {
    return true;
  }
  return NOT_FORMATTED.has(parts.at(-1));
}

function classify(relative) {
  if (isIgnored(relative)) {
    return null;
  }
  const name = path.posix.basename(relative);
  const extension = path.posix.extname(relative);
  if (name === 'CMakeLists.txt' || CMAKE_EXTENSIONS.has(extension)) {
    return 'cmake';
  }
  if (CLANG_EXTENSIONS.has(extension)) {
    return 'clang';
  }
  if (PRETTIER_EXTENSIONS.has(extension)) {
    return 'prettier';
  }
  return null;
}

function generatedFiles() {
  const manifest = JSON.parse(
    readFileSync(path.join(PRODUCT_ROOT, 'schema/generated-outputs.json'), 'utf8'),
  );
  return new Set(manifest.outputs.map((entry) => entry.path));
}

/**
 * `.prettierignore` must cover every generated file Prettier could parse.
 * This tool excludes them from its own manifest, but direct CLI and editor use
 * only see the ignore file, so a new generated output has to be listed there.
 */
async function assertGeneratedIgnored(files) {
  if (!files.length) {
    return;
  }
  const prettier = await loadPrettier();
  const ignorePath = path.join(PRODUCT_ROOT, '.prettierignore');
  const missing = [];
  for (const relative of files) {
    const info = await prettier.getFileInfo(relative, { ignorePath });
    if (!info.ignored) {
      missing.push(relative);
    }
  }
  if (missing.length) {
    throw new Error(`generated output missing from .prettierignore: ${missing.join(', ')}`);
  }
}

function run(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, {
    cwd: PRODUCT_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`${label} reported unformatted or failed files:\n${output}`);
  }
}

function packageBin(name) {
  const manifestPath = path.join(PRODUCT_ROOT, 'node_modules', name, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const relative = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[name];
  if (!relative) {
    throw new Error(`${name} does not declare a ${name} executable`);
  }
  return path.resolve(path.dirname(manifestPath), relative);
}

function runPrettier(files, write) {
  if (!files.length) {
    return;
  }
  const prettierArgs = [
    packageBin('prettier'),
    write ? '--write' : '--check',
    '--log-level',
    'warn',
    ...files,
  ];
  run(process.execPath, prettierArgs, 'prettier');
}

function runClangFormat(files, write) {
  if (!files.length) {
    return;
  }
  const tool = resolveTool('clang-format');
  const style = `--style=file:${path.join(PRODUCT_ROOT, '.clang-format')}`;
  const batch = files.filter((file) => path.posix.extname(file) !== '.inc');
  const fragments = files.filter((file) => path.posix.extname(file) === '.inc');
  if (batch.length) {
    const mode = write ? ['-i'] : ['--dry-run', '--Werror'];
    run(tool.command, [style, ...mode, ...batch], 'clang-format');
  }
  for (const file of fragments) {
    const mode = write ? ['-i'] : ['--dry-run', '--Werror'];
    run(tool.command, [style, ...mode, `--assume-filename=${file}.hpp`, file], 'clang-format');
  }
}

function runCmakeFormat(files, write) {
  if (!files.length) {
    return;
  }
  const tool = resolveTool('cmake-format');
  const mode = write ? ['-i'] : ['--check'];
  const config = ['-c', path.join(PRODUCT_ROOT, '.cmake-format.yaml')];
  // cmake-format declares "-c" with nargs="+", so the input file must come
  // first or it is swallowed as another config path.
  for (const file of files) {
    run(tool.command, [file, ...mode, ...config], 'cmake-format');
  }
}

const all = listProductFiles();
const groups = { prettier: [], clang: [], cmake: [] };
for (const relative of all) {
  const kind = classify(relative);
  if (kind) {
    groups[kind].push(relative);
  }
}
const total = groups.prettier.length + groups.clang.length + groups.cmake.length;
if (!total) {
  throw new Error('no formattable product files were discovered');
}

// Generated outputs are owned by tools/generate.mjs, which writes its templates
// verbatim; `schema:check` is their gate. Neither mode here may pass them to a
// formatter: that would desynchronise the bytes from the manifest.
// `.prettierignore` mirrors this for direct CLI use.
const generated = generatedFiles();
const generatedInScope = [...groups.prettier, ...groups.clang, ...groups.cmake].filter((relative) =>
  generated.has(relative),
);
const selected = (kind) => groups[kind].filter((relative) => !generated.has(relative));

await assertGeneratedIgnored(generatedInScope.filter((file) => groups.prettier.includes(file)));

const write = !check;
runPrettier(selected('prettier'), write);
runClangFormat(selected('clang'), write);
runCmakeFormat(selected('cmake'), write);

const versions = {
  'clang-format': resolveTool('clang-format').version,
  'cmake-format': resolveTool('cmake-format').version,
  prettier: (await loadPrettier()).version,
};
console.log(
  JSON.stringify({
    mode: check ? 'check' : 'format',
    files: total,
    generated: generatedInScope.length,
    prettier: groups.prettier.length,
    clang: groups.clang.length,
    cmake: groups.cmake.length,
    tools: versions,
  }),
);
