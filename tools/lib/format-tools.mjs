/**
 * Resolve the pinned formatting toolchain.
 *
 * Every entry point fails closed when a tool is missing or has another
 * version: a formatter difference would silently change generated output
 * identity, so falling back to an arbitrary installed binary is not allowed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LOCK_FILE = path.join(PRODUCT_ROOT, 'tools/format-tools.lock.json');

/** Read the one authoritative version declaration for external tools. */
export function formatToolLock() {
  return JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
}

const VERSION_OUTPUT = /(\d+\.\d+\.\d+(?:\.\d+)?)/;
const TOOL_ENV = Object.freeze({ 'clang-format': 'CLANG_FORMAT', 'cmake-format': 'CMAKE_FORMAT' });

function firstVersion(output) {
  const match = VERSION_OUTPUT.exec(output);
  return match ? match[1] : null;
}

function runVersion(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, PYTHONWARNINGS: 'ignore' },
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  return firstVersion(`${result.stdout}\n${result.stderr}`);
}

function localCandidates(name) {
  return [
    path.join(PRODUCT_ROOT, '.emcache/tools/format/bin', name),
    path.join(PRODUCT_ROOT, '.emcache/tools/format/Scripts', `${name}.exe`),
  ];
}

/**
 * Locate `name` and verify its exact version.
 *
 * A configured environment variable wins, then the repository-local tool
 * environment, then PATH. The returned command is absolute for local tools and
 * the bare name for PATH tools so spawn keeps the same resolution.
 */
export function resolveTool(name, { env = process.env, pathLookup = true } = {}) {
  const declared = formatToolLock().tools[name];
  if (!declared) {
    throw new Error(`no pinned version for tool ${name}`);
  }
  const configured = env[TOOL_ENV[name]];
  const candidates = [];
  if (configured) {
    candidates.push({ command: configured, required: true });
  }
  for (const file of localCandidates(name)) {
    candidates.push({ command: file, required: false });
  }
  if (pathLookup) {
    candidates.push({ command: name, required: false });
  }

  const observed = [];
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate.command) && !existsSync(candidate.command)) {
      continue;
    }
    const version = runVersion(candidate.command);
    if (!version) {
      continue;
    }
    observed.push(`${candidate.command} (${version})`);
    if (version === declared) {
      return { name, command: candidate.command, version };
    }
  }
  const detail = observed.length ? observed.join(', ') : 'not found';
  const variable = TOOL_ENV[name] ?? name.toUpperCase();
  throw new Error(
    `${name} ${declared} is required for formatting; observed: ${detail}. ` +
      `Run "npm run setup:format" or set ${variable}.`,
  );
}

/** Format C++ source text without touching disk. */
export function formatCppText(content, filename = 'input.hpp', { root = PRODUCT_ROOT } = {}) {
  const tool = resolveTool('clang-format');
  const style = `file:${path.join(root, '.clang-format')}`;
  const result = spawnSync(tool.command, [`--style=${style}`, `--assume-filename=${filename}`], {
    input: content,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: 120000,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`clang-format failed for ${filename}: ${result.stderr}`);
  }
  return result.stdout;
}

/** Format CMake listfile text without touching the product tree. */
export function formatCmakeText(
  content,
  filename = 'CMakeLists.txt',
  { root = PRODUCT_ROOT } = {},
) {
  const tool = resolveTool('cmake-format');
  const directory = mkdtempSync(path.join(os.tmpdir(), 'florrio-cmake-format-'));
  const temporary = path.join(directory, path.basename(filename));
  try {
    writeFileSync(temporary, content, 'utf8');
    const result = spawnSync(
      tool.command,
      [temporary, '-i', '-c', path.join(root, '.cmake-format.yaml')],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000 },
    );
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`cmake-format failed for ${filename}: ${result.stderr}`);
    }
    return readFileSync(temporary, 'utf8');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

let prettierModule = null;

/** Load Prettier as a module and verify its pinned version. */
export async function loadPrettier() {
  if (prettierModule) {
    return prettierModule;
  }
  const require = createRequire(import.meta.url);
  const imported = await import(require.resolve('prettier'));
  const prettier = imported.default ?? imported;
  const declared = formatToolLock().tools.prettier;
  if (prettier.version !== declared) {
    throw new Error(
      `prettier ${declared} is required; installed: ${prettier.version}. Run "npm ci".`,
    );
  }
  prettierModule = prettier;
  return prettier;
}

/** Format one generated text file with the formatter that owns its language. */
export async function formatGeneratedText(relativePath, content, { root = PRODUCT_ROOT } = {}) {
  if (/\.(hpp|h|cpp|inc)$/.test(relativePath)) {
    return formatCppText(content, relativePath, { root });
  }
  if (/(^|\/)CMakeLists\.txt$|\.cmake$/.test(relativePath)) {
    return formatCmakeText(content, relativePath, { root });
  }
  const prettier = await loadPrettier();
  const filepath = path.join(root, relativePath);
  const options = (await prettier.resolveConfig(filepath, { editorconfig: true })) ?? {};
  return prettier.format(content, { ...options, filepath });
}
