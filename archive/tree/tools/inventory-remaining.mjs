#!/usr/bin/env node
/** Inventory the WASM functions that are still machine code in the readable build.
 *
 * Reads the archived WAT, the function index, and the runtime registry, then
 * classifies every unrecovered function by structural shape.  Output is a JSON
 * report plus a short console summary; nothing here builds or tests the game.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recoveredFunctionPlan } from '../source/runtime/registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const OPS = {
  indirectCall: /\bcall_indirect\b/g,
  ifOp: /\bif\b/g,
  loopOp: /\bloop\b/g,
  brOp: /\bbr(_if|_table)?\b/g,
  load: /\b(i32|i64|f32|f64)\.load/g,
  store: /\b(i32|i64|f32|f64)\.store/g,
  globalGet: /\bglobal\.get\b/g,
  globalSet: /\bglobal\.set\b/g,
  select: /\bselect\b/g,
  returnOp: /\breturn\b/g,
  trap: /\bunreachable\b/g,
  memoryOp: /\bmemory\.(grow|size|copy|fill)\b/g,
};

const count = (text, re) => (text.match(re) || []).length;

function bodyEnd(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index++) {
    const char = source[index];
    if (char === '(' && source[index + 1] === ';') {
      const close = source.indexOf(';)', index + 2);
      index = close === -1 ? source.length : close + 1;
      continue;
    }
    if (char === ';' && source[index + 1] === ';') {
      const close = source.indexOf('\n', index + 2);
      index = close === -1 ? source.length : close;
      continue;
    }
    if (char === '"') {
      const close = source.indexOf('"', index + 1);
      index = close === -1 ? source.length : close;
      continue;
    }
    if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return index;
  }
  return -1;
}

async function parseModule(name) {
  const source = await fs.readFile(path.join(root, `source/wasm/${name}.wat`), 'utf8');
  const bodies = new Map();
  const marker = '\n  (func $';
  let cursor = 0;
  let line = 1;
  let lineCursor = 0;
  const lineOf = index => {
    line += source.slice(lineCursor, index).split('\n').length - 1;
    lineCursor = index;
    return line;
  };
  while ((cursor = source.indexOf(marker, cursor)) !== -1) {
    const nameStart = cursor + marker.length;
    const nameEnd = source.indexOf(' ', nameStart);
    const symbol = source.slice(nameStart, nameEnd);
    const open = cursor + 1;
    const headerEnd = source.indexOf('\n', cursor);
    const end = bodyEnd(source, open);
    const text = source.slice(headerEnd, end + 1);
    const id = symbol.startsWith('function_') ? Number(symbol.slice(9)) : null;
    bodies.set(symbol, { id, text, line: lineOf(cursor) });
    cursor = end + 1;
  }
  return bodies;
}

function shape(text) {
  const instructions = text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('(local'));
  const signature = instructions.map(line => line.split(/\s+/)[0]).join(' ');
  return { lines: instructions.length, signature };
}

const report = { generatedFor: 'readable build', modules: {} };
for (const name of ['client', 'sp_server']) {
  const bodies = await parseModule(name);
  const inventory = JSON.parse(await fs.readFile(path.join(root, `reports/wasm/${name}-functions.json`), 'utf8'));
  const bySymbol = new Map();
  for (const entry of inventory) {
    bySymbol.set(entry.symbol.replace(/^\$/, ''), entry);
    if (entry.name) bySymbol.set(entry.name, entry);
  }
  const recovered = new Map(recoveredFunctionPlan(name).map(entry => [entry.id, entry.source]));
  const remaining = [];
  const recoveredSymbols = new Set();
  for (const [symbol, body] of bodies) {
    const info = bySymbol.get(symbol);
    const id = body.id ?? info?.id ?? null;
    if (id !== null && recovered.has(id)) {
      recoveredSymbols.add(symbol);
      continue;
    }
    const { lines, signature } = shape(body.text);
    const calls = [...body.text.matchAll(/\bcall\s+\$([A-Za-z0-9_]+)/g)].map(match => match[1]);
    const calleeIds = calls.map(callee => bySymbol.get(callee)?.id).filter(value => value !== undefined);
    remaining.push({
      id,
      symbol,
      name: info?.name ?? symbol,
      signature: info?.signature ?? '',
      watLine: body.line,
      instructions: lines,
      directCalls: calls.length,
      recoveredCallees: calleeIds.filter(callee => recovered.has(callee)).length,
      indirectCalls: count(body.text, OPS.indirectCall),
      ifs: count(body.text, OPS.ifOp),
      loops: count(body.text, OPS.loopOp),
      branches: count(body.text, OPS.brOp),
      loads: count(body.text, OPS.load),
      stores: count(body.text, OPS.store),
      globals: count(body.text, OPS.globalGet) + count(body.text, OPS.globalSet),
      traps: count(body.text, OPS.trap),
      memoryOps: count(body.text, OPS.memoryOp),
      shapeSignature: signature,
    });
  }
  const groups = new Map();
  for (const entry of remaining) {
    const group = groups.get(entry.shapeSignature) ?? [];
    group.push(entry.id ?? entry.symbol);
    groups.set(entry.shapeSignature, group);
  }
  const ranked = [...groups.entries()]
    .map(([signature, ids]) => ({ signature, ids, size: ids.length }))
    .sort((a, b) => b.size - a.size);
  report.modules[name] = {
    total: bodies.size,
    recovered: recoveredSymbols.size,
    remaining: remaining.length,
    remainingInstructions: remaining.reduce((sum, entry) => sum + entry.instructions, 0),
    leafRemaining: remaining.filter(entry => entry.directCalls === 0 && entry.indirectCalls === 0).length,
    straightLineRemaining: remaining.filter(entry => entry.ifs === 0 && entry.loops === 0 && entry.branches === 0).length,
    topShapes: ranked.slice(0, 25),
    functions: remaining,
  };
  console.log(`${name}: ${bodies.size} defined, ${recoveredSymbols.size} recovered, ${remaining.length} remaining, ` +
    `${report.modules[name].remainingInstructions} instructions, ${report.modules[name].leafRemaining} leaves, ` +
    `${report.modules[name].straightLineRemaining} straight-line`);
}

await fs.writeFile(path.join(root, 'reports/remaining-functions.json'), JSON.stringify(report, null, 1) + '\n');
