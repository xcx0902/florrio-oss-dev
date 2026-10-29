/** Isolated original-WASM oracle. Extra exports change no original instructions. */
import fs from 'node:fs/promises';
import { withAdditionalExports } from '../../tools/lib/wasm-binary.mjs';
import { typedIndirectCall } from '../../source/runtime/indirect.mjs';

const artifactCache = new Map();
async function artifactBytes(name) {
  if (!artifactCache.has(name)) artifactCache.set(name, await fs.readFile(new URL(`../../web/${name}.wasm`, import.meta.url)));
  return artifactCache.get(name);
}

export async function loadOriginal(name, { functionIds = [], imports = {}, construct = true } = {}) {
  const bytes = await artifactBytes(name);
  const original = new WebAssembly.Module(bytes);
  const entries = [...new Set(functionIds)].map(index => ({ name: `__fn${index}`, index }));
  entries.push({ name: '__stack_pointer', kind: 3, index: 0 });
  const importObject = {};
  for (const entry of WebAssembly.Module.imports(original)) {
    if (entry.kind !== 'function') throw new Error('Unexpected non-function import');
    (importObject[entry.module] ??= {})[entry.name] = () => 0;
  }
  let instance;
  const emptyEnvironment = (countPointer, sizePointer) => {
    const view = new DataView(memory().buffer);
    view.setUint32(countPointer >>> 0, 0, true);
    view.setUint32(sizePointer >>> 0, 0, true);
    return 0;
  };
  if (name === 'sp_server') importObject.a.i = emptyEnvironment;
  else importObject.a.La = emptyEnvironment;
  const writeWithoutOutput = (descriptor, vectors, count, writtenPointer) => {
    const view = new DataView(memory().buffer);
    let total = 0;
    for (let index = 0; index < count; index++) total = (total + view.getUint32(vectors + index * 8 + 4, true)) >>> 0;
    view.setUint32(writtenPointer >>> 0, total, true);
    return 0;
  };
  importObject.a[name === 'sp_server' ? 'j' : 'Oa'] = writeWithoutOutput;
  for (const [module, fields] of Object.entries(imports)) Object.assign(importObject[module] ??= {}, fields);
  instance = (await WebAssembly.instantiate(withAdditionalExports(bytes, entries), importObject)).instance;
  function memory() { return Object.values(instance.exports).find(value => value instanceof WebAssembly.Memory); }
  const runtime = {
    instance, exports: instance.exports, imports: importObject,
    get memory() { return memory(); },
    get table() { return Object.values(instance.exports).find(value => value instanceof WebAssembly.Table); },
    get stackPointer() { return instance.exports.__stack_pointer; },
    call(id, ...args) {
      const fn = instance.exports[`__fn${id}`];
      if (!fn) throw new Error(`Function ${id} was not selected for this oracle`);
      return fn(...args);
    },
    host(module, field, ...args) { return importObject[module][field](...args); },
    indirect(signature, tableIndex, ...args) { return typedIndirectCall(this.table, signature, tableIndex, ...args); },
  };
  if (construct) instance.exports[name === 'sp_server' ? 'p' : 'Nf']();
  return runtime;
}
