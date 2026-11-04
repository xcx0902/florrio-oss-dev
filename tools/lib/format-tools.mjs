/**
 * Resolve the pinned formatting toolchain for hand-written files.
 *
 * Every entry point fails closed when a tool is missing or has another
 * version: a formatter difference would silently rewrite hand-written sources,
 * so falling back to an arbitrary installed binary is not allowed.
 *
 * Schema-generated output is never formatted: `tools/generate.mjs` writes the
 * templates verbatim, so these tools only serve `tools/format.mjs`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
