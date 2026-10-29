/** Replace selected definitions by typed calls into the recovered JS functions.
 * S-expression boundaries are parsed while ignoring all strings/comments, so
 * embedded payloads cannot be confused with executable declarations.
 */
export function topLevelForms(text) {
  const forms = [];
  let depth = 0, start = -1, quote = false, lineComment = false, blockDepth = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index], next = text[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (quote) {
      if (char === '\\') index++;
      else if (char === '"') quote = false;
      continue;
    }
    if (blockDepth) {
      if (char === '(' && next === ';') { blockDepth++; index++; }
      else if (char === ';' && next === ')') { blockDepth--; index++; }
      continue;
    }
    if (char === ';' && next === ';') { lineComment = true; index++; continue; }
    if (char === '(' && next === ';') { blockDepth++; index++; continue; }
    if (char === '"') { quote = true; continue; }
    if (char === '(') {
      if (depth === 1) start = index;
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 1 && start >= 0) { forms.push({ start, end: index + 1 }); start = -1; }
      if (depth < 0) throw new Error('Unbalanced WAT');
    }
  }
  if (quote || blockDepth || depth) throw new Error('Incomplete WAT');
  return forms;
}

export function makeReadableWat(text, functionInventory, plan) {
  const byName = new Map(functionInventory.map(entry => [entry.name, entry]));
  const byId = new Map(functionInventory.map(entry => [entry.id, entry]));
  const selected = new Set(plan.map(entry => entry.id));
  const replacements = [], imports = [];
  for (const form of topLevelForms(text)) {
    const code = text.slice(form.start, form.end);
    const match = code.match(/^\(func \$([^\s()]+)/);
    if (!match) continue;
    const record = byName.get(match[1]);
    if (!record) throw new Error(`Uninventoried function ${match[1]}`);
    if (!selected.has(record.id)) continue;
    const type = code.match(/\(type (\$[^)]+)\)/)?.[1];
    const signature = [...code.split('\n', 1)[0].matchAll(/\((param|result)\s+[^)]+\)/g)].map(m => m[0]);
    let parameterIndex = 0;
    const parameters = signature.filter(item => item.startsWith('(param')).flatMap(item => {
      const fields = item.slice(7, -1).trim().split(/\s+/);
      if (fields[0].startsWith('$')) { parameterIndex++; return [fields[0]]; }
      return fields.map(() => String(parameterIndex++));
    });
    const importSymbol = `$readable_function_${record.id}`;
    imports.push(`  (import "readable" "f${record.id}" (func ${importSymbol} (type ${type})))\n`);
    const replacement = `(func $${record.name} (type ${type}) ${signature.join(' ')}\n` +
      parameters.map(parameter => `    local.get ${parameter}\n`).join('') + `    call ${importSymbol})`;
    replacements.push({ ...form, text: replacement });
  }
  if (replacements.length !== selected.size) throw new Error('Some recovered functions were not replaced');
  for (const { id } of plan) if (!byId.has(id)) throw new Error(`Unknown function ${id}`);
  // All references in the retained WAT are symbolic; inserting imports shifts
  // numeric indices without changing their logical targets or function table slots.
  const moduleStart = text.indexOf('(module') + '(module'.length;
  replacements.push({ start: moduleStart, end: moduleStart, text: '\n' + imports.join('') });
  const exports = functionInventory.map(record => `  (export "__fn${record.id}" (func $${record.name}))`).join('\n');
  const end = text.lastIndexOf(')');
  replacements.push({ start: end, end, text: '\n' + exports + '\n' +
    '  (export "__stack_pointer" (global $stack_pointer))\n' +
    '  (export "__readable_memory" (memory $linear_memory))\n' +
    '  (export "__readable_table" (table $indirect_function_table))\n' });
  for (const edit of replacements.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return { text, replaced: plan };
}

export function runtimeBootstrap(moduleName) {
  return `// Active recovered gameplay functions; install before Emscripten starts.\n` +
    `var Module = typeof Module === "object" ? Module : {};\n` +
    `(function(config) {\n` +
    `  var baseURL = new URL("./", typeof document !== "undefined" ? document.currentScript.src : self.location.href).href;\n` +
    `  config.instantiateWasm = function(imports, receive) {\n` +
    `    import(new URL("runtime/install.mjs", baseURL).href).then(function(runtime) {\n` +
    `      return runtime.installReadableModule(${JSON.stringify(moduleName)}, imports, config, baseURL, receive);\n` +
    `    }).catch(function(error) { console.error(error); if (config.onAbort) config.onAbort(error); setTimeout(function() { throw error; }, 0); });\n` +
    `    return {};\n` +
    `  };\n` +
    `})(Module);\n`;
}
