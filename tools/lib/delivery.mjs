/** Explicit product assets, independent of obsolete compiler output trees. */
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { listFiles } from './identity.mjs';
export const optionalDiagnosticModules = new Set(['dev/test-api.js']);
export const ONLINE_STATIC_ASSETS = ['index.html', 'connection.json',
  'fonts/ubuntu-bold-latin.woff2', 'fonts/LICENCE.txt'];
export const ONLINE_FORBIDDEN = ['server.wasm', 'server-worker.js', 'worker.js', 'local-worker.js',
  'dev/test-api.js', 'dev/cheat.js'];
export const ONLINE_FORBIDDEN_PREFIXES = ['dev/', 'wasm/'];
export function staticImports(text) {
  // Static import/export-from only. Conditional `import(...)` modules are not
  // part of the production graph and must be audited separately.
  return [...text.matchAll(/(?:\bfrom\s+|\bimport\s+)(['"])(\.[^'"]+)\1/g)].map(match => match[2]);
}
export async function multiplayerSources(root) {
  const result = new Map();
  const add = (name, source) => {
    if (typeof name !== 'string' || path.isAbsolute(name) || name.includes('\\') || name.split('/').includes('..')
      || /(?:\.d\.ts|\.map|\.build\.json)$/.test(name)) throw new Error(`Unsafe online asset ${name}`);
    if (result.has(name)) throw new Error(`Duplicate online asset ${name}`);
    result.set(name, path.join(root, source, name));
  };
  for (const name of ONLINE_STATIC_ASSETS) add(name, 'client/static');
  // The online composition is compiled separately. Follow only its static
  // module graph so Worker/offline modules can never be dragged in by a broad
  // "copy every .js" rule.
  const pending = ['main-online.js'];
  const graph = new Set();
  while (pending.length) {
    const module = pending.pop();
    if (graph.has(module)) continue;
    graph.add(module);
    const text = await readFile(path.join(root, 'build/client', module), 'utf8').catch(() => {
      throw new Error(`Missing compiled online module ${module}`);
    });
    for (const specifier of staticImports(text)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(module), specifier.split('?')[0]));
      if (ONLINE_FORBIDDEN.includes(target) || ONLINE_FORBIDDEN_PREFIXES.some(prefix => target.startsWith(prefix)))
        throw new Error(`Online graph imports forbidden module ${module} -> ${target}`);
      pending.push(target);
    }
  }
  for (const module of graph) {
    if (module === 'main-online.js') result.set('main.js', path.join(root, 'build/client', module));
    else add(module, 'build/client');
  }
  for (const [name, source] of result) {
    try { await access(source); } catch { throw new Error(`Missing required online file ${name}`); }
  }
  return result;
}
export async function validateMultiplayerGraph(root, files) {
  const names = new Set(files), issues = [];
  for (const name of ['index.html', 'main.js', 'connection.json']) if (!names.has(name)) issues.push(`Missing required online file ${name}`);
  for (const name of files) {
    if (ONLINE_FORBIDDEN.includes(name) || ONLINE_FORBIDDEN_PREFIXES.some(prefix => name.startsWith(prefix)))
      issues.push(`Forbidden offline/WASM asset ${name}`);
    if (name.endsWith('.wasm')) issues.push(`Forbidden WASM asset ${name}`);
  }
  for (const name of files) {
    if (!/\.(?:js|html|json)$/.test(name)) continue;
    const text = await readFile(path.join(root, name), 'utf8');
    if (/server-worker\.js|new\s+(?:Shared)?Worker\s*\(|['"][^'"]*\.wasm['"]/.test(text))
      issues.push(`Offline runtime reference in ${name}`);
    if (name.endsWith('.json')) continue;
    const dependencies = name.endsWith('.js')
      ? staticImports(text)
      : [...text.matchAll(/(?:src|href)=["']([^"'#]+)["']|url\(["']?([^)'"#]+)["']?\)/g)].map(m => m[1] ?? m[2]);
    for (const dependency of dependencies) {
      if (/^(?:https?:|data:|#)/.test(dependency)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), dependency.split('?')[0]));
      if (!names.has(target)) issues.push(`Missing imported online asset ${name} -> ${target}`);
    }
  }
  try {
    const config = JSON.parse(await readFile(path.join(root, 'connection.json'), 'utf8'));
    if (config.profile !== 'network') issues.push('connection.json must select the network profile');
    if (typeof config.roomId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(config.roomId)) issues.push('connection.json has an invalid roomId');
  } catch { issues.push('connection.json is not valid JSON'); }
  return issues;
}

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
