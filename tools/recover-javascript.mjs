#!/usr/bin/env node
/** Reconstruct readable Emscripten JavaScript without optimizing its behavior.
 * Scope-aware identifier edits precede formatting; the Wasm ABI remains untouched.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { specs, commonFunctionLocals } from './javascript-recovery-names.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { parse } = require('acorn');
const { analyze } = require('eslint-scope');
const { minify } = require('terser');
const checkOnly = process.argv.includes('--check');
const upstreamVariant = process.argv.includes('--upstream');
const reportPath = upstreamVariant ? 'reports/upstream-javascript-symbols.json' : 'reports/javascript-symbols.json';
const sha256 = data => createHash('sha256').update(data).digest('hex');
const parserOptions = { ecmaVersion: 2020, sourceType: 'script', ranges: true };
const walk = (node, visit, parent = null) => {
  if (!node?.type) return;
  visit(node, parent);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => child?.type && walk(child, visit, node));
    else if (value?.type) walk(value, visit, node);
  }
};
const canonical = value => JSON.stringify(value, (key, child) => ['start', 'end', 'range', 'loc', 'raw'].includes(key) ? undefined : child);
const scopeTopology = tree => {
  const identifiers = new WeakMap(); let index = 0;
  walk(tree, node => { if (node.type === 'Identifier') identifiers.set(node, index++); });
  const scopes = analyze(tree, { ecmaVersion: 2020, sourceType: 'script', optimistic: true, ignoreEval: false });
  return scopes.scopes.map(scope => ({
    type: scope.type,
    bindings: scope.variables.map(variable => ({
      declarations: variable.identifiers.map(node => identifiers.get(node)),
      references: variable.references.map(reference => identifiers.get(reference.identifier)),
    })),
    unresolved: scope === scopes.globalScope ? scope.through.map(reference => ({ name: reference.identifier.name, index: identifiers.get(reference.identifier) })) : undefined,
  }));
};
const map = { schemaVersion: 1, transformation: 'Lexical alpha-renaming and documented private-property renaming; no optimization or control-flow rewrites.', files: {} };
for (const [name, spec] of Object.entries(specs)) {
  const inputPath = `${upstreamVariant ? 'upstream' : 'web'}/${name}.js`;
  const outputPath = `source/javascript/${upstreamVariant ? 'upstream/' : ''}${name}.js`;
  const original = await fs.readFile(path.join(root, inputPath), 'utf8');
  const ast = parse(original, parserOptions), parents = new WeakMap();
  walk(ast, (node, parent) => parents.set(node, parent));
  const wrapper = ast.body.find(node => node.expression?.callee?.type === 'FunctionExpression').expression.callee;
  const scopeManager = analyze(ast, { ecmaVersion: 2020, sourceType: 'script', optimistic: true, ignoreEval: false });
  const runtimeScope = scopeManager.acquire(wrapper);
  const importNames = {};
  walk(ast, node => {
    if (node.type !== 'VariableDeclarator' || node.id.name !== spec.imports) return;
    for (const property of node.init.properties) {
      const code = original.slice(property.value.start, property.value.end);
      const glMethod = code.match(/\bk\.([A-Za-z_$][\w$]*)\(/)?.[1];
      const direct = property.value.type === 'Identifier' ? spec.names[property.value.name] || property.value.name : null;
      const readable = direct || (glMethod ? `gl${glMethod[0].toUpperCase()}${glMethod.slice(1)}` : null);
      if (readable) importNames[property.key.name ?? property.key.value] = readable;
    }
  });
  if (name === 'sp_server') Object.assign(importNames, { f: 'abort', a: 'emscripten_asm_const_int', b: 'emscripten_asm_const_int', m: 'emscripten_memcpy_big', e: 'abortOutOfMemory', c: 'emscripten_worker_respond', d: 'emscripten_worker_respond_provisionally', h: 'environ_get', i: 'environ_sizes_get', j: 'fd_write', n: 'getentropy', g: 'strftime' });
  // Native363 uses this exact published bridge for counts >=512. Its body is
  // HEAPU8.copyWithin(destination, source, source + length), with ABI key intact.
  if (name === 'client') importNames.Fa = 'emscripten_memcpy_big';
  const edits = new Map(), identifierMappings = [], propertyCounts = {};
  const addEdit = (node, newName, kind) => {
    if (node.name === newName) return;
    const existing = edits.get(node.start);
    if (existing && existing.text !== newName) throw Error(`Conflicting ${kind} edit at ${inputPath}:${node.start}`);
    edits.set(node.start, { start: node.start, end: node.end, text: newName, kind });
  };
  // The asm import object's keys and Module.asm export accesses are a binary ABI.
  const isAbiProperty = node => {
    const parent = parents.get(node);
    if (parent?.type === 'MemberExpression') return parent.object.type === 'MemberExpression' && parent.object.property?.name === 'asm';
    if (parent?.type === 'Property') {
      const object = parents.get(parent), declaration = parents.get(object);
      return declaration?.type === 'VariableDeclarator' && declaration.id.name === spec.imports;
    }
    return false;
  };
  const functionLabel = node => {
    if (node?.id?.name) return spec.names[node.id.name] || node.id.name;
    const parent = parents.get(node);
    if (parent?.type === 'VariableDeclarator') return spec.names[parent.id.name] || parent.id.name;
    if (parent?.type === 'Property' && parents.get(parents.get(parent))?.id?.name === spec.imports && importNames[parent.key.name]) return importNames[parent.key.name];
    if (parent?.type === 'Property') return spec.bridges?.[parent.key.value]?.name || spec.properties[parent.key.name] || parent.key.name || `asmConst_${parent.key.value}`;
    return 'callback';
  };
  const usedNames = new Set();
  scopeManager.scopes.forEach(scope => scope.variables.forEach(variable => usedNames.add(variable.name)));
  scopeManager.globalScope.through.forEach(reference => usedNames.add(reference.identifier.name));
  Object.values(spec.names).forEach(value => usedNames.add(value));
  Object.values(spec.properties).forEach(value => usedNames.add(value));
  // Unique semantic names prevent capturing an outer lexical binding.
  let anonymousCounter = 0;
  const renamedByScope = new WeakMap();
  for (const [scopeIndex, scope] of scopeManager.scopes.entries()) {
    const localNames = new Set(), label = functionLabel(scope.block);
    for (let ancestor = scope.upper; ancestor; ancestor = ancestor.upper) for (const name of renamedByScope.get(ancestor) || []) localNames.add(name);
    renamedByScope.set(scope, localNames);
    for (const [variableIndex, variable] of scope.variables.entries()) {
      if (!variable.identifiers.length) continue; // implicit `arguments`
      let newName, evidence, confidence;
      if (scope.type === 'global' || scope === runtimeScope) {
        newName = spec.names[variable.name];
        if (variable.name === spec.wrapperUndefined && scope === runtimeScope) newName = 'undefinedValue';
        evidence = 'Shipped implementation, literal API names and Module export aliases';
        confidence = 'semantic';
      }
      const parameterIndex = scope.block.params?.findIndex(parameter => parameter.type === 'Identifier' && parameter.name === variable.name) ?? -1;
      if (!newName && parameterIndex >= 0) {
        const property = parents.get(scope.block);
        const bridgeSpec = property?.type === 'Property' && spec.bridges?.[property.key.value];
        newName = bridgeSpec?.parameters?.[parameterIndex] || commonFunctionLocals[label]?.[parameterIndex];
        if (newName) { evidence = `Implementation signature of ${label}`; confidence = 'semantic'; }
      }
      if (!newName && spec.locals?.[label]?.[variable.name]) {
        newName = spec.locals[label][variable.name]; evidence = `Algorithm local in ${label}`; confidence = 'semantic';
      }
      if (!newName) {
        // Descriptive role labels disclose the remaining unknowns rather than inventing game semantics.
        const definition = variable.defs[0], init = definition?.node?.init;
        if (definition?.type === 'CatchClause') newName = 'caughtError';
        else if (init?.type === 'NewExpression' && init.callee.type === 'Identifier') newName = `${init.callee.name[0].toLowerCase()}${init.callee.name.slice(1)}Value`;
        else if (init?.type === 'MemberExpression' && !init.computed && init.property.name.length > 3) newName = `${init.property.name}Value`;
        else if (init?.type === 'CallExpression' && init.callee.type === 'MemberExpression' && init.callee.property.name === 'getContext') newName = 'drawingContext';
        else if (init?.type === 'ArrayExpression') newName = 'values';
        else if (init?.type === 'ObjectExpression') newName = 'record';
        else if (init?.type === 'MemberExpression' && init.property.name === 'length') newName = 'length';
        else if (init?.type === 'CallExpression' && init.callee.type === 'MemberExpression' && ['charCodeAt','getFullYear','getMonth','getDate','getTime'].includes(init.callee.property.name)) newName = ({charCodeAt:'codePoint',getFullYear:'year',getMonth:'month',getDate:'day',getTime:'timestamp'})[init.callee.property.name];
        else if (variable.references.some(reference => parents.get(reference.identifier)?.type === 'UpdateExpression')) newName = 'index';
        else if (definition?.type === 'FunctionName') newName = 'localCallback';
        else newName = parameterIndex >= 0 ? `argument${parameterIndex}` : `localValue${variableIndex}`;
        evidence = 'Syntactic role only; original semantic name unavailable'; confidence = 'unresolved';
      }
      // Repeated short names belong to separate scopes. Preserve a semantic base while
      // avoiding every existing original and recovered name throughout the whole file.
      if (scope !== runtimeScope && scope.type !== 'global') {
        const base = newName;
        while (usedNames.has(newName) || localNames.has(newName)) newName = `${base}_${++anonymousCounter}`;
        // Sibling scopes can reuse readable names; ancestors cannot be captured.
      }
      localNames.add(newName);
      const nodes = new Map(variable.identifiers.map(node => [node.start, node]));
      variable.references.forEach(reference => nodes.set(reference.identifier.start, reference.identifier));
      for (const node of nodes.values()) {
        const parent = parents.get(node);
        if (parent?.type === 'Property' && parent.shorthand) throw Error('Unexpected shorthand property requires an explicit key');
        addEdit(node, newName, 'binding');
      }
      identifierMappings.push({ original: variable.name, readable: newName, scope: scopeIndex, scopeLabel: label, declarationOffset: variable.identifiers[0].start, references: variable.references.length, confidence, evidence });
    }
  }
  walk(ast, node => {
    const parent = parents.get(node);
    if (node.type !== 'Identifier' || isAbiProperty(node)) return;
    const isProperty = parent?.type === 'Property' && parent.key === node && !parent.computed
      || parent?.type === 'MemberExpression' && parent.property === node && !parent.computed;
    if (!isProperty || !spec.properties[node.name]) return;
    addEdit(node, spec.properties[node.name], 'private-property');
    propertyCounts[node.name] = (propertyCounts[node.name] || 0) + 1;
  });
  const replacements = [...edits.values()].sort((a, b) => b.start - a.start);
  let renamed = original;
  for (const edit of replacements) renamed = renamed.slice(0, edit.start) + edit.text + renamed.slice(edit.end);
  const expectedAst = parse(renamed, parserOptions);
  if (JSON.stringify(scopeTopology(ast)) !== JSON.stringify(scopeTopology(expectedAst))) throw Error(`Lexical binding topology changed in ${name}`);
  const result = await minify(renamed, { compress: false, mangle: false, format: { beautify: true, indent_level: 2, comments: true } });
  const banner = `// Recovered from ${inputPath}; generated by tools/recover-javascript.mjs.\n// Semantic names are inferred; binary ABI keys are preserved. See reports/javascript.md.\n`;
  let formatted = result.code;
  for (const [address, bridge] of Object.entries(spec.bridges || {})) formatted = formatted.replace(new RegExp(`(^  *)${address}: function`, 'm'), `$1// ${bridge.name}: embedded native-to-browser bridge (ABI address ${address}).\n$1${address}: function`);
  // Add readable bridge labels beside the compact import keys required by Wasm.
  const formattedAst = parse(formatted, parserOptions), importComments = [];
  walk(formattedAst, node => {
    if (node.type !== 'VariableDeclarator' || node.id.name !== spec.names[spec.imports]) return;
    for (const property of node.init.properties) {
      const readable = importNames[property.key.name];
      if (!readable) continue;
      const column = property.start - formatted.lastIndexOf('\n', property.start) - 1;
      importComments.push({ start: property.start, text: `// ${readable} (Wasm ABI field ${property.key.name}).\n${' '.repeat(column)}` });
    }
  });
  for (const comment of importComments.sort((a,b)=>b.start-a.start)) formatted = formatted.slice(0,comment.start)+comment.text+formatted.slice(comment.start);
  const output = `${banner}${formatted}\n`;
  if (canonical(expectedAst) !== canonical(parse(output, parserOptions))) throw Error(`Formatter changed the executable AST of ${name}`);
  // Verify every original-to-renamed AST difference is exactly an approved identifier edit.
  const approvedAst = structuredClone(ast);
  walk(approvedAst, node => {
    const edit = edits.get(node.start);
    if (edit && node.type === 'Identifier') {
      node.name = edit.text;
    }
  });
  if (canonical(approvedAst) !== canonical(expectedAst)) throw Error(`Non-renaming mutation in ${name}`);
  const abi = { imports: {}, exports: {} };
  walk(ast, node => {
    if (node.type === 'VariableDeclarator' && node.id.name === spec.imports) {
      for (const property of node.init.properties) {
        const code = original.slice(property.value.start, property.value.end);
        const direct = property.value.type === 'Identifier' ? spec.names[property.value.name] || property.value.name : null;
        const calls = [...code.matchAll(/\.([A-Za-z_$][\w$]*)\(/g)].map(match => match[1]);
        abi.imports[property.key.name ?? property.key.value] = { readable: importNames[property.key.name ?? property.key.value] || direct || calls.find(value => !['get','set','push','apply','subarray','forEach'].includes(value)) || 'unresolved_import', sourceOffset: property.value.start };
      }
    }
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.left.object.name === spec.module && node.right.type === 'MemberExpression' && node.right.object.type === 'MemberExpression' && node.right.object.property.name === 'asm') {
      abi.exports[node.right.property.name] = node.left.property.name;
    }
  });
  if (checkOnly) {
    const saved = await fs.readFile(path.join(root, outputPath), 'utf8');
    if (saved !== output) throw Error(`${outputPath} is stale; regenerate it`);
  } else { await fs.mkdir(path.dirname(path.join(root, outputPath)), { recursive: true }); await fs.writeFile(path.join(root, outputPath), output); }
  map.files[name] = { inputPath, outputPath, inputSha256: sha256(original), outputSha256: sha256(output), bindings: identifierMappings, properties: Object.entries(propertyCounts).map(([original, occurrences]) => ({ original, readable: spec.properties[original], occurrences, confidence: 'inferred-private-runtime-property' })), abi, asmConstBridges: spec.bridges, verification: { bindingAndPropertyEditsOnly: true, formatterAstIdentical: true, lexicalBindingTopologyIdentical: true }, summary: { bindings: identifierMappings.length, semanticBindings: identifierMappings.filter(item => item.confidence === 'semantic').length, roleOnlyBindings: identifierMappings.filter(item => item.confidence === 'unresolved').length, privateProperties: Object.keys(propertyCounts).length } };
  console.log(`${name}: ${identifierMappings.length} lexical bindings; ${map.files[name].summary.semanticBindings} semantic; ${Object.keys(propertyCounts).length} private properties; AST verification passed`);
}
const mapText = `${JSON.stringify(map, null, 2)}\n`;
if (checkOnly) {
  if (await fs.readFile(path.join(root, reportPath), 'utf8') !== mapText) throw Error('Symbol report is stale');
} else await fs.writeFile(path.join(root, reportPath), mapText);
