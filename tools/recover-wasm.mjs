#!/usr/bin/env node
/** Recover complete, rebuildable WAT plus indexed C-like reading views.
 * WAT is the executable source. .dcmp is deliberately labelled pseudocode.
 * No guessed name changes an ABI string, instruction, constant or data byte.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import wabtFactory from 'wabt';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wabt = await wabtFactory();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const semantic = await readJSON(path.join(root, 'source/wasm/semantic-names.json')).catch(() => ({}));
const clientSemantic = await readJSON(path.join(root, 'source/wasm/client-semantic-names.json')).catch(() => ({}));
Object.assign(semantic, clientSemantic);
const abi = await readJSON(path.join(root, 'reports/wasm-abi.json')).catch(() => ({}));
const jsSymbols = await readJSON(path.join(root, 'reports/javascript-symbols.json')).catch(() => ({}));

// WABT 1.0.39's decompiler can assign a new parameter name in a signature
// while retaining its debug local name in the body. Omit local/label debug
// names from the reading-view input, preserving function/global debug names.
function withoutLocalDebugNames(bytes) {
  function decode(buffer, cursor) {
    let n = 0, shift = 0, b;
    do { b = buffer[cursor.offset++]; n |= (b & 127) << shift; shift += 7; } while (b & 128);
    return n >>> 0;
  }
  function encode(n) {
    const out = [];
    do { const b = n & 127; n >>>= 7; out.push(b | (n ? 128 : 0)); } while (n);
    return Buffer.from(out);
  }
  const chunks = [Buffer.from(bytes.subarray(0, 8))], cursor = { offset: 8 };
  while (cursor.offset < bytes.length) {
    const id = bytes[cursor.offset++], length = decode(bytes, cursor);
    let payload = Buffer.from(bytes.subarray(cursor.offset, cursor.offset + length));
    cursor.offset += length;
    if (id === 0) {
      const local = { offset: 0 }, nameLength = decode(payload, local);
      const name = payload.subarray(local.offset, local.offset + nameLength).toString();
      local.offset += nameLength;
      if (name === 'name') {
        const pieces = [payload.subarray(0, local.offset)];
        while (local.offset < payload.length) {
          const start = local.offset, subsection = payload[local.offset++], size = decode(payload, local);
          local.offset += size;
          if (subsection !== 2 && subsection !== 3) pieces.push(payload.subarray(start, local.offset));
        }
        payload = Buffer.concat(pieces);
      }
    }
    chunks.push(Buffer.from([id]), encode(payload.length), payload);
  }
  return Buffer.concat(chunks);
}

// Tokenize identifiers, strings and nested comments, so embedded resource text
// can never accidentally be renamed as if it were executable code.
function renameWat(text, names) {
  return text.replace(/"(?:[^"\\]|\\.)*"|\(;[\s\S]*?;\)|;;[^\n]*|\$[^\s()]+/g,
    token => token[0] === '$' ? names.get(token) ?? token : token);
}

function parseData(text) {
  const segments = [];
  for (const m of text.matchAll(/^  \(data (\$[^ ]+) \(i32\.const (\d+)\) ("(?:[^"\\]|\\.)*")\)/gm)) {
    const literal = m[3].slice(1, -1), bytes = [];
    for (let i = 0; i < literal.length; i++) {
      if (literal[i] !== '\\') bytes.push(literal.charCodeAt(i));
      else {
        const hex = literal.slice(i + 1, i + 3);
        if (/^[\da-f]{2}$/i.test(hex)) { bytes.push(parseInt(hex, 16)); i += 2; }
        else { bytes.push(({ n: 10, r: 13, t: 9, '"': 34, "'": 39, '\\': 92 })[literal[++i]]); }
      }
    }
    segments.push({ symbol: m[1], offset: Number(m[2]), bytes: Buffer.from(bytes) });
  }
  return segments;
}

await fs.mkdir(path.join(root, 'source/wasm'), { recursive: true });
await fs.mkdir(path.join(root, 'reports/wasm'), { recursive: true });
const manifest = { schema: 1, tools: { assembly: 'wabt npm 1.0.39' }, modules: {} };
if (process.env.WASM_DECOMPILE) {
  const version = spawnSync(process.env.WASM_DECOMPILE, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0) throw new Error('Unable to run WASM_DECOMPILE');
  manifest.tools.decompiler = { version: version.stdout.trim(),
    executableSha256: sha(await fs.readFile(process.env.WASM_DECOMPILE)), localDebugNamesOmitted: true };
}

for (const name of ['client', 'sp_server']) {
  const binary = await fs.readFile(path.join(root, 'web', name + '.wasm'));
  const module = wabt.readWasm(binary, { readDebugNames: true });
  module.generateNames(); module.applyNames();
  const rawWat = module.toText({ foldExprs: false, inlineExport: false });
  module.destroy();
  const glue = await fs.readFile(path.join(root, 'web', name + '.js'), 'utf8');
  const exportNames = new Map();
  for (const m of glue.matchAll(/\b[md]\.([_$a-zA-Z][\w$]*)\s*=\s*function\([^)]*\)\{return\([\s\S]{0,150}?\b[md]\.asm\.([\w$]+)/g)) {
    exportNames.set(m[2], m[1].replace(/^_+/, '') || m[1]);
  }
  const exports = [...rawWat.matchAll(/^  \(export "([^"]+)" \((func|memory|table|global) (\$[^)]+)\)\)/gm)]
    .map(m => ({ abi: m[1], kind: m[2], symbol: m[3], publicName: exportNames.get(m[1]) ?? null }));
  const imported = [...rawWat.matchAll(/^  \(import "([^"]+)" "([^"]+)" \(func (\$[^ ]+) (.+)\)\)/gm)]
    .map((m, id) => ({ id, module: m[1], abi: m[2], symbol: m[3], signature: m[4] }));
  const definitions = [...rawWat.matchAll(/^  \(func (\$[^ ]+)([^\n]*)/gm)]
    .map((m, i) => ({ id: imported.length + i, symbol: m[1], signature: m[2], start: m.index }));
  const names = new Map(), used = new Set();
  const records = [...imported, ...definitions];
  for (const record of records) {
    const exported = exports.find(e => e.symbol === record.symbol);
    const manual = semantic[name]?.[record.id];
    const importedName = abi[name]?.imports?.[record.abi] ?? jsSymbols.files?.[name]?.abi?.imports?.[record.abi];
    const bridgeName = typeof importedName === 'string' ? importedName : importedName?.name ?? importedName?.readable;
    const proposed = manual?.name ?? exported?.publicName ?? (bridgeName === 'unresolved_import' ? null : bridgeName);
    const readable = proposed ? proposed.replace(/[^\w]/g, '_') : `function_${record.id}`;
    let unique = readable;
    if (used.has(unique)) unique += '_' + record.id;
    used.add(unique);
    names.set(record.symbol, '$' + unique);
    record.name = unique;
    record.naming = manual ? { ...manual, origin: 'manual-analysis' }
      : exported?.publicName ? { origin: 'javascript-export-assignment', confidence: 'exact-bridge' }
      : proposed ? { origin: 'javascript-import-bridge', confidence: 'inferred-bridge' }
      : { origin: 'binary-function-index', confidence: 'unknown-semantics' };
  }
  // Global and memory/table names describe their machine role, not guessed C++ types.
  names.set('$g0', '$stack_pointer');
  for (const e of exports) {
    if (e.kind === 'memory') names.set(e.symbol, '$linear_memory');
    if (e.kind === 'table') names.set(e.symbol, '$indirect_function_table');
  }
  let wat = renameWat(rawWat, names);
  const comments = new Map(records.map(record => [record.name,
    `  ;; Function #${record.id}; ${record.naming.origin}; ${record.naming.confidence}\n` +
    (record.naming.evidence ? '  ;; ' + String(record.naming.evidence).replace(/\n/g, ' ') + '\n' : '')]));
  wat = wat.replace(/^  \(func \$([^\s()]+)/gm, (full, fn) => (comments.get(fn) ?? '') + full);
  wat = `;; Complete executable source recovered from ${name}.wasm\n;; Original SHA-256: ${sha(binary)}\n;; Anonymous function_N names explicitly retain unresolved semantics.\n;; ABI string keys and every instruction/data byte are preserved.\n` + wat;
  const sourceFile = `source/wasm/${name}.wat`;
  await fs.writeFile(path.join(root, sourceFile), wat);

  // Assert exact binary equivalence now, before publishing the recovery.
  const rebuilt = wabt.parseWat(sourceFile, wat);
  rebuilt.resolveNames(); rebuilt.validate();
  const output = Buffer.from(rebuilt.toBinary({ canonicalize_lebs: true, write_debug_names: false }).buffer);
  rebuilt.destroy();
  if (!binary.equals(output)) throw new Error(`${name}: WAT does not rebuild byte-for-byte`);

  const lines = wat.split('\n');
  const byName = new Map(records.map(record => [record.name, record]));
  let active = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^  \(func \$([^\s()]+)/);
    if (m) { active = byName.get(m[1]); active.watLine = i + 1; active.directCalls = []; active.indirectCalls = 0; }
    if (!active) continue;
    const call = lines[i].match(/^\s+(?:return_)?call \$([^\s()]+)/);
    if (call) active.directCalls.push(call[1]);
    if (/\bcall_indirect\b/.test(lines[i])) active.indirectCalls++;
  }
  for (const record of records) {
    delete record.start;
    if (record.directCalls) record.directCalls = [...new Set(record.directCalls)];
  }
  const data = parseData(wat), strings = [];
  for (const segment of data) {
    for (const m of segment.bytes.toString('latin1').matchAll(/[\x20-\x7e]{4,}/g)) {
      strings.push({ address: segment.offset + m.index, segment: segment.symbol, text: m[0] });
    }
  }
  await fs.writeFile(path.join(root, `reports/wasm/${name}-strings.json`), JSON.stringify(strings, null, 2) + '\n');
  await fs.writeFile(path.join(root, `reports/wasm/${name}-functions.json`), JSON.stringify(records, null, 2) + '\n');

  // Optional C-like pseudocode uses the native build for large functions. The
  // npm WASM build can overflow its own stack on the complete client module.
  const nativeDecompiler = process.env.WASM_DECOMPILE;
  const tempWasm = path.join(root, `reports/wasm/.${name}-named.wasm`);
  const namedModule = wabt.parseWat(sourceFile, wat);
  await fs.writeFile(tempWasm, withoutLocalDebugNames(namedModule.toBinary({ write_debug_names: true }).buffer));
  namedModule.destroy();
  if (nativeDecompiler) {
    await fs.mkdir(path.join(root, 'source/decompiled', name), { recursive: true });
    const dcmpFile = path.join(root, `source/decompiled/${name}.dcmp`);
    const result = spawnSync(nativeDecompiler, [tempWasm, '-o', dcmpFile], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    if (result.status !== 0) throw new Error(`wasm-decompile ${name}: ${result.stderr}`);
    const dcmp = await fs.readFile(dcmpFile, 'utf8');
    const functions = [...dcmp.matchAll(/^(?:export )?function ([\w$]+)\([^\n]*/gm)];
    if (functions.length !== definitions.length) throw new Error(`${name}: incomplete pseudocode coverage`);
    const prefix = functions[0]?.index ?? dcmp.length;
    await fs.writeFile(path.join(root, `source/decompiled/${name}/data-and-imports.dcmp`), dcmp.slice(0, prefix));
    const index = [];
    for (let start = 0; start < functions.length; start += 64) {
      const end = Math.min(start + 64, functions.length);
      const file = `functions-${String(start).padStart(4, '0')}-${String(end - 1).padStart(4, '0')}.dcmp`;
      const chunk = dcmp.slice(functions[start].index, functions[end]?.index ?? dcmp.length);
      await fs.writeFile(path.join(root, `source/decompiled/${name}/${file}`),
        '// Reading view only. Rebuild the corresponding .wat, not this pseudocode.\n' + chunk);
      for (let f = start; f < end; f++) index.push({ function: functions[f][1], file });
    }
    await fs.writeFile(path.join(root, `source/decompiled/${name}/index.json`), JSON.stringify(index, null, 2) + '\n');
    // Keep only the split reading view to avoid two copies of every function.
    await fs.unlink(dcmpFile);
  }
  await fs.unlink(tempWasm);
  manifest.modules[name] = {
    input: `web/${name}.wasm`, inputSha256: sha(binary), source: sourceFile,
    sourceSha256: sha(wat), rebuiltSha256: sha(output), byteIdentical: true,
    imports: imported.length, functions: definitions.length, exports,
    namedFunctions: records.filter(r => r.naming.confidence !== 'unknown-semantics').length,
    unresolvedFunctions: records.filter(r => r.naming.confidence === 'unknown-semantics').length,
    dataSegments: data.length, dataBytes: data.reduce((total, s) => total + s.bytes.length, 0),
    decodedStrings: strings.length, pseudocode: Boolean(nativeDecompiler),
  };
  console.log(`${name}: ${definitions.length} functions, ${data.length} data segments; byte-identical rebuild`);
}
await fs.writeFile(path.join(root, 'reports/wasm/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
