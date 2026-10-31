#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('engine/abi-exports.json', 'utf8'));
const declared = [...manifest.core, ...manifest.diagnostics];
if (new Set([...declared, ...manifest.runtime]).size !== declared.length + manifest.runtime.length) throw new Error('Duplicate ABI export');
const header = await readFile('engine/include/engine/abi.h', 'utf8');
const names = [...header.matchAll(/\b(sp_server_\w+)\s*\(/g)].map(m => m[1]);
if (JSON.stringify(names.sort()) !== JSON.stringify([...declared].sort())) throw new Error('ABI header differs from manifest');
const worker = await readFile('client/static/server-worker.js', 'utf8');
const calls = [...new Set([...worker.matchAll(/exports\.(\w+)\s*\(/g)].map(m => m[1]))];
for (const name of calls) if (![...declared, ...manifest.runtime].includes(name)) throw new Error(`Worker requires undeclared export ${name}`);
const module = new WebAssembly.Module(await readFile('build/wasm/server.wasm'));
const actual = WebAssembly.Module.exports(module).filter(e => e.kind === 'function').map(e => e.name);
const expected = [...declared, ...manifest.runtime];
for (const name of expected) if (!actual.includes(name)) throw new Error(`Missing wasm export ${name}`);
for (const name of actual) if (!expected.includes(name) && !(manifest.toolchain ?? []).includes(name)) throw new Error(`Unexpected wasm ABI ${name}`);
console.log(`ABI consistent: ${declared.length} product exports, ${calls.length} worker calls`);
