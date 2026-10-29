/** Explicit product test inventory: validation and expansion. */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const MANIFEST_PATH = 'tests/product-tests.json';
export const COMPOSITES = { client: ['client-unit', 'client-integration'] };
const KNOWN = new Set(['unit', 'tools', 'client-unit', 'client-integration', 'integration', 'delivery', 'engine']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(filename));
    else if (entry.isFile()) files.push(filename);
  }
  return files;
}

export async function loadManifest(root = '.') {
  const document = JSON.parse(await readFile(path.join(root, MANIFEST_PATH), 'utf8'));
  if (document.schema !== 1 || typeof document.suites !== 'object') throw new Error('unsupported test manifest');
  return document;
}

/** Validate every suite, and fail when a real test file was omitted. */
export async function validateManifest(root, manifest) {
  const all = [];
  for (const [name, suite] of Object.entries(manifest.suites)) {
    if (!KNOWN.has(name)) throw new Error(`test manifest has unknown suite ${name}`);
    if (name === 'engine') {
      if (suite.runner !== 'ctest' || !Array.isArray(suite.expected) || suite.expected.length === 0)
        throw new Error('test manifest engine suite must be a nonempty ctest inventory');
      continue;
    }
    if (!Array.isArray(suite) || suite.length === 0) throw new Error(`test suite ${name} is empty`);
    const seen = new Set();
    for (const relative of suite) {
      if (typeof relative !== 'string' || !relative.endsWith('.test.mjs'))
        throw new Error(`test suite ${name} has an invalid path`);
      if (relative.startsWith('archive/') || relative.includes('/archive/'))
        throw new Error(`test suite ${name} references the archive: ${relative}`);
      if (relative.includes('*') || relative.includes('?'))
        throw new Error(`test suite ${name} must use explicit files, not globs`);
      if (seen.has(relative)) throw new Error(`test suite ${name} repeats ${relative}`);
      seen.add(relative);
      const absolute = path.join(root, relative);
      const source = await readFile(absolute, 'utf8').catch(error => {
        if (error.code === 'ENOENT') throw new Error(`test suite ${name} is missing ${relative}`);
        throw error;
      });
      if (!/(^|\n)\s*(test|describe)\s*\(/.test(source))
        throw new Error(`test suite ${name} contains no discovered test in ${relative}`);
      all.push(relative);
    }
  }
  const discovered = [
    ...(await walk(path.join(root, 'tests'))),
    ...(await walk(path.join(root, 'client/tests'))),
  ].filter(file => file.endsWith('.test.mjs'))
    .map(file => path.relative(root, file).split(path.sep).join('/'));
  const listed = new Set(all);
  const omitted = discovered.filter(file => !listed.has(file));
  if (omitted.length) throw new Error(`test manifest omits: ${omitted.join(', ')}`);
  return discovered.length;
}

export function expandSuite(manifest, name) {
  if (COMPOSITES[name]) return COMPOSITES[name];
  if (!manifest.suites[name]) throw new Error(`unknown test suite ${name}`);
  return [name];
}

export async function suiteDefinition(manifest, name) {
  const suite = manifest.suites[name];
  if (!suite) throw new Error(`unknown test suite ${name}`);
  return suite;
}
