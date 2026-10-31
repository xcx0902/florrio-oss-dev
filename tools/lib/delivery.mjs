/** Explicit product assets, independent of obsolete compiler output trees. */
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { listFiles } from './identity.mjs';
export const optionalDiagnosticModules = new Set(['dev/test-api.js']);
export async function deliverySources(root) {
  const assets = JSON.parse(await readFile(path.join(root, 'client/static/assets.json'), 'utf8'));
  if (!Array.isArray(assets) || new Set(assets).size !== assets.length) throw new Error('Invalid static asset allowlist');
  const result = new Map();
  const add = (name, source) => {
    if (typeof name !== 'string' || path.isAbsolute(name) || name.includes('\\') || name.split('/').includes('..') || /(?:\.d\.ts|\.map|\.build\.json)$/.test(name)) throw new Error(`Unsafe product asset ${name}`);
    if (result.has(name)) throw new Error(`Duplicate product asset ${name}`);
    result.set(name, path.join(root, source, name));
  };
  for (const name of assets) add(name, 'client/static');
  for (const name of await listFiles(path.join(root, 'build/client'))) {
    if (!name.endsWith('.js')) throw new Error(`Unexpected compiled asset ${name}`);
    if (!optionalDiagnosticModules.has(name)) add(name, 'build/client');
  }
  add('server.wasm', 'build/wasm');
  for (const [name, source] of result) {
    try { await access(source); } catch { throw new Error(`Missing required compiled file ${name}`); }
  }
  return result;
}
export async function validateAssetGraph(root, files) {
  const names = new Set(files), issues = [];
  for (const name of ['index.html', 'main.js', 'server-worker.js', 'server.wasm']) if (!names.has(name)) issues.push(`Missing required compiled file ${name}`);
  for (const name of files) {
    if (!/\.(?:js|html)$/.test(name)) continue;
    const text = await readFile(path.join(root, name), 'utf8');
    const dependencies = name.endsWith('.js')
      ? [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\bimport\s*)['"](\.[^'"]+)['"]/g)].map(m => m[1])
      : [...text.matchAll(/(?:src|href)=["']([^"'#]+)["']|url\(["']?([^)'"#]+)["']?\)/g)].map(m => m[1] ?? m[2]);
    for (const dependency of dependencies) {
      if (/^(?:https?:|data:|#)/.test(dependency)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), dependency.split('?')[0]));
      if (optionalDiagnosticModules.has(target)) continue;
      if (!names.has(target)) issues.push(`Missing imported asset ${name} -> ${target}`);
    }
  }
  return issues;
}
